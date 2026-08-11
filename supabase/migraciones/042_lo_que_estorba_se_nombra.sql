-- ============================================================================
-- 042 · Lo que estorba se nombra, y lo suelto se ve
--
-- Dos fallas de la misma familia, encontradas al querer borrar SITE PEDRISEÑA:
--
--   1. La base se negó con «tiene un equipo ahí» sin decir CUÁL. El equipo
--      existía —una OLT dada de alta ese mismo día— pero desde la pantalla no
--      había forma de saber cuál era ni dónde buscarlo. Un recado que no
--      nombra lo que estorba no sirve: obliga a adivinar.
--
--   2. La pantalla de la caseta solo enseña lo que está montado en un
--      gabinete. Un equipo que pertenece al sitio pero no se ha montado en
--      ningún rack no aparece en ningún lado: existe, cuenta para las
--      validaciones, y es invisible. Eso es peor que no tenerlo.
--
-- Se arregla el recado, y se agrega la función que lista lo suelto para que la
-- pantalla pueda enseñarlo y ofrecer montarlo o borrarlo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Borrar un sitio: se dice qué estorba, con su nombre
-- ----------------------------------------------------------------------------
/*
 * Se cuentan los equipos Y los elementos. Antes solo se miraban los equipos,
 * así que un ODF amarrado al sitio dejaba borrarlo y quedaba apuntando a un
 * sitio que ya no existe.
 *
 * Y se nombran. Hasta cinco: más que eso ya no se lee, y con cinco nombres
 * cualquiera sabe a dónde ir.
 */
create or replace function public.eliminar_sitio(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid := public.auth_org_id();
  v_nombre   text;
  v_equipos  int;
  v_elem     int;
  v_lista    text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar sitios' using errcode = '42501';
  end if;

  select s.name into v_nombre
    from public.network_sites s where s.id = p_id and s.org_id = v_org;

  if v_nombre is null then
    raise exception 'Ese sitio no existe';
  end if;

  select count(*) into v_equipos
    from public.network_devices d where d.site_id = p_id;

  select count(*) into v_elem
    from public.network_elements e where e.site_id = p_id;

  if v_equipos + v_elem > 0 then
    select string_agg(x.que, ', ')
      into v_lista
      from (
        select d.name as que from public.network_devices d where d.site_id = p_id
        union all
        select e.code from public.network_elements e where e.site_id = p_id
        limit 5
      ) x;

    -- Los dos pedazos se juntan ANTES del recado. Meter dos marcadores
    -- pegados dentro del paréntesis es justo como se cuelan las «s» sueltas
    -- que luego se leen mil veces.
    if v_equipos + v_elem > 5 then
      v_lista := v_lista || ' y más';
    end if;

    raise exception
      'No se puede borrar %: todavía tiene % ahí (%). Muévelos a otro sitio o bórralos primero; los ves en la pestaña de la caseta, abajo del gabinete.',
      v_nombre,
      case when v_equipos + v_elem = 1 then 'una cosa'
           else (v_equipos + v_elem) || ' cosas' end,
      v_lista;
  end if;

  delete from public.network_sites where id = p_id and org_id = v_org;

  return v_nombre;
end;
$$;

comment on function public.eliminar_sitio is
  'Borra un sitio vacío. Si tiene algo, se niega y lo nombra: un recado que no '
  'dice qué estorba obliga a adivinar.';

-- ----------------------------------------------------------------------------
-- 2 · Lo que pertenece al sitio pero no está en ningún gabinete
-- ----------------------------------------------------------------------------
/*
 * Esto es lo que estaba invisible. Un equipo o un elemento puede quedar
 * amarrado a un sitio sin haberse montado nunca en un rack: se dio de alta
 * desde otra pantalla, o se bajó del gabinete y se quedó ahí.
 *
 * Mientras no se vea, no se puede ni montar ni borrar, pero sí estorba para
 * borrar el sitio. La pantalla necesita esta lista para poder ofrecer las dos
 * salidas: subirlo al gabinete, o borrarlo.
 */
create or replace function public.sueltos_del_sitio(p_sitio uuid)
returns table (
  id       uuid,
  que      text,          -- 'equipo' o 'elemento'
  nombre   text,
  tipo     text,
  detalle  text,
  activo   boolean,
  alta     date
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
         'equipo',
         d.name,
         d.device_type,
         nullif(
           concat_ws(' · ',
             nullif(concat_ws(' ', d.vendor, d.model), ''),
             d.mgmt_ip::text,
             case when (select count(*) from public.olt_cards c where c.device_id = d.id) > 0
                  then (select count(*)::text from public.olt_cards c where c.device_id = d.id)
                       || ' tarjetas' end),
           ''),
         d.is_active,
         d.created_at::date
    from public.network_devices d
   where d.site_id = p_sitio
     and d.org_id = public.auth_org_id()
     and not exists (select 1 from public.rack_items i where i.device_id = d.id)

  union all

  select e.id,
         'elemento',
         e.code,
         e.element_type,
         nullif(
           concat_ws(' · ',
             e.name,
             case when (select count(*) from public.odf_ports op where op.odf_id = e.id) > 0
                  then (select count(*)::text from public.odf_ports op where op.odf_id = e.id)
                       || ' puertos'
                  when e.element_type = 'odf' then 'sin bandejas' end),
           ''),
         e.is_active,
         e.created_at::date
    from public.network_elements e
   where e.site_id = p_sitio
     and e.org_id = public.auth_org_id()
     and not exists (select 1 from public.rack_items i where i.element_id = e.id)

   order by 2, 3;
$$;

comment on function public.sueltos_del_sitio is
  'Lo que pertenece a la caseta pero no está montado en ningún gabinete. Si no '
  'se enseña, existe y estorba sin que nadie pueda tocarlo.';

-- ----------------------------------------------------------------------------
-- 3 · Soltar un equipo de su sitio
-- ----------------------------------------------------------------------------
/*
 * La otra salida: en vez de borrarlo, desamarrarlo del sitio. Sirve cuando el
 * equipo sí existe pero se capturó en la caseta equivocada. Se niega si está
 * montado en un rack, porque entonces el rack diría una cosa y el equipo otra.
 */
create or replace function public.sacar_del_sitio(p_id uuid, p_que text default 'equipo')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_nom text;
  v_n   int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  if p_que = 'equipo' then
    select d.name into v_nom from public.network_devices d
     where d.id = p_id and d.org_id = v_org;
    if v_nom is null then
      raise exception 'Ese equipo no existe';
    end if;

    select count(*) into v_n from public.rack_items i where i.device_id = p_id;
    if v_n > 0 then
      raise exception
        '% está montado en un gabinete. Bájalo del rack primero: si no, el rack diría que está ahí y el equipo diría que no.',
        v_nom;
    end if;

    update public.network_devices set site_id = null, updated_at = now() where id = p_id;
  else
    select e.code into v_nom from public.network_elements e
     where e.id = p_id and e.org_id = v_org;
    if v_nom is null then
      raise exception 'Ese elemento no existe';
    end if;

    select count(*) into v_n from public.rack_items i where i.element_id = p_id;
    if v_n > 0 then
      raise exception
        '% está montado en un gabinete. Bájalo del rack primero.', v_nom;
    end if;

    update public.network_elements set site_id = null, updated_at = now() where id = p_id;
  end if;

  return format('%s ya no pertenece a esa caseta. Sigue existiendo; solo quedó sin sitio.', v_nom);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.sueltos_del_sitio(uuid)      from public, anon;
revoke all on function public.sacar_del_sitio(uuid, text)  from public, anon;

grant execute on function public.sueltos_del_sitio(uuid)     to authenticated;
grant execute on function public.sacar_del_sitio(uuid, text) to authenticated;
