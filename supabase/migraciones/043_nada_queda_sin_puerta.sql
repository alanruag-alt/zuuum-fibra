-- ============================================================================
-- 043 · Nada queda sin puerta
--
-- Tercera vez el mismo error, así que aquí se ataja de raíz.
--
-- La pantalla de la caseta se armó alrededor del gabinete: enseña lo que está
-- MONTADO en un rack. Todo lo demás —lo que pertenece al sitio sin estar
-- montado, y peor, lo que no tiene sitio— desaparece de la vista. Y no es que
-- desaparezca nada más: sigue contando para todas las validaciones. Eso deja
-- a quien captura peleando contra una pared:
--
--   · «SITE PEDRISEÑA tiene un equipo» → la OLT existía, sin rack, invisible.
--   · «ODFPEDRI1 tiene 1 puertos ocupados» → el ODF no tiene ni sitio, así que
--     no aparece en ninguna caseta, y su puerto no se puede desconectar desde
--     ningún lado.
--
-- Lo que se hace:
--   1. Los recados dicen QUÉ ocupa, con nombre y número de puerto.
--   2. Se puede listar lo que no tiene sitio, para poder enseñarlo.
--   3. Vaciar un puerto del ODF de un solo movimiento.
--   4. Asignar a una caseta lo que quedó huérfano.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Borrar un elemento: se dice qué lo ocupa
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_elemento(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid := public.auth_org_id();
  v_codigo    text;
  v_tipo      text;
  v_servicios int;
  v_hijos     int;
  v_tramos    int;
  v_spl       int;
  v_puertos   int;
  v_fus       int;
  v_cuelga    int := 0;
  v_quien     text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar elementos de red' using errcode = '42501';
  end if;

  select n.code, n.element_type into v_codigo, v_tipo
    from public.network_elements n where n.id = p_id and n.org_id = v_org;

  if v_codigo is null then
    raise exception 'Ese elemento no existe';
  end if;

  select count(*) into v_servicios
    from public.customer_services s where s.network_element_id = p_id;
  select count(*) into v_hijos
    from public.network_elements n where n.parent_element_id = p_id;
  select count(*) into v_tramos
    from public.fiber_links f where f.from_element_id = p_id or f.to_element_id = p_id;
  select count(*) into v_spl
    from public.splitters s where s.housing_id = p_id and s.is_active;
  select count(*) into v_fus
    from public.fiber_splices f where f.closure_id = p_id and f.status = 'activa';
  select count(*) into v_puertos
    from public.odf_ports op where op.odf_id = p_id and op.status = 'ocupado';

  select count(*) into v_cuelga
    from public.nap_ports np where np.element_id = p_id and np.service_id is not null;

  if v_servicios > 0 or v_cuelga > 0 then
    raise exception
      'No se puede borrar %: %. Pásalos a otra caja primero.',
      v_codigo,
      case when greatest(v_servicios, v_cuelga) = 1 then 'hay un cliente conectado ahí'
           else 'hay ' || greatest(v_servicios, v_cuelga) || ' clientes conectados ahí' end;
  end if;

  if v_spl > 0 then
    select string_agg(s.code, ', ') into v_quien
      from public.splitters s where s.housing_id = p_id and s.is_active;
    raise exception
      'No se puede borrar %: adentro está %. Saca el splitter primero.',
      v_codigo, v_quien;
  end if;

  if v_fus > 0 then
    raise exception
      'No se puede borrar %: tiene % fusiones activas adentro. Si de verdad se va, quítalas una por una para saber qué hilos quedan sueltos.',
      v_codigo, v_fus;
  end if;

  /*
   * Aquí estaba el recado que dejó a Alan buscando a ciegas. Decía «tiene 1
   * puertos ocupados» sin decir cuál puerto, qué le entra ni qué le sale, así
   * que no había por dónde empezar. Ahora se nombra todo y se dice dónde
   * desconectarlo.
   */
  if v_puertos > 0 then
    select string_agg(
             format('bandeja %s puerto %s%s%s',
               op.tray_number, op.port_number,
               case when d.name is not null
                    then format(' (le entra el PON %s/%s de %s)',
                                ca.slot_number, pp.port_number, d.name)
                    else '' end,
               case when c.code is not null
                    then format(' (sale a %s hilo %s)', c.code, st.strand_number)
                    else '' end),
             ', ' order by op.tray_number, op.port_number)
      into v_quien
      from public.odf_ports op
      left join public.pon_ports pp on pp.id = op.pon_port_id
      left join public.olt_cards ca on ca.id = pp.card_id
      left join public.network_devices d on d.id = ca.device_id
      left join public.fiber_strands st on st.id = op.out_strand_id
      left join public.fiber_cables c on c.id = st.cable_id
     where op.odf_id = p_id and op.status = 'ocupado';

    raise exception
      'No se puede borrar %: todavía tiene conectado %. Desconéctalo primero desde la pestaña de la caseta, en el renglón de ese puerto; si no, quedarían cables sin origen.',
      v_codigo, v_quien;
  end if;

  if v_hijos > 0 then
    raise exception 'No se puede borrar %: hay % elementos que cuelgan de ahí.', v_codigo, v_hijos;
  end if;

  if v_tramos > 0 then
    raise exception
      'No se puede borrar %: hay % cables amarrados a ese punto. Suéltalos primero.',
      v_codigo, v_tramos;
  end if;

  delete from public.network_elements where id = p_id and org_id = v_org;

  return v_codigo;
end;
$$;

comment on function public.eliminar_elemento is
  'Borra un elemento vacío. Si algo lo ocupa, lo nombra con puerto y todo: un '
  'recado que no dice qué estorba deja a quien captura buscando a ciegas.';

-- ----------------------------------------------------------------------------
-- 2 · Vaciar un puerto del ODF de un solo movimiento
-- ----------------------------------------------------------------------------
/*
 * Un puerto ocupado puede traer dos cosas: el latiguillo de la OLT por un
 * lado, y el hilo del cable de la calle por el otro. Quitarlas eran dos
 * llamadas distintas en dos botones distintos, y quien solo quiere dejar el
 * puerto libre no tiene por qué saber eso.
 *
 * Se dice qué se desconectó, y se avisa si aguas abajo colgaba gente: soltar
 * el hilo de un ODF es dejar sin luz todo lo que venía detrás.
 */
create or replace function public.vaciar_puerto_odf(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_p   record;
  v_n   int := 0;
  v_hizo text := '';
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select op.id, op.pon_port_id, op.out_strand_id, op.tray_number, op.port_number,
         e.code as odf
    into v_p
    from public.odf_ports op
    join public.network_elements e on e.id = op.odf_id
   where op.id = p_id and op.org_id = v_org;

  if v_p.id is null then
    raise exception 'Ese puerto del ODF no existe';
  end if;

  if v_p.out_strand_id is not null then
    select count(*) into v_n
      from public.aguas_abajo(v_p.out_strand_id) a where a.que = 'cliente';
    perform public.soltar_cable(p_id);
    v_hizo := 'el cable';
  end if;

  if v_p.pon_port_id is not null then
    perform public.despatchear(p_id);
    v_hizo := case when v_hizo = '' then 'el latiguillo'
                   else v_hizo || ' y el latiguillo' end;
  end if;

  if v_hizo = '' then
    return format('La bandeja %s puerto %s de %s ya estaba libre.',
                  v_p.tray_number, v_p.port_number, v_p.odf);
  end if;

  return format('Se quitó %s de la bandeja %s puerto %s de %s. Ya quedó libre.%s',
    v_hizo, v_p.tray_number, v_p.port_number, v_p.odf,
    case when v_n > 0
         then format(' Ojo: de ahí colgaban %s clientes, que acaban de quedarse sin señal.', v_n)
         else '' end);
end;
$$;

comment on function public.vaciar_puerto_odf is
  'Deja libre un puerto del ODF: quita el latiguillo de la OLT y el hilo del cable, de un jalón.';

-- ----------------------------------------------------------------------------
-- 3 · Lo que no tiene caseta
-- ----------------------------------------------------------------------------
/*
 * Un equipo o un elemento sin sitio no aparece en ninguna caseta, así que hoy
 * no aparece en ningún lado. Es el caso de ODFPEDRI1: existe, tiene un puerto
 * ocupado, estorba para borrarlo, y no hay pantalla que lo enseñe.
 *
 * Con esto la pantalla puede ofrecer una caseta más —«sin caseta asignada»—
 * donde caen todos los huérfanos y se pueden componer.
 */
create or replace function public.sin_caseta()
returns table (
  id      uuid,
  que     text,
  nombre  text,
  tipo    text,
  detalle text,
  activo  boolean,
  alta    date
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
   where d.site_id is null
     and d.org_id = public.auth_org_id()
     and d.device_type in ('olt', 'switch', 'router', 'servidor')

  union all

  select e.id,
         'elemento',
         e.code,
         e.element_type,
         nullif(
           concat_ws(' · ',
             e.name,
             case when (select count(*) from public.odf_ports op where op.odf_id = e.id) > 0
                  then (select count(*) filter (where op.status <> 'libre')::text
                          from public.odf_ports op where op.odf_id = e.id)
                       || ' de '
                       || (select count(*)::text from public.odf_ports op where op.odf_id = e.id)
                       || ' puertos ocupados' end),
           ''),
         e.is_active,
         e.created_at::date
    from public.network_elements e
   where e.site_id is null
     and e.org_id = public.auth_org_id()
     and e.element_type = 'odf'

   order by 2, 3;
$$;

comment on function public.sin_caseta is
  'Lo que existe pero no pertenece a ninguna caseta. Si no se enseña, estorba sin que nadie pueda tocarlo.';

-- ----------------------------------------------------------------------------
-- 4 · Asignarle una caseta
-- ----------------------------------------------------------------------------
create or replace function public.asignar_a_sitio(
  p_id    uuid,
  p_que   text,
  p_sitio uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_nom   text;
  v_sitio record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select s.id, s.name, s.zone_id, s.latitude, s.longitude into v_sitio
    from public.network_sites s where s.id = p_sitio and s.org_id = v_org;

  if v_sitio.id is null then
    raise exception 'Esa caseta no existe';
  end if;

  if p_que = 'equipo' then
    update public.network_devices
       set site_id = v_sitio.id,
           zone_id = coalesce(zone_id, v_sitio.zone_id),
           updated_at = now()
     where id = p_id and org_id = v_org
    returning name into v_nom;
  else
    update public.network_elements
       set site_id = v_sitio.id,
           zone_id = coalesce(zone_id, v_sitio.zone_id),
           -- Si no tenía coordenadas, hereda las de la caseta: así deja de
           -- caer en el mar frente a África cuando se dibuja el mapa.
           latitude  = coalesce(latitude, v_sitio.latitude),
           longitude = coalesce(longitude, v_sitio.longitude),
           updated_at = now()
     where id = p_id and org_id = v_org
    returning code into v_nom;
  end if;

  if v_nom is null then
    raise exception 'Eso no existe';
  end if;

  return format('%s ya pertenece a %s. Ahí lo vas a ver de aquí en adelante.', v_nom, v_sitio.name);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.vaciar_puerto_odf(uuid)            from public, anon;
revoke all on function public.sin_caseta()                       from public, anon;
revoke all on function public.asignar_a_sitio(uuid, text, uuid)  from public, anon;

grant execute on function public.vaciar_puerto_odf(uuid)           to authenticated;
grant execute on function public.sin_caseta()                      to authenticated;
grant execute on function public.asignar_a_sitio(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6 · Todo lo de la caseta, esté montado o no
-- ----------------------------------------------------------------------------
/*
 * Esta es la función que faltaba, y la raíz de los tres problemas.
 *
 * La pantalla venía sacando los equipos de `rack_items`, o sea: solo lo
 * montado. Aquí se sacan de donde de verdad viven —`network_devices` y
 * `network_elements`— y el rack se pega al lado nada más para decir en qué U
 * está, si es que está.
 *
 * Con `p_sitio` en nulo devuelve los huérfanos: los que no pertenecen a
 * ninguna caseta. Así la pantalla puede ofrecer una caseta más donde caen
 * todos y se pueden componer, en vez de que existan sin que nadie los vea.
 */
create or replace function public.equipos_de_la_caseta(p_sitio uuid default null)
returns table (
  item_id        uuid,
  ref_id         uuid,
  que            text,
  kind           text,
  label          text,
  vendor         text,
  model          text,
  serial         text,
  mgmt_ip        text,
  rack           text,
  posicion       int,
  hasta          int,
  estado         text,
  tarjetas       int,
  puertos_pon    int,
  pon_patcheados int,
  puertos_odf    int,
  odf_libres     int
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         d.id,
         'equipo',
         'olt',
         coalesce(i.label, d.name),
         coalesce(i.vendor, d.vendor),
         coalesce(i.model, d.model),
         i.serial,
         d.mgmt_ip::text,
         r.name,
         i.position,
         case when i.position is null then null else i.position + i.height - 1 end,
         coalesce(i.status, case when d.is_active then 'en_linea' else 'fuera_de_servicio' end),
         (select count(*)::int from public.olt_cards c where c.device_id = d.id),
         (select count(*)::int from public.pon_ports pp
            join public.olt_cards c on c.id = pp.card_id where c.device_id = d.id),
         (select count(*)::int from public.pon_ports pp
            join public.olt_cards c on c.id = pp.card_id
            join public.odf_ports op on op.pon_port_id = pp.id
           where c.device_id = d.id),
         0,
         0
    from public.network_devices d
    left join public.rack_items i on i.device_id = d.id
    left join public.racks r on r.id = i.rack_id
   where d.org_id = public.auth_org_id()
     and d.device_type = 'olt'
     and d.site_id is not distinct from p_sitio

  union all

  select i.id,
         e.id,
         'elemento',
         'odf',
         coalesce(i.label, e.code),
         i.vendor,
         i.model,
         i.serial,
         null,
         r.name,
         i.position,
         case when i.position is null then null else i.position + i.height - 1 end,
         coalesce(i.status, case when e.is_active then 'en_linea' else 'fuera_de_servicio' end),
         0,
         0,
         0,
         (select count(*)::int from public.odf_ports op where op.odf_id = e.id),
         (select count(*)::int from public.odf_ports op
           where op.odf_id = e.id and op.status = 'libre')
    from public.network_elements e
    left join public.rack_items i on i.element_id = e.id
    left join public.racks r on r.id = i.rack_id
   where e.org_id = public.auth_org_id()
     and e.element_type = 'odf'
     and e.site_id is not distinct from p_sitio

   order by 4, 5;
$$;

comment on function public.equipos_de_la_caseta is
  'Las OLT y los ODF de una caseta, montados o no. Con el sitio en nulo, los huérfanos.';

/*
 * Y sus puertos, con el mismo criterio: por caseta, no por gabinete. Sin
 * esto, el puerto de un ODF sin montar no se puede desconectar desde ningún
 * lado — que es justo lo que dejó ODFPEDRI1 sin salida.
 */
create or replace function public.puertos_odf_de_la_caseta(p_sitio uuid default null)
returns setof public.v_puertos_odf
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
    from public.v_puertos_odf v
    join public.network_elements e on e.id = v.odf_id
   where e.org_id = public.auth_org_id()
     and e.site_id is not distinct from p_sitio
   order by v.odf, v.tray_number, v.port_number;
$$;

create or replace function public.puertos_pon_de_la_caseta(p_sitio uuid default null)
returns setof public.v_puertos_pon
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
    from public.v_puertos_pon v
    join public.olt_cards c on c.id = v.card_id
    join public.network_devices d on d.id = c.device_id
   where d.org_id = public.auth_org_id()
     and d.site_id is not distinct from p_sitio
   order by v.olt, v.slot_number, v.port_number;
$$;

revoke all on function public.equipos_de_la_caseta(uuid)      from public, anon;
revoke all on function public.puertos_odf_de_la_caseta(uuid)  from public, anon;
revoke all on function public.puertos_pon_de_la_caseta(uuid)  from public, anon;

grant execute on function public.equipos_de_la_caseta(uuid)     to authenticated;
grant execute on function public.puertos_odf_de_la_caseta(uuid) to authenticated;
grant execute on function public.puertos_pon_de_la_caseta(uuid) to authenticated;
