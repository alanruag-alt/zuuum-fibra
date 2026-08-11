-- ============================================================================
-- 038 · Derivar sobre un cable: el nodo va donde se abre la fibra
--
-- Esto sale de leer el sistema que ya traías funcionando. Ahí el trazado no
-- empieza eligiendo un cable de una lista: empieza dando clic ENCIMA de la
-- línea del cable del que vas a derivar. Y en ese punto el sistema pregunta
-- qué nodo se coloca, porque en la calle ahí va algo: una caja, una NAP, o las
-- dos. Un ramal que sale de la nada no existe.
--
-- Lo que me faltaba, dicho en corto:
--
--   1. El hilo se CORTA en una caja. De ahí para abajo ya no viene del ODF,
--      viene de lo que se le empalme en esa caja. Un mismo hilo puede servir
--      un tramo, cortarse, y seguir sirviendo otro — que es exactamente lo de
--      «la fibra se puede usar para varias rutas».
--   2. Al insertar la caja se elige CUÁLES hilos se cortan ahí. No todos: los
--      que se derivan.
--   3. El cable queda enganchado a las cajas de sus extremos, para poder
--      abrirlas y empalmar adentro.
--
--   insertar_caja_en_cable()  la caja sobre la línea, cortando los hilos
--   enganchar_cable()         amarra un cable al diagrama de una caja
--   cerrar_ruta()             guarda el trazo como cable nuevo o existente
--   hilos_de_cable()          los hilos con su ocupación y dónde se cortan
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Dónde se corta cada hilo
-- ----------------------------------------------------------------------------
/*
 * Un hilo cortado en una caja deja de traer luz del ODF aguas abajo de esa
 * caja. Eso no es un estado del hilo —el hilo sigue existiendo entero— es un
 * hecho que ocurre EN UN PUNTO. Por eso va como lista de cajas y no como una
 * columna «cortado sí/no»: un hilo largo puede estar cortado en tres cajas
 * distintas y servir cuatro tramos.
 */
alter table public.fiber_strands
  add column if not exists cut_at jsonb not null default '[]'::jsonb;

comment on column public.fiber_strands.cut_at is
  'Las cajas donde este hilo se corta y se deriva. Aguas abajo de cada una, ya no viene del ODF.';

/*
 * Qué cables se pueden abrir dentro de una caja.
 *
 * Un cable pasa por una caja o termina en ella, y en los dos casos hay que
 * poder verlo en el diagrama de esa caja para empalmar. `from_id`/`to_id` solo
 * alcanzan para los extremos; esto alcanza para los dos casos.
 */
create table if not exists public.closure_cables (
  id         uuid primary key default extensions.gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete restrict,
  closure_id uuid not null references public.network_elements(id) on delete cascade,
  cable_id   uuid not null references public.fiber_cables(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint closure_cables_unico unique (closure_id, cable_id)
);

comment on table public.closure_cables is
  'Qué cables entran al diagrama de cada caja. Sin esto no se puede empalmar adentro.';

create index if not exists closure_cables_caja_idx on public.closure_cables(closure_id);

alter table public.closure_cables enable row level security;

create policy cc_lectura on public.closure_cables for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy cc_escritura on public.closure_cables for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

grant select, insert, update, delete on public.closure_cables to authenticated;

-- ----------------------------------------------------------------------------
-- 2 · Enganchar un cable al diagrama de una caja
-- ----------------------------------------------------------------------------
create or replace function public.enganchar_cable(p_caja uuid, p_cable uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := public.auth_org_id();
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  insert into public.closure_cables (org_id, closure_id, cable_id)
  values (v_org, p_caja, p_cable)
  on conflict (closure_id, cable_id) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3 · Insertar una caja sobre la línea de un cable
-- ----------------------------------------------------------------------------
/*
 * El punto se pega a la línea del cable, no queda donde cayó el clic: la caja
 * va sobre la fibra. De los hilos que se le pasen, cada uno queda marcado como
 * cortado AQUÍ, y si estaba disponible pasa a fusionado, porque a partir de
 * este momento algo se le va a empalmar.
 *
 * Los hilos que no se marcan siguen de largo. Eso es lo normal: en una caja de
 * 24 hilos se derivan dos y pasan veintidós.
 */
create or replace function public.insertar_caja_en_cable(
  p_cable   uuid,
  p_lat     numeric,
  p_lon     numeric,
  p_codigo  text,
  p_nombre  text    default null,
  p_hilos   uuid[]  default null,
  p_nap     boolean default false,
  p_puertos int     default 8
)
returns table (caja_id uuid, nap_id uuid, cortados int, en_metro numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_cb   record;
  v_pega record;
  v_caja uuid;
  v_nap  uuid;
  v_n    int := 0;
  v_h    uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select id, code, zone_id, site_id, path into v_cb
    from public.fiber_cables where id = p_cable and org_id = v_org;

  if v_cb.id is null then
    raise exception 'Ese cable no existe';
  end if;
  if jsonb_array_length(coalesce(v_cb.path, '[]'::jsonb)) < 2 then
    raise exception
      '% todavía no tiene trazo dibujado, así que no hay línea sobre la cual insertar la caja.',
      v_cb.code;
  end if;

  -- Se pega a la línea. Una caja a tres metros del cable se ve mal en el plano
  -- y hace que las distancias del OTDR no cuadren.
  select * into v_pega from public.pegar_a_fibra(p_lat, p_lon, 100);

  if v_pega.cable_id is null then
    raise exception 'Ese punto quedó muy lejos de cualquier fibra dibujada.';
  end if;

  v_caja := public.guardar_elemento(
    p_codigo    => upper(btrim(p_codigo)),
    p_tipo      => case when p_nap then 'nap' else 'closure' end,
    p_nombre    => p_nombre,
    p_zona      => v_cb.zone_id,
    p_capacidad => case when p_nap then p_puertos else null end,
    p_lat       => v_pega.lat,
    p_lon       => v_pega.lon);

  update public.network_elements set site_id = coalesce(v_cb.site_id, site_id)
   where id = v_caja;

  -- El cable que la atraviesa queda abierto en su diagrama.
  perform public.enganchar_cable(v_caja, p_cable);

  -- Los hilos elegidos se cortan aquí.
  if p_hilos is not null then
    foreach v_h in array p_hilos loop
      update public.fiber_strands
         set cut_at = case when cut_at @> to_jsonb(array[v_caja::text])
                           then cut_at else cut_at || to_jsonb(array[v_caja::text]) end,
             status = case when status = 'disponible' then 'fusionado' else status end,
             updated_at = now()
       where id = v_h and cable_id = p_cable and org_id = v_org;
      if found then v_n := v_n + 1; end if;
    end loop;
  end if;

  if p_nap then
    perform public.abrir_puertos_nap(v_caja);
    v_nap := v_caja;
  end if;

  return query select v_caja, v_nap, v_n, round(v_pega.posicion_m, 2);
end;
$$;

comment on function public.insertar_caja_en_cable is
  'Coloca una caja sobre la línea de un cable y corta ahí los hilos que se derivan.';

-- ----------------------------------------------------------------------------
-- 4 · Cerrar la ruta: cable nuevo o cable que ya existe
-- ----------------------------------------------------------------------------
/*
 * Al terminar de marcar, la pregunta es una sola: ¿esto es un cable nuevo, o
 * es la trayectoria de uno que ya está dado de alta?
 *
 * Si es nuevo, se crea con su código y sus hilos. Si es existente, se le
 * reemplaza la trayectoria —y se dice qué tenía antes, porque no hay deshacer.
 *
 * En los dos casos, el cable queda enganchado a las cajas que le quedan en los
 * extremos. Ese enganche es lo que después permite abrir la caja y empalmar:
 * sin él, la caja existe y el cable existe, pero adentro no se ven.
 */
create or replace function public.cerrar_ruta(
  p_ruta    jsonb,
  p_cable   uuid    default null,
  p_codigo  text    default null,
  p_hilos   int     default 12,
  p_tipo    text    default 'adss',
  p_zona    uuid    default null,
  p_deriva  uuid    default null,
  p_margen  numeric default 35
)
returns table (cable_id uuid, codigo text, metros numeric, enganchadas text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_id    uuid;
  v_cod   text;
  v_prev  int := 0;
  v_m     numeric;
  v_nom   text[] := array[]::text[];
  v_pt    jsonb;
  r       record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para dibujar la red' using errcode = '42501';
  end if;

  if jsonb_array_length(coalesce(p_ruta, '[]'::jsonb)) < 2 then
    raise exception 'Marca al menos dos puntos para la ruta.';
  end if;

  if p_cable is null then
    if p_codigo is null or length(btrim(p_codigo)) < 2 then
      raise exception 'Escribe el código del cable nuevo.';
    end if;
    v_id := public.guardar_cable(
      p_codigo => upper(btrim(p_codigo)),
      p_tipo   => coalesce(p_tipo, 'adss'),
      p_hilos  => coalesce(p_hilos, 12),
      p_zona   => p_zona);
    v_cod := upper(btrim(p_codigo));
  else
    select code, jsonb_array_length(coalesce(path, '[]'::jsonb))
      into v_cod, v_prev
      from public.fiber_cables where id = p_cable and org_id = v_org;
    if v_cod is null then
      raise exception 'Ese cable no existe';
    end if;
    v_id := p_cable;
  end if;

  -- El trazo se guarda con la función de siempre, que ya sabe medirlo.
  perform public.guardar_trazo(v_id, p_ruta, 'reemplazar');
  select length_m into v_m from public.fiber_cables where id = v_id;

  -- Enganche: la caja de la que se derivó, más las que queden en los extremos.
  if p_deriva is not null then
    perform public.enganchar_cable(p_deriva, v_id);
    select code into v_cod from public.fiber_cables where id = v_id;
    v_nom := v_nom || (select array_agg(code) from public.network_elements where id = p_deriva);
  end if;

  foreach v_pt in array array[p_ruta -> 0, p_ruta -> (jsonb_array_length(p_ruta) - 1)] loop
    for r in
      select e.id, e.code
        from public.network_elements e
       where e.org_id = v_org and e.is_active
         and e.element_type in ('closure', 'nap', 'odf')
         and e.latitude is not null
         and public.distancia_m(e.latitude, e.longitude,
               (v_pt ->> 0)::numeric, (v_pt ->> 1)::numeric) <= p_margen
    loop
      perform public.enganchar_cable(r.id, v_id);
      if not (r.code = any(v_nom)) then v_nom := v_nom || r.code; end if;
    end loop;
  end loop;

  select code into v_cod from public.fiber_cables where id = v_id;

  return query select v_id, v_cod, round(coalesce(v_m, 0), 2),
    case when array_length(v_nom, 1) is null then null
         else array_to_string(v_nom, ', ') end;
end;
$$;

comment on function public.cerrar_ruta is
  'Guarda el trazo como cable nuevo o sobre uno existente, y lo engancha a las cajas de sus extremos.';

-- ----------------------------------------------------------------------------
-- 5 · Los hilos de un cable, con su ocupación
-- ----------------------------------------------------------------------------
/*
 * Es la lista que se enseña al insertar una caja: cuáles hilos están libres,
 * cuáles ya alimentan algo, y cuáles ya vienen cortados en otra caja. Con eso
 * enfrente uno no vuelve a usar un hilo que ya está dando servicio.
 */
create or replace function public.hilos_de_cable(p_cable uuid)
returns table (
  id       uuid,
  numero   int,
  color    text,
  tubo     int,
  estado   text,
  ocupado  text,
  cortado  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.strand_number, s.color, s.tube_number, s.status,
         public.destino_del_hilo(s.id),
         (select string_agg(e.code, ', ')
            from jsonb_array_elements_text(s.cut_at) t
            join public.network_elements e on e.id = t::uuid)
    from public.fiber_strands s
   where s.cable_id = p_cable and s.org_id = public.auth_org_id()
   order by s.strand_number;
$$;

-- ----------------------------------------------------------------------------
-- 6 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.enganchar_cable(uuid, uuid) from public, anon;
revoke all on function public.insertar_caja_en_cable(uuid, numeric, numeric, text, text, uuid[], boolean, int) from public, anon;
revoke all on function public.cerrar_ruta(jsonb, uuid, text, int, text, uuid, uuid, numeric) from public, anon;
revoke all on function public.hilos_de_cable(uuid) from public, anon;

grant execute on function public.enganchar_cable(uuid, uuid) to authenticated;
grant execute on function public.insertar_caja_en_cable(uuid, numeric, numeric, text, text, uuid[], boolean, int) to authenticated;
grant execute on function public.cerrar_ruta(jsonb, uuid, text, int, text, uuid, uuid, numeric) to authenticated;
grant execute on function public.hilos_de_cable(uuid) to authenticated;
