-- ============================================================================
-- 033 · Las NAP y las cajas van SOBRE la fibra
--
--   margen_fibra()          cuántos metros de tolerancia se aceptan
--   pegar_a_fibra()         el punto exacto de la línea más cercana
--   guardar_elemento()      rehecha: una NAP o una caja sin fibra no entra
--   mover_elemento()        mover tampoco la puede sacar de la línea
--   borrar_trazo()          rehecha: avisa a quién deja huérfano
--
-- Por qué esto vive en la base y no en la pantalla del mapa: una NAP se puede
-- capturar desde el mapa, desde la pestaña Elementos, o mañana desde el
-- celular en la calle. Si la regla vive en el mapa, las otras dos puertas la
-- brincan. Aquí no la brinca nadie.
--
-- Y de paso se gana algo que no se tenía: al pegarla a la línea queda escrito
-- DE QUÉ CABLE cuelga y EN QUÉ METRO del recorrido está. Eso es lo que
-- después contesta «si corto aquí, ¿quién se queda sin internet?».
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · La tolerancia
-- ----------------------------------------------------------------------------
-- Veinticinco metros. Es lo que se desvía el GPS de un celular parado junto al
-- poste, y también lo que uno se corre al dar el clic sobre la línea con el
-- mapa alejado. Más apretado que eso vuelve loco al que captura; más flojo
-- deja pegar NAP a cables que pasan por la otra calle.
insert into public.settings (org_id, key, value, value_type, category, name, description)
select o.id, 'network.margen_fibra', '{"metros": 25}'::jsonb,
       'json', 'network', 'Tolerancia a la fibra',
       'A cuántos metros de la línea del cable se acepta una NAP o una caja de empalme. Más apretado vuelve loco al que captura; más flojo deja pegarlas a cables de otra calle.'
  from public.organizations o
 where not exists (
   select 1 from public.settings s
    where s.org_id = o.id and s.key = 'network.margen_fibra');

create or replace function public.margen_fibra()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (value ->> 'metros')::numeric
       from public.settings
      where org_id = public.auth_org_id() and key = 'network.margen_fibra'),
    25);
$$;

comment on function public.margen_fibra is
  'Metros de tolerancia entre una NAP o caja y la línea del cable.';

-- ----------------------------------------------------------------------------
-- 2 · De qué cable cuelga y en qué punto exacto
-- ----------------------------------------------------------------------------
alter table public.network_elements
  add column if not exists cable_id uuid references public.fiber_cables(id) on delete set null;

alter table public.network_elements
  add column if not exists cable_pos_m numeric(10,2);

comment on column public.network_elements.cable_id is
  'El cable sobre cuya línea está. Se calcula solo al guardar; no se captura.';
comment on column public.network_elements.cable_pos_m is
  'En qué metro del recorrido de ese cable cae, medido desde su inicio.';

create index if not exists elementos_cable_idx
  on public.network_elements(cable_id, cable_pos_m)
  where cable_id is not null;

-- ----------------------------------------------------------------------------
-- 3 · Pegar un punto a la fibra
-- ----------------------------------------------------------------------------
/*
 * Busca la línea de cable más cercana y devuelve el punto EXACTO sobre ella.
 *
 * No devuelve el clic del usuario: devuelve la proyección perpendicular sobre
 * el cable. Así la NAP queda dibujada encima de la línea y no dos metros al
 * lado, que es lo que hace que un plano se vea sucio y que las distancias
 * salgan mal cuando alguien las mide después.
 *
 * Si no hay ninguna línea dentro del margen, no devuelve nada. Quien la llama
 * decide si eso es un error o solo un aviso.
 */
create or replace function public.pegar_a_fibra(
  p_lat    numeric,
  p_lon    numeric,
  p_margen numeric default null
)
returns table (
  cable_id   uuid,
  codigo     text,
  lat        numeric,
  lon        numeric,
  a_metros   numeric,
  posicion_m numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_margen numeric := coalesce(p_margen, public.margen_fibra());
  v_mejor  uuid := null;
  v_cod    text := null;
  v_dist   numeric := null;
  v_pos    numeric := null;
  r        record;
  pr       record;
  pt       record;
begin
  if v_org is null or p_lat is null or p_lon is null then
    return;
  end if;

  for r in
    select c.id, c.code, c.path
      from public.fiber_cables c
     where c.org_id = v_org
       and c.is_active
       and c.path is not null
       and jsonb_array_length(c.path) >= 2
  loop
    select * into pr from public.proyectar_en_ruta(r.path, p_lat, p_lon);
    if pr.distancia_m is not null and (v_dist is null or pr.distancia_m < v_dist) then
      v_dist := pr.distancia_m;
      v_mejor := r.id;
      v_cod := r.code;
      v_pos := pr.posicion_m;
    end if;
  end loop;

  if v_mejor is null or v_dist > v_margen then
    return;
  end if;

  -- Ya se sabe en qué metro del recorrido cae; ahora se traduce ese metro de
  -- vuelta a coordenadas para dejar el punto justo sobre la línea.
  select * into pt
    from public.punto_a_lo_largo(
      (select path from public.fiber_cables where id = v_mejor), v_pos, true);

  return query select v_mejor, v_cod,
                      coalesce(pt.lat, p_lat), coalesce(pt.lon, p_lon),
                      round(v_dist, 2), round(v_pos, 2);
end;
$$;

comment on function public.pegar_a_fibra is
  'El punto exacto sobre la línea de cable más cercana, si hay una dentro del margen.';

-- ----------------------------------------------------------------------------
-- 4 · Guardar un elemento, con la regla puesta
-- ----------------------------------------------------------------------------
/*
 * La regla, dicha completa:
 *
 *   Una NAP o una caja de empalme SIEMPRE va sobre la línea de un cable.
 *   No sobre un poste, no cerca, no aproximadamente: sobre la línea.
 *
 * Es cierto en la calle —la caja se abre donde pasa la fibra, no en otro
 * lado— y volverlo cierto aquí adentro es lo que permite después contestar
 * qué se cae con un corte. Una NAP suelta en el mapa es una NAP que el
 * sistema no sabe alimentar.
 *
 * Los ODF y los splitters no entran en la regla: el ODF vive dentro de la
 * caseta, donde el cable ya terminó.
 */
create or replace function public.guardar_elemento(
  p_id        uuid default null,
  p_codigo    text default null,
  p_tipo      text default 'nap',
  p_nombre    text default null,
  p_zona      uuid default null,
  p_padre     uuid default null,
  p_puerto_pon uuid default null,
  p_capacidad int  default null,
  p_lat       numeric default null,
  p_lon       numeric default null,
  p_notas     text default null,
  p_activo    boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_id     uuid;
  v_tipo   text := p_tipo;
  v_lat    numeric := p_lat;
  v_lon    numeric := p_lon;
  v_cable  uuid := null;
  v_pos    numeric := null;
  v_margen numeric;
  v_hay    int;
  v_cerca  numeric;
  f        record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  -- Al editar uno que ya existe, el tipo sale de la fila: nadie lo manda.
  if p_id is not null then
    select element_type into v_tipo
      from public.network_elements where id = p_id and org_id = v_org;
    if v_tipo is null then
      raise exception 'Esa caja no existe';
    end if;
  end if;

  if v_tipo in ('nap', 'closure') then
    v_margen := public.margen_fibra();

    -- Al editar sin tocar coordenadas se conservan las que ya tenía, y se
    -- vuelven a revisar: si el trazo del cable cambió, es el momento de
    -- enterarse, no dentro de seis meses.
    if v_lat is null and p_id is not null then
      select latitude, longitude into v_lat, v_lon
        from public.network_elements where id = p_id;
    end if;

    if v_lat is null or v_lon is null then
      raise exception
        'Una % va sobre la fibra, así que necesita sus coordenadas. Ponla en el mapa, encima de la línea del cable.',
        case when v_tipo = 'nap' then 'NAP' else 'caja de empalme' end;
    end if;

    select count(*) into v_hay
      from public.fiber_cables c
     where c.org_id = v_org and c.is_active
       and c.path is not null and jsonb_array_length(c.path) >= 2;

    if v_hay = 0 then
      raise exception
        'Todavía no hay ningún cable con su trazo dibujado, y las NAP y las cajas van encima de la fibra. Dibuja primero la ruta del cable en el mapa.';
    end if;

    select * into f from public.pegar_a_fibra(v_lat, v_lon, v_margen);

    if f.cable_id is null then
      -- Se le dice al usuario a cuánto quedó del cable más cercano. «Está
      -- lejos» no ayuda; «está a 340 m» le dice si se equivocó de calle o si
      -- de plano le falta dibujar ese tramo.
      select min(pr.distancia_m) into v_cerca
        from public.fiber_cables c,
             lateral public.proyectar_en_ruta(c.path, v_lat, v_lon) pr
       where c.org_id = v_org and c.is_active
         and c.path is not null and jsonb_array_length(c.path) >= 2;

      raise exception
        'Ahí no pasa ninguna fibra: el cable más cercano queda a % m y la tolerancia es de % m. Una % va sobre la línea del cable. Si el cable sí llega hasta ahí, lo que falta es dibujarle el trazo.',
        round(coalesce(v_cerca, 0)), round(v_margen),
        case when v_tipo = 'nap' then 'NAP' else 'caja de empalme' end;
    end if;

    -- Queda pegada a la línea, no donde cayó el clic.
    v_lat := f.lat;
    v_lon := f.lon;
    v_cable := f.cable_id;
    v_pos := f.posicion_m;
  end if;

  if p_id is null then
    if p_codigo is null or length(btrim(p_codigo)) < 2 then
      raise exception 'Falta el código de la caja (NAP-CUE-012, por ejemplo)';
    end if;

    insert into public.network_elements
      (org_id, element_type, code, name, zone_id, parent_element_id, pon_port_id,
       capacity, latitude, longitude, cable_id, cable_pos_m, notes, is_active, created_by)
    values
      (v_org, v_tipo, upper(btrim(p_codigo)), p_nombre, p_zona, p_padre, p_puerto_pon,
       p_capacidad, v_lat, v_lon, v_cable, v_pos, p_notas, p_activo, auth.uid())
    returning id into v_id;
  else
    update public.network_elements
       set name = coalesce(p_nombre, name), zone_id = coalesce(p_zona, zone_id),
           parent_element_id = coalesce(p_padre, parent_element_id),
           pon_port_id = coalesce(p_puerto_pon, pon_port_id),
           capacity = coalesce(p_capacidad, capacity),
           latitude = coalesce(v_lat, latitude), longitude = coalesce(v_lon, longitude),
           cable_id = coalesce(v_cable, cable_id),
           cable_pos_m = coalesce(v_pos, cable_pos_m),
           notes = coalesce(p_notas, notes), is_active = p_activo, updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa caja no existe';
    end if;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Mover un elemento sin sacarlo de la fibra
-- ----------------------------------------------------------------------------
/*
 * Arrastrar en el mapa escribía directo en la tabla, y por esa puerta se
 * podía sacar una NAP de la línea después de haberla puesto bien. Ahora el
 * arrastre pasa por aquí: si el destino no tiene fibra, no se mueve.
 */
create or replace function public.mover_elemento(
  p_id  uuid,
  p_lat numeric,
  p_lon numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_tipo  text;
  v_cod   text;
  v_cerca numeric;
  f       record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select element_type, code into v_tipo, v_cod
    from public.network_elements where id = p_id and org_id = v_org;
  if v_tipo is null then
    raise exception 'Ese elemento no existe';
  end if;

  if v_tipo not in ('nap', 'closure') then
    update public.network_elements
       set latitude = p_lat, longitude = p_lon, updated_at = now()
     where id = p_id;
    return v_cod || ' movido a su lugar.';
  end if;

  select * into f from public.pegar_a_fibra(p_lat, p_lon, null);

  if f.cable_id is null then
    select min(pr.distancia_m) into v_cerca
      from public.fiber_cables c,
           lateral public.proyectar_en_ruta(c.path, p_lat, p_lon) pr
     where c.org_id = v_org and c.is_active
       and c.path is not null and jsonb_array_length(c.path) >= 2;

    raise exception
      'Ahí no pasa ninguna fibra: la más cercana queda a % m. % se queda donde estaba.',
      round(coalesce(v_cerca, 0)), v_cod;
  end if;

  update public.network_elements
     set latitude = f.lat, longitude = f.lon,
         cable_id = f.cable_id, cable_pos_m = f.posicion_m,
         updated_at = now()
   where id = p_id;

  return v_cod || ' quedó sobre ' || f.codigo || ', en el metro ' ||
         round(f.posicion_m)::text || ' del recorrido.';
end;
$$;

comment on function public.mover_elemento is
  'Mueve un elemento. Las NAP y las cajas solo se pueden mover a donde haya fibra.';

-- ----------------------------------------------------------------------------
-- 6 · Borrar un trazo sin dejar huérfanos callados
-- ----------------------------------------------------------------------------
/*
 * Si se borra el recorrido de un cable, todo lo que colgaba de esa línea se
 * queda sin de qué colgar. Antes eso pasaba en silencio. Ahora se dice cuántos
 * quedaron sueltos, porque son exactamente los que hay que volver a colocar.
 */
-- Antes devolvía void; ahora devuelve el recado. Cambiar el tipo de retorno
-- obliga a tirarla y volverla a crear.
drop function if exists public.borrar_trazo(uuid);

create or replace function public.borrar_trazo(p_cable uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_n   int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar trazos' using errcode = '42501';
  end if;

  update public.fiber_cables set path = null, updated_at = now()
   where id = p_cable and org_id = v_org;

  if not found then
    raise exception 'Ese cable no existe';
  end if;

  update public.poles
     set sort_order = null, span_from_id = null, span_m = null
   where cable_id = p_cable;

  update public.network_elements
     set cable_id = null, cable_pos_m = null, updated_at = now()
   where cable_id = p_cable and org_id = v_org;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return 'Trazo borrado.';
  end if;

  return 'Trazo borrado. ' || v_n ||
         case when v_n = 1
              then ' caja quedó suelta: ya no cuelga de ningún cable.'
              else ' cajas quedaron sueltas: ya no cuelgan de ningún cable.' end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7 · Las que ya estaban puestas
-- ----------------------------------------------------------------------------
/*
 * Repasa lo capturado y pega a su cable todo lo que ya esté sobre una línea.
 * Lo que quede lejos NO se mueve —moverle las coordenadas a alguien sin que se
 * entere es peor que dejarlo mal— y se devuelve la lista para que se revise a
 * mano.
 */
create or replace function public.repasar_sobre_fibra()
-- Los nombres de salida NO se llaman como las columnas de la tabla: dentro de
-- plpgsql un parámetro de salida llamado «code» le gana a network_elements.code
-- y la consulta se vuelve ambigua.
returns table (codigo text, a_metros numeric, quedo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  r     record;
  f     record;
  d     numeric;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  for r in
    select id, code, latitude, longitude
      from public.network_elements
     where org_id = v_org and element_type in ('nap', 'closure')
       and is_active and latitude is not null
  loop
    select * into f from public.pegar_a_fibra(r.latitude, r.longitude, null);

    if f.cable_id is not null then
      update public.network_elements
         set latitude = f.lat, longitude = f.lon,
             cable_id = f.cable_id, cable_pos_m = f.posicion_m,
             updated_at = now()
       where id = r.id;
      return query select r.code, f.a_metros, ('pegada a ' || f.codigo)::text;
    else
      select min(pr.distancia_m) into d
        from public.fiber_cables c,
             lateral public.proyectar_en_ruta(c.path, r.latitude, r.longitude) pr
       where c.org_id = v_org and c.is_active
         and c.path is not null and jsonb_array_length(c.path) >= 2;
      return query select r.code, round(coalesce(d, 0), 2),
                          'sin fibra cerca — revísala a mano'::text;
    end if;
  end loop;
end;
$$;

comment on function public.repasar_sobre_fibra is
  'Pega a su cable las NAP y cajas que ya estén sobre una línea. Las que no, las reporta.';

-- ----------------------------------------------------------------------------
-- 8 · La vista, con el cable a la vista
-- ----------------------------------------------------------------------------
create or replace view public.v_elementos_red with (security_invoker = true) as
select n.id,
       n.org_id,
       n.element_type,
       n.code,
       n.name,
       n.zone_id,
       z.name as zona,
       n.parent_element_id,
       n.capacity,
       n.used_ports,
       n.latitude,
       n.longitude,
       n.split_ratio,
       n.notes,
       n.is_active,
       (select count(*) from public.customer_services s
         where s.network_element_id = n.id and s.status = 'active')          as servicios,
       case
         when n.capacity is null or n.capacity = 0 then null
         else round(100.0 * n.used_ports / n.capacity)
       end                                                                    as ocupacion_pct,
       case
         when n.capacity is null or n.capacity = 0 then 'sin_capacidad'
         when n.used_ports >= n.capacity        then 'lleno'
         when n.used_ports >= n.capacity * 0.85 then 'por_llenarse'
         else 'con_lugar'
       end                                                                    as semaforo,
       -- Las columnas nuevas van al final a propósito: «create or replace
       -- view» solo deja agregar al final, y tirar la vista se llevaría
       -- entre las patas a todo lo que dependa de ella.
       n.cable_id,
       fc.code        as cable,
       n.cable_pos_m
  from public.network_elements n
  left join public.zones z on z.id = n.zone_id
  left join public.fiber_cables fc on fc.id = n.cable_id;

comment on view public.v_elementos_red is
  'NAP, mangas y splitters con su ocupación y de qué cable cuelgan. El '
  'semáforo avisa a los 85 por ciento, no al 100: cuando ya está llena es '
  'tarde para pedir material.';

-- ----------------------------------------------------------------------------
-- 9 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.margen_fibra() from public, anon;
revoke all on function public.pegar_a_fibra(numeric, numeric, numeric) from public, anon;
revoke all on function public.mover_elemento(uuid, numeric, numeric) from public, anon;
revoke all on function public.repasar_sobre_fibra() from public, anon;
revoke all on function public.borrar_trazo(uuid) from public, anon;

grant execute on function public.borrar_trazo(uuid) to authenticated;
grant execute on function public.margen_fibra() to authenticated;
grant execute on function public.pegar_a_fibra(numeric, numeric, numeric) to authenticated;
grant execute on function public.mover_elemento(uuid, numeric, numeric) to authenticated;
grant execute on function public.repasar_sobre_fibra() to authenticated;
