-- ============================================================================
-- 037 · Ramales desde una caja, y un trazo que no se borra solo
--
-- Dos problemas, uno atrás del otro.
--
-- EL BUG: `guardar_trazo` escribía `path = lo que venga`. Punto. Si el cable
-- ya tenía recorrido y alguien dibujaba otra cosa con ese mismo cable
-- seleccionado, el troncal se borraba en silencio. Ni pregunta, ni aviso, ni
-- forma de recuperarlo: el trabajo de una tarde de campo se perdía en un clic.
--
-- EL DISEÑO: de una caja de empalme no sale UN cable, salen VARIOS. Ese es el
-- chiste de la caja. Un troncal llega, se abre, y de ahí arrancan dos, tres o
-- cinco ramales para distintas calles —y a veces el ramal comparte los mismos
-- postes que otro, porque van juntos un tramo.
--
-- Un cable sigue siendo una línea, eso no cambia: lo que se necesitaba era
-- poder DAR DE ALTA otro cable anclado a la caja, en vez de reescribirle el
-- trazo al que ya estaba.
--
--   guardar_trazo()   ahora pide decir si reemplaza o continúa
--   ramal_desde()     un cable nuevo que arranca en una caja
--   cables_de_caja()  qué sale de esta caja
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Guardar un trazo sin destruir el anterior
-- ----------------------------------------------------------------------------
/*
 * Cambia la firma a propósito. Podía haber dejado la de dos parámetros y
 * agregarle el modo con valor por omisión, pero entonces la llamada vieja
 * —la que borra -— seguiría existiendo y funcionando, y este archivo no
 * habría arreglado nada. Que truene al compilar es mejor que que borre en
 * silencio.
 */
drop function if exists public.guardar_trazo(uuid, jsonb);

create or replace function public.guardar_trazo(
  p_cable uuid,
  p_ruta  jsonb,
  p_modo  text default 'reemplazar'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_cab    record;
  v_previo int := 0;
  v_ruta   jsonb;
  v_n      int;
  v_i      int;
  v_m      numeric := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para dibujar la red' using errcode = '42501';
  end if;

  if p_modo not in ('reemplazar', 'continuar') then
    raise exception 'El modo del trazo es «reemplazar» o «continuar», no «%».', p_modo;
  end if;

  select code, path, length_m into v_cab
    from public.fiber_cables where id = p_cable and org_id = v_org;

  if v_cab.code is null then
    raise exception 'Ese cable no existe';
  end if;

  v_previo := jsonb_array_length(coalesce(v_cab.path, '[]'::jsonb));

  if jsonb_array_length(coalesce(p_ruta, '[]'::jsonb)) = 1 then
    raise exception 'Un trazo de un solo punto no es un trazo. Marca al menos dos.';
  end if;

  if p_modo = 'continuar' then
    if v_previo < 2 then
      raise exception
        '% todavía no tiene recorrido, así que no hay de dónde continuar. Guárdalo como recorrido nuevo.',
        v_cab.code;
    end if;
    -- El primer punto del tramo nuevo suele ser el último del viejo, porque
    -- así se dibuja: uno se para en la punta y sigue. Si es el mismo, no se
    -- repite; repetido metería un vano de cero metros en la cuenta.
    if (v_cab.path -> (v_previo - 1)) = (p_ruta -> 0) then
      v_ruta := (v_cab.path) || (p_ruta - 0);
    else
      v_ruta := (v_cab.path) || p_ruta;
    end if;
  else
    v_ruta := p_ruta;
  end if;

  v_n := jsonb_array_length(coalesce(v_ruta, '[]'::jsonb));

  -- La longitud sale del dibujo, no de que alguien la escriba.
  for v_i in 0..(greatest(v_n, 1) - 2) loop
    v_m := v_m + public.distancia_m(
      (v_ruta -> v_i ->> 0)::numeric, (v_ruta -> v_i ->> 1)::numeric,
      (v_ruta -> (v_i + 1) ->> 0)::numeric, (v_ruta -> (v_i + 1) ->> 1)::numeric);
  end loop;

  update public.fiber_cables
     set path = case when v_n >= 2 then v_ruta else null end,
         length_m = case when v_n >= 2 then round(v_m, 2) else length_m end,
         updated_at = now()
   where id = p_cable and org_id = v_org;

  if p_modo = 'continuar' then
    return format('%s se alargó: ahora mide %s m con %s puntos.',
                  v_cab.code, round(v_m), v_n);
  end if;

  if v_previo >= 2 then
    -- Se dice claramente qué se acaba de perder. No hay «deshacer», y quien
    -- lea esto tiene que poder darse cuenta en el momento, no la semana que
    -- viene cuando vaya a buscar el troncal al mapa.
    return format(
      'Se reemplazó el recorrido de %s: tenía %s puntos y %s m, ahora tiene %s puntos y %s m.',
      v_cab.code, v_previo, round(coalesce(v_cab.length_m, 0)), v_n, round(v_m));
  end if;

  return format('Trazo guardado: %s m. La longitud de %s se actualizó con esa medida.',
                round(v_m), v_cab.code);
end;
$$;

comment on function public.guardar_trazo is
  'Guarda el recorrido dibujado. Con «continuar» lo alarga; con «reemplazar» '
  'lo cambia y dice qué se llevó, porque no hay cómo deshacerlo.';

-- ----------------------------------------------------------------------------
-- 2 · Un ramal nuevo desde una caja
-- ----------------------------------------------------------------------------
/*
 * Esto es lo que faltaba de verdad.
 *
 * De una caja de empalme salen varios cables. Antes, para dibujar el segundo
 * ramal había que ir a «Cables», darlo de alta, regresar al mapa, buscarlo en
 * la lista y dibujarlo. Como eso son cuatro pasos y una espera, lo natural era
 * agarrar el cable que ya estaba seleccionado y dibujar encima —y ahí es donde
 * se perdía el troncal.
 *
 * Ahora se le da clic a la caja y el cable nace ahí mismo, anclado a ella, con
 * su primer punto exactamente en sus coordenadas. El ramal queda amarrado a la
 * caja de la que sale, que es lo que después permite contestar «¿qué cuelga de
 * esta caja?».
 */
create or replace function public.ramal_desde(
  p_elemento uuid,
  p_codigo   text,
  p_tipo     text default 'adss',
  p_hilos    int  default 12,
  p_notas    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_el   record;
  v_id   uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select id, code, element_type, zone_id, latitude, longitude, site_id
    into v_el
    from public.network_elements
   where id = p_elemento and org_id = v_org;

  if v_el.id is null then
    -- También se puede ramificar desde un sitio: de la caseta salen los
    -- troncales, y ese es el mismo gesto.
    select s.id, s.name as code, 'site' as element_type, s.zone_id,
           s.latitude, s.longitude, s.id as site_id
      into v_el
      from public.network_sites s
     where s.id = p_elemento and s.org_id = v_org;
  end if;

  if v_el.id is null then
    raise exception 'Ese punto no existe';
  end if;
  if v_el.latitude is null or v_el.longitude is null then
    raise exception
      '% no tiene coordenadas, así que no se sabe dónde empieza el ramal. Ponlo primero en el mapa.',
      v_el.code;
  end if;

  v_id := public.guardar_cable(
    p_codigo   => upper(btrim(p_codigo)),
    p_tipo     => coalesce(p_tipo, 'adss'),
    p_hilos    => coalesce(p_hilos, 12),
    p_zona     => v_el.zone_id,
    p_de_texto => v_el.code,
    p_de_tipo  => case when v_el.element_type in ('odf','closure','nap','splitter')
                       then v_el.element_type else 'site' end,
    p_de_id    => v_el.id,
    p_notas    => p_notas);

  -- El trazo arranca en la caja, no cerca de ella. Un ramal que empieza a
  -- tres metros de su caja se ve mal en el plano y mide de más.
  update public.fiber_cables
     set path = jsonb_build_array(jsonb_build_array(v_el.latitude, v_el.longitude)),
         site_id = coalesce(v_el.site_id, site_id),
         updated_at = now()
   where id = v_id;

  return v_id;
end;
$$;

comment on function public.ramal_desde is
  'Da de alta un cable que arranca en una caja, NAP, ODF o sitio, con su primer punto ahí mismo.';

-- ----------------------------------------------------------------------------
-- 3 · Qué sale de esta caja
-- ----------------------------------------------------------------------------
/*
 * La pregunta de campo: estoy parado frente a la caja abierta, ¿cuántos cables
 * salen de aquí y para dónde va cada uno?
 *
 * Cuenta los que la tienen como origen y también los que la tienen como
 * destino, porque el que llega para uno es el que sale para el otro.
 */
create or replace function public.cables_de_caja(p_elemento uuid)
returns table (
  cable_id uuid,
  codigo   text,
  papel    text,
  hilos    int,
  metros   numeric,
  puntos   int
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.code,
         case when c.from_id = p_elemento then 'sale' else 'llega' end,
         c.fiber_count,
         c.length_m,
         jsonb_array_length(coalesce(c.path, '[]'::jsonb))
    from public.fiber_cables c
   where c.org_id = public.auth_org_id()
     and c.is_active
     and (c.from_id = p_elemento or c.to_id = p_elemento)
   order by 3 desc, 2;
$$;

-- ----------------------------------------------------------------------------
-- 4 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.guardar_trazo(uuid, jsonb, text)         from public, anon;
revoke all on function public.ramal_desde(uuid, text, text, int, text) from public, anon;
revoke all on function public.cables_de_caja(uuid)                     from public, anon;

grant execute on function public.guardar_trazo(uuid, jsonb, text)         to authenticated;
grant execute on function public.ramal_desde(uuid, text, text, int, text) to authenticated;
grant execute on function public.cables_de_caja(uuid)                     to authenticated;
