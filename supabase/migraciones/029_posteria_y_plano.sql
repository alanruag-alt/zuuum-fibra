-- ============================================================================
-- 029 · Postería, vanos y plano CFE
-- ============================================================================
-- Para rentarle postería a CFE hay que entregarles un plano con los postes
-- numerados y el vano de cada tramo. Numerar 300 postes a mano y medir los
-- vanos uno por uno en Google Earth es un día de trabajo, y con un error de
-- dedo el trámite se regresa.
--
-- Aquí el poste se captura con sus coordenadas y ya. El sistema:
--
--   · lo pega al cable que le pasa más cerca (hasta 35 m de la línea),
--   · lo ordena a lo largo del recorrido de ese cable,
--   · le pone número consecutivo,
--   · y calcula el vano contra el poste anterior.
--
-- La distancia se calcula con la fórmula del haversine, en metros. A escala de
-- un municipio da lo mismo que un GPS: el error es de centímetros.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Geometría
-- ----------------------------------------------------------------------------
create or replace function public.distancia_m(
  lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lon2 - lon1) / 2), 2)
  )))::numeric, 2);
$$;

comment on function public.distancia_m is
  'Metros entre dos coordenadas, por haversine. A escala de municipio el error '
  'es de centímetros.';

-- Dónde cae un punto sobre el recorrido de un cable: a qué distancia de la
-- línea, y cuántos metros lleva recorridos. Lo segundo es lo que ordena los
-- postes; sin eso quedarían numerados en el orden en que se capturaron.
create or replace function public.proyectar_en_ruta(
  p_ruta jsonb, p_lat numeric, p_lon numeric
)
returns table (distancia_m numeric, posicion_m numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n      int;
  v_i      int;
  x1 numeric; y1 numeric; x2 numeric; y2 numeric;
  vx numeric; vy numeric; wx numeric; wy numeric;
  t  numeric; px numeric; py numeric;
  d  numeric;
  v_acum   numeric := 0;
  v_mejor  numeric := null;
  v_pos    numeric := null;
  v_tramo  numeric;
  k  numeric;
begin
  v_n := jsonb_array_length(coalesce(p_ruta, '[]'::jsonb));
  if v_n < 2 then
    return;
  end if;

  -- Se trabaja en grados, corrigiendo la longitud por el coseno de la latitud:
  -- a esta escala la Tierra es plana para fines prácticos.
  k := cos(radians(p_lat));

  for v_i in 0..(v_n - 2) loop
    y1 := (p_ruta -> v_i ->> 0)::numeric;
    x1 := (p_ruta -> v_i ->> 1)::numeric * k;
    y2 := (p_ruta -> (v_i + 1) ->> 0)::numeric;
    x2 := (p_ruta -> (v_i + 1) ->> 1)::numeric * k;

    vx := x2 - x1; vy := y2 - y1;
    wx := p_lon * k - x1; wy := p_lat - y1;

    if (vx * vx + vy * vy) = 0 then
      t := 0;
    else
      t := (wx * vx + wy * vy) / (vx * vx + vy * vy);
      t := greatest(0, least(1, t));
    end if;

    px := x1 + t * vx;
    py := y1 + t * vy;

    d := public.distancia_m(p_lat, p_lon, py, px / nullif(k, 0));

    v_tramo := public.distancia_m(
      (p_ruta -> v_i ->> 0)::numeric, (p_ruta -> v_i ->> 1)::numeric,
      (p_ruta -> (v_i + 1) ->> 0)::numeric, (p_ruta -> (v_i + 1) ->> 1)::numeric);

    if v_mejor is null or d < v_mejor then
      v_mejor := d;
      v_pos   := v_acum + t * v_tramo;
    end if;

    v_acum := v_acum + v_tramo;
  end loop;

  distancia_m := v_mejor;
  posicion_m  := v_pos;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2 · Postes
-- ----------------------------------------------------------------------------
create table if not exists public.poles (
  id           uuid primary key default extensions.gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  zone_id      uuid references public.zones(id) on delete set null,
  cable_id     uuid references public.fiber_cables(id) on delete set null,
  code         text,
  number       integer,
  sort_order   integer,
  latitude     numeric(10,7),
  longitude    numeric(10,7),
  pole_type    text not null default 'cfe_concreto'
               check (pole_type in ('cfe_concreto','cfe_madera','propio','telmex','otro')),
  owner        text,
  height_m     numeric(5,2),
  is_new       boolean not null default false,
  span_from_id uuid references public.poles(id) on delete set null,
  span_m       numeric(10,2),
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null
);

comment on table public.poles is
  'Los postes por donde va la fibra. El número y el vano no se capturan: se '
  'calculan a partir de las coordenadas y del recorrido del cable.';
comment on column public.poles.is_new is
  'Poste nuevo que hay que plantar. CFE lo cuenta aparte en el trámite.';

create index if not exists postes_cable_idx on public.poles(cable_id, sort_order);
create index if not exists postes_zona_idx  on public.poles(org_id, zone_id) where is_active;

select public.poner_tocar_actualizado('poles');

alter table public.poles enable row level security;

create policy postes_lectura on public.poles for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy postes_escritura on public.poles for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

grant select, insert, update, delete on public.poles to authenticated;
select public.poner_auditoria('poles');

-- ----------------------------------------------------------------------------
create or replace function public.guardar_poste(
  p_id      uuid    default null,
  p_lat     numeric default null,
  p_lon     numeric default null,
  p_tipo    text    default 'cfe_concreto',
  p_zona    uuid    default null,
  p_cable   uuid    default null,
  p_codigo  text    default null,
  p_altura  numeric default null,
  p_nuevo   boolean default false,
  p_notas   text    default null,
  p_activo  boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para capturar postería' using errcode = '42501';
  end if;

  if p_id is null then
    if p_lat is null or p_lon is null then
      raise exception 'Un poste sin coordenadas no sirve para el plano';
    end if;

    insert into public.poles
      (org_id, zone_id, cable_id, code, latitude, longitude, pole_type,
       height_m, is_new, notes, is_active, created_by)
    values
      (v_org, p_zona, p_cable, p_codigo, p_lat, p_lon, coalesce(p_tipo, 'cfe_concreto'),
       p_altura, coalesce(p_nuevo, false), p_notas, coalesce(p_activo, true), auth.uid())
    returning id into v_id;
  else
    update public.poles
       set zone_id   = p_zona,
           cable_id  = p_cable,
           code      = p_codigo,
           latitude  = coalesce(p_lat, latitude),
           longitude = coalesce(p_lon, longitude),
           pole_type = coalesce(p_tipo, pole_type),
           height_m  = p_altura,
           is_new    = coalesce(p_nuevo, is_new),
           notes     = p_notas,
           is_active = coalesce(p_activo, is_active),
           updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese poste no existe';
    end if;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
create or replace function public.eliminar_poste(p_id uuid)
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
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar postes' using errcode = '42501';
  end if;

  -- El vano del siguiente poste apuntaba a este. Se limpia para que no quede
  -- una medida colgando de algo que ya no existe.
  update public.poles set span_from_id = null, span_m = null
   where span_from_id = p_id;

  delete from public.poles where id = p_id and org_id = v_org;

  if not found then
    raise exception 'Ese poste no existe';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3 · Numeración y vanos
-- ----------------------------------------------------------------------------
create or replace function public.renumerar_postes(
  p_cable    uuid    default null,
  p_respetar boolean default false,
  p_margen   numeric default 35
)
returns table (postes int, vanos int, sueltos int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  r        record;
  c        record;
  v_mejor  uuid;
  v_dist   numeric;
  v_pos    numeric;
  pr       record;
  v_n      int := 0;
  v_v      int := 0;
  v_s      int := 0;
  v_libre  int;
  v_num    int;
  v_ant    record;
  v_i      int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para renumerar' using errcode = '42501';
  end if;

  -- Paso 1: cada poste se pega al cable que le pase más cerca.
  for r in
    select p.* from public.poles p
     where p.org_id = v_org and p.is_active
       and p.latitude is not null and p.longitude is not null
       and (p_cable is null or p.cable_id = p_cable or p.cable_id is null)
  loop
    v_mejor := null; v_dist := null; v_pos := null;

    for c in
      select cb.id, cb.path from public.fiber_cables cb
       where cb.org_id = v_org and cb.is_active
         and jsonb_array_length(coalesce(cb.path, '[]'::jsonb)) >= 2
         and (p_cable is null or cb.id = p_cable)
    loop
      select * into pr from public.proyectar_en_ruta(c.path, r.latitude, r.longitude);
      if pr.distancia_m is not null and (v_dist is null or pr.distancia_m < v_dist) then
        v_dist := pr.distancia_m; v_mejor := c.id; v_pos := pr.posicion_m;
      end if;
    end loop;

    if v_mejor is not null and v_dist <= p_margen then
      update public.poles set cable_id = v_mejor, sort_order = round(v_pos)::int
       where id = r.id;
    else
      -- Un poste lejos de toda ruta no se inventa: se marca como suelto para
      -- que alguien revise si le falta el trazo al cable o si el poste está
      -- mal ubicado.
      update public.poles set cable_id = null, sort_order = null,
                              span_from_id = null, span_m = null
       where id = r.id;
      v_s := v_s + 1;
    end if;
    v_n := v_n + 1;
  end loop;

  -- Paso 2: numerar y medir vanos, cable por cable.
  if p_respetar then
    select coalesce(max(number), 0) into v_libre
      from public.poles where org_id = v_org;
  else
    v_libre := 0;
    update public.poles set number = null where org_id = v_org
      and (p_cable is null or cable_id = p_cable);
  end if;

  v_num := v_libre;

  for c in
    select cb.id from public.fiber_cables cb
     where cb.org_id = v_org and cb.is_active
       and (p_cable is null or cb.id = p_cable)
     order by cb.code
  loop
    v_ant := null;
    v_i := 0;

    for r in
      select p.* from public.poles p
       where p.cable_id = c.id and p.is_active
       order by p.sort_order nulls last, p.created_at
    loop
      v_i := v_i + 1;

      if p_respetar and r.number is not null then
        null;  -- conserva el número que ya traía (por ejemplo del KMZ)
      else
        v_num := v_num + 1;
        update public.poles set number = v_num where id = r.id;
      end if;

      if v_ant is null then
        update public.poles set span_from_id = null, span_m = null,
                                sort_order = v_i where id = r.id;
      else
        update public.poles
           set span_from_id = v_ant.id,
               span_m = public.distancia_m(v_ant.latitude, v_ant.longitude,
                                           r.latitude, r.longitude),
               sort_order = v_i
         where id = r.id;
        v_v := v_v + 1;
      end if;

      v_ant := r;
    end loop;
  end loop;

  -- Los sueltos también llevan número, para que no queden sin identificar.
  for r in
    select p.* from public.poles p
     where p.org_id = v_org and p.is_active and p.cable_id is null
       and (not p_respetar or p.number is null)
     order by p.created_at
  loop
    v_num := v_num + 1;
    update public.poles set number = v_num, span_from_id = null, span_m = null
     where id = r.id;
  end loop;

  postes := v_n; vanos := v_v; sueltos := v_s;
  return next;
end;
$$;

comment on function public.renumerar_postes is
  'Pega cada poste al cable que le pasa más cerca, lo ordena a lo largo del '
  'recorrido, lo numera y calcula el vano contra el anterior. Con respetar=true '
  'conserva los números que ya traían, que es lo que se quiere al importar un KMZ.';

-- ----------------------------------------------------------------------------
drop view if exists public.v_postes;
create view public.v_postes with (security_invoker = true) as
select p.id,
       p.org_id,
       p.number,
       p.code,
       p.sort_order,
       p.latitude,
       p.longitude,
       p.pole_type,
       p.height_m,
       p.is_new,
       p.span_m,
       p.notes,
       p.is_active,
       p.cable_id,
       cb.code  as cable,
       p.zone_id,
       coalesce(z.name, zc.name) as zona,
       a.number as viene_de
  from public.poles p
  left join public.fiber_cables cb on cb.id = p.cable_id
  left join public.zones z  on z.id = p.zone_id
  left join public.zones zc on zc.id = cb.zone_id
  left join public.poles a  on a.id = p.span_from_id;

comment on view public.v_postes is
  'Los postes con su número, su cable y el vano contra el anterior. Es la tabla '
  'que se entrega en el trámite.';

-- ----------------------------------------------------------------------------
-- 4 · El plano CFE
-- ----------------------------------------------------------------------------
-- Todo lo que va en la hoja: los recuadros, la simbología, las notas. Se
-- guarda como un solo documento porque es un formato, no datos: cambia
-- completo cuando CFE cambia el machote, y no vale la pena una columna por
-- cada casilla.
create table if not exists public.cfe_plans (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  zone_id     uuid references public.zones(id) on delete set null,
  name        text not null,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null,
  constraint cfe_plans_nombre_unico unique (org_id, name)
);

comment on table public.cfe_plans is
  'La hoja de trámite para CFE. Se guarda entera como documento: es un '
  'formato, no datos.';

select public.poner_tocar_actualizado('cfe_plans');
alter table public.cfe_plans enable row level security;

create policy planos_lectura on public.cfe_plans for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy planos_escritura on public.cfe_plans for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

grant select, insert, update, delete on public.cfe_plans to authenticated;

create or replace function public.guardar_plano(
  p_id     uuid  default null,
  p_nombre text  default null,
  p_zona   uuid  default null,
  p_config jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar planos' using errcode = '42501';
  end if;

  if p_id is null then
    if coalesce(btrim(p_nombre), '') = '' then
      raise exception 'El plano necesita un nombre';
    end if;
    insert into public.cfe_plans (org_id, zone_id, name, config, created_by)
    values (v_org, p_zona, btrim(p_nombre), coalesce(p_config, '{}'::jsonb), auth.uid())
    returning id into v_id;
  else
    update public.cfe_plans
       set name    = coalesce(nullif(btrim(p_nombre), ''), name),
           zone_id = p_zona,
           -- Se mezcla en vez de reemplazar: así una pantalla puede guardar
           -- solo su parte sin borrar lo que otra ya había puesto.
           config  = config || coalesce(p_config, '{}'::jsonb),
           updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese plano no existe';
    end if;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.guardar_poste(uuid, numeric, numeric, text, uuid, uuid, text, numeric, boolean, text, boolean) from public, anon;
revoke all on function public.eliminar_poste(uuid) from public, anon;
revoke all on function public.renumerar_postes(uuid, boolean, numeric) from public, anon;
revoke all on function public.guardar_plano(uuid, text, uuid, jsonb) from public, anon;

grant execute on function public.guardar_poste(uuid, numeric, numeric, text, uuid, uuid, text, numeric, boolean, text, boolean) to authenticated;
grant execute on function public.eliminar_poste(uuid) to authenticated;
grant execute on function public.renumerar_postes(uuid, boolean, numeric) to authenticated;
grant execute on function public.guardar_plano(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.distancia_m(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.proyectar_en_ruta(jsonb, numeric, numeric) to authenticated;
grant select on public.v_postes to authenticated;
