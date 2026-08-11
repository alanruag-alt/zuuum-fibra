-- ============================================================================
-- 032 · Diagnóstico de corte con OTDR
-- ============================================================================
-- El OTDR dice «el corte está a 1,340 metros». Pero esos 1,340 metros son de
-- FIBRA, no de calle: incluyen todo lo que se dejó enrollado. En un tendido
-- normal eso son 50 m en el sitio, 20 en cada poste, 20 en cada caja y 20 al
-- final. Si uno camina 1,340 metros sobre la banqueta buscando el corte, se
-- pasa por mucho — y de noche, con la cuadrilla esperando, ese error cuesta
-- horas.
--
-- Esta migración hace la conversión al revés: de los metros del OTDR saca el
-- punto en el mapa, descontando cada reserva que la luz atravesó en el camino.
--
-- Las guardas son configurables por cable, porque no todos los tendidos se
-- hicieron igual, y traen un valor por omisión para el que no las tenga.
-- ============================================================================

alter table public.fiber_cables
  add column if not exists guards jsonb;

comment on column public.fiber_cables.guards is
  'Reservas de este cable: {inicio, poste, caja, fin, factor} en metros. Si '
  'está vacío se usan las de la organización.';

insert into public.settings (org_id, key, value, value_type, category, name, description)
select o.id, 'network.guards',
       '{"inicio": 50, "poste": 20, "caja": 20, "fin": 20, "factor": 1.0}'::jsonb,
       'json', 'network', 'Reservas de cable',
       'Metros que se dejan enrollados: al salir del sitio, en cada poste, en cada caja y al final. Es la diferencia entre lo que mide el OTDR y lo que mide el mapa.'
  from public.organizations o
 where not exists (select 1 from public.settings s
                    where s.org_id = o.id and s.key = 'network.guards');

-- ----------------------------------------------------------------------------
-- 1 · Un punto a lo largo de la ruta
-- ----------------------------------------------------------------------------
create or replace function public.punto_a_lo_largo(
  p_ruta   jsonb,
  p_metros numeric,
  p_desde_inicio boolean default true
)
returns table (lat numeric, lon numeric, sobra numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n     int;
  v_i     int;
  v_paso  int;
  v_ini   int;
  y1 numeric; x1 numeric; y2 numeric; x2 numeric;
  v_tramo numeric;
  v_resto numeric := greatest(coalesce(p_metros, 0), 0);
  v_t     numeric;
begin
  v_n := jsonb_array_length(coalesce(p_ruta, '[]'::jsonb));
  if v_n < 2 then
    return;
  end if;

  -- Se recorre al derecho o al revés según de qué punta se midió.
  if p_desde_inicio then
    v_ini := 0; v_paso := 1;
  else
    v_ini := v_n - 1; v_paso := -1;
  end if;

  v_i := v_ini;
  loop
    exit when (p_desde_inicio and v_i >= v_n - 1) or ((not p_desde_inicio) and v_i <= 0);

    y1 := (p_ruta -> v_i ->> 0)::numeric;
    x1 := (p_ruta -> v_i ->> 1)::numeric;
    y2 := (p_ruta -> (v_i + v_paso) ->> 0)::numeric;
    x2 := (p_ruta -> (v_i + v_paso) ->> 1)::numeric;

    v_tramo := public.distancia_m(y1, x1, y2, x2);

    if v_resto <= v_tramo or v_tramo = 0 then
      v_t := case when v_tramo = 0 then 0 else v_resto / v_tramo end;
      lat := y1 + (y2 - y1) * v_t;
      lon := x1 + (x2 - x1) * v_t;
      sobra := 0;
      return next;
      return;
    end if;

    v_resto := v_resto - v_tramo;
    v_i := v_i + v_paso;
  end loop;

  -- Se acabó la ruta antes que los metros: el corte queda más allá del cable
  -- dibujado. Se devuelve la punta y cuánto sobró, que es lo que hay que
  -- decirle a la cuadrilla.
  lat := (p_ruta -> v_i ->> 0)::numeric;
  lon := (p_ruta -> v_i ->> 1)::numeric;
  sobra := v_resto;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2 · El perfil de un cable: cuánto mide en el mapa y cuánto para el OTDR
-- ----------------------------------------------------------------------------
create or replace function public.perfil_cable(p_cable uuid)
returns table (
  geo_m    numeric,
  otdr_m   numeric,
  postes   int,
  cajas    int,
  g_inicio numeric,
  g_poste  numeric,
  g_caja   numeric,
  g_fin    numeric,
  factor   numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_cb  record;
  v_g   jsonb;
  v_n   int;
  v_i   int;
  v_geo numeric := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  select * into v_cb from public.fiber_cables where id = p_cable and org_id = v_org;
  if v_cb.id is null then
    raise exception 'Ese cable no existe';
  end if;

  select coalesce(v_cb.guards,
                  (select s.value from public.settings s
                    where s.org_id = v_org and s.key = 'network.guards'),
                  '{"inicio":50,"poste":20,"caja":20,"fin":20,"factor":1.0}'::jsonb)
    into v_g;

  g_inicio := coalesce((v_g ->> 'inicio')::numeric, 50);
  g_poste  := coalesce((v_g ->> 'poste')::numeric, 20);
  g_caja   := coalesce((v_g ->> 'caja')::numeric, 20);
  g_fin    := coalesce((v_g ->> 'fin')::numeric, 20);
  factor   := coalesce((v_g ->> 'factor')::numeric, 1.0);

  v_n := jsonb_array_length(coalesce(v_cb.path, '[]'::jsonb));
  for v_i in 0..(greatest(v_n, 1) - 2) loop
    v_geo := v_geo + public.distancia_m(
      (v_cb.path -> v_i ->> 0)::numeric, (v_cb.path -> v_i ->> 1)::numeric,
      (v_cb.path -> (v_i + 1) ->> 0)::numeric, (v_cb.path -> (v_i + 1) ->> 1)::numeric);
  end loop;

  select count(*) into postes from public.poles
   where cable_id = p_cable and is_active;

  -- Las cajas que le tocan a este cable son aquellas donde alguno de sus hilos
  -- entra o sale de una fusión: ahí es donde de verdad hay reserva enrollada.
  select count(distinct f.closure_id) into cajas
    from public.fiber_splices f
    join public.fiber_strands s
      on s.id = f.in_strand_id or s.id = f.out_strand_id
   where s.cable_id = p_cable and f.status = 'activa';

  geo_m  := round(v_geo, 2);
  otdr_m := round(g_inicio + v_geo * factor + postes * g_poste + cajas * g_caja + g_fin, 2);
  return next;
end;
$$;

comment on function public.perfil_cable is
  'Cuánto mide el cable en el mapa y cuánto va a marcar el OTDR. La diferencia '
  'son las reservas enrolladas, que existen aunque no se vean.';

-- ----------------------------------------------------------------------------
-- 3 · El diagnóstico
-- ----------------------------------------------------------------------------
create or replace function public.diagnosticar_corte(
  p_cable    uuid,
  p_metros   numeric,
  p_desde_inicio boolean default true,
  p_descontar   boolean default true
)
returns table (
  lat        numeric,
  lon        numeric,
  geo_m      numeric,
  otdr_m     numeric,
  sobra_m    numeric,
  paso_de_largo boolean,
  cerca_de   text,
  a_metros   numeric,
  reservas   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_cb    record;
  pf      record;
  v_ruta  jsonb;
  o       record;
  v_resta numeric;
  v_pos   numeric := 0;
  v_geo   numeric;
  v_ant   numeric := 0;
  v_tramo numeric;
  pt      record;
  v_cerca record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.read') then
    raise exception 'No tienes permiso para ver la red' using errcode = '42501';
  end if;
  if p_metros is null or p_metros <= 0 then
    raise exception 'Escribe los metros que marcó el OTDR';
  end if;

  select * into v_cb from public.fiber_cables where id = p_cable and org_id = v_org;
  if v_cb.id is null then
    raise exception 'Ese cable no existe';
  end if;
  if jsonb_array_length(coalesce(v_cb.path, '[]'::jsonb)) < 2 then
    raise exception 'Ese cable no tiene ruta dibujada. Sin trazo no hay dónde poner el punto.';
  end if;

  select * into pf from public.perfil_cable(p_cable);
  v_ruta := v_cb.path;

  if not p_descontar then
    -- Sin descontar, los metros del OTDR se toman como distancia de calle. Es
    -- lo que uno haría a mano, y por eso el punto sale más adelante.
    v_geo := p_metros;
    reservas := 'sin descontar reservas';
  else
    -- Se camina la ruta gastando metros de fibra: los de la calle, más la
    -- reserva de cada poste y cada caja que se va pasando.
    v_resta := p_metros - pf.g_inicio;
    if v_resta < 0 then
      -- El corte cayó dentro de la reserva del sitio: está en la caseta misma.
      v_resta := 0;
    end if;

    for o in
      select pr.posicion_m as pos, 'poste' as que
        from public.poles p
        cross join lateral public.proyectar_en_ruta(v_ruta, p.latitude, p.longitude) pr
       where p.cable_id = p_cable and p.is_active
         and p.latitude is not null and pr.posicion_m is not null
      union all
      select pr.posicion_m, 'caja'
        from (select distinct f.closure_id
                from public.fiber_splices f
                join public.fiber_strands s
                  on s.id = f.in_strand_id or s.id = f.out_strand_id
               where s.cable_id = p_cable and f.status = 'activa') x
        join public.network_elements n on n.id = x.closure_id
        cross join lateral public.proyectar_en_ruta(v_ruta, n.latitude, n.longitude) pr
       where n.latitude is not null and pr.posicion_m is not null
      order by 1
    loop
      -- Si se midió desde el final, la posición de cada obstáculo se cuenta
      -- desde la otra punta.
      v_pos := case when p_desde_inicio then o.pos else pf.geo_m - o.pos end;
      if v_pos < v_ant then
        continue;
      end if;

      v_tramo := (v_pos - v_ant) * pf.factor;

      exit when v_resta <= v_tramo;

      v_resta := v_resta - v_tramo
                 - case when o.que = 'poste' then pf.g_poste else pf.g_caja end;
      v_ant := v_pos;

      if v_resta < 0 then
        -- Se acabó dentro de la reserva de este mismo poste o caja: el corte
        -- está ahí mismo, no más adelante.
        v_resta := 0;
        exit;
      end if;
    end loop;

    v_geo := v_ant + v_resta / nullif(pf.factor, 0);
    reservas := format('%s m de salida, %s postes × %s m, %s cajas × %s m',
                       pf.g_inicio, pf.postes, pf.g_poste, pf.cajas, pf.g_caja);
  end if;

  select * into pt from public.punto_a_lo_largo(v_ruta, v_geo, p_desde_inicio);

  lat := pt.lat;
  lon := pt.lon;
  geo_m := round(v_geo, 2);
  otdr_m := p_metros;
  sobra_m := round(coalesce(pt.sobra, 0), 2);
  paso_de_largo := coalesce(pt.sobra, 0) > 1;

  -- Qué hay cerca del punto, para poder decirlo por teléfono: «está entre el
  -- poste 14 y la caja de la esquina».
  select coalesce(n.code, 'poste ' || p.number::text) as nombre,
         public.distancia_m(pt.lat, pt.lon,
                            coalesce(n.latitude, p.latitude),
                            coalesce(n.longitude, p.longitude)) as d
    into v_cerca
    from (select null::uuid as ne, id as pid from public.poles
           where cable_id = p_cable and is_active and latitude is not null
          union all
          select n2.id, null from public.network_elements n2
           where n2.org_id = v_org and n2.latitude is not null and n2.is_active) q
    left join public.network_elements n on n.id = q.ne
    left join public.poles p on p.id = q.pid
   order by 2
   limit 1;

  cerca_de := v_cerca.nombre;
  a_metros := round(coalesce(v_cerca.d, 0), 2);
  return next;
end;
$$;

comment on function public.diagnosticar_corte is
  'De los metros del OTDR al punto en el mapa, descontando cada reserva que la '
  'luz atravesó. Es la diferencia entre buscar el corte en el lugar correcto y '
  'caminar de más con la cuadrilla esperando.';

-- ----------------------------------------------------------------------------
create or replace function public.guardar_guardas(
  p_cable  uuid    default null,
  p_inicio numeric default null,
  p_poste  numeric default null,
  p_caja   numeric default null,
  p_fin    numeric default null,
  p_factor numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_g   jsonb;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para cambiar las reservas' using errcode = '42501';
  end if;

  v_g := jsonb_build_object(
    'inicio', coalesce(p_inicio, 50),
    'poste',  coalesce(p_poste, 20),
    'caja',   coalesce(p_caja, 20),
    'fin',    coalesce(p_fin, 20),
    'factor', coalesce(p_factor, 1.0));

  if p_cable is null then
    -- Sin cable, se cambian las de toda la organización.
    update public.settings set value = v_g, updated_at = now()
     where org_id = v_org and key = 'network.guards';
  else
    update public.fiber_cables set guards = v_g, updated_at = now()
     where id = p_cable and org_id = v_org;
    if not found then
      raise exception 'Ese cable no existe';
    end if;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.punto_a_lo_largo(jsonb, numeric, boolean) from public, anon;
revoke all on function public.perfil_cable(uuid) from public, anon;
revoke all on function public.diagnosticar_corte(uuid, numeric, boolean, boolean) from public, anon;
revoke all on function public.guardar_guardas(uuid, numeric, numeric, numeric, numeric, numeric) from public, anon;

grant execute on function public.punto_a_lo_largo(jsonb, numeric, boolean) to authenticated;
grant execute on function public.perfil_cable(uuid) to authenticated;
grant execute on function public.diagnosticar_corte(uuid, numeric, boolean, boolean) to authenticated;
grant execute on function public.guardar_guardas(uuid, numeric, numeric, numeric, numeric, numeric) to authenticated;
