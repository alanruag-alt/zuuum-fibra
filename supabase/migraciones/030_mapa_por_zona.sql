-- ============================================================================
-- 030 · Un mapa por zona
-- ============================================================================
-- Cuencamé, Velardeña y Pasaje están a kilómetros unas de otras. Un solo mapa
-- que las abarque a todas se ve desde tan lejos que no se distingue un poste
-- de otro, y cada vez que uno entra tiene que volver a acercarse a mano.
--
-- Así que cada zona se acuerda de su propio encuadre: dónde estaba centrada y
-- con cuánto acercamiento. Uno elige la localidad y el mapa aparece como lo
-- dejó la última vez.
-- ============================================================================

alter table public.zones
  add column if not exists map_view jsonb;

comment on column public.zones.map_view is
  'Dónde queda centrado el mapa de esta zona: {lat, lon, zoom}. Se guarda solo '
  'al moverlo, para no tener que reencuadrar cada vez.';

create or replace function public.guardar_vista_zona(
  p_zona uuid,
  p_lat  numeric,
  p_lon  numeric,
  p_zoom int
)
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
  -- Encuadrar un mapa no es cambiar la red: alcanza con poder verla.
  if not public.auth_has('network.read') then
    raise exception 'No tienes permiso para ver la red' using errcode = '42501';
  end if;

  update public.zones
     set map_view = jsonb_build_object('lat', p_lat, 'lon', p_lon, 'zoom', p_zoom),
         updated_at = now()
   where id = p_zona and org_id = v_org;

  if not found then
    raise exception 'Esa zona no existe';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Poner o corregir el trazo de un cable desde el mapa.
-- ----------------------------------------------------------------------------
create or replace function public.guardar_trazo(
  p_cable uuid,
  p_ruta  jsonb
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_n    int;
  v_i    int;
  v_m    numeric := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para dibujar la red' using errcode = '42501';
  end if;

  v_n := jsonb_array_length(coalesce(p_ruta, '[]'::jsonb));

  if v_n = 1 then
    raise exception 'Un trazo de un solo punto no es un trazo. Marca al menos dos.';
  end if;

  -- La longitud sale del dibujo, no de que alguien la escriba. Si después el
  -- OTDR dice otra cosa, se corrige a mano; pero el punto de partida es lo
  -- que mide el recorrido de verdad.
  for v_i in 0..(greatest(v_n, 1) - 2) loop
    v_m := v_m + public.distancia_m(
      (p_ruta -> v_i ->> 0)::numeric, (p_ruta -> v_i ->> 1)::numeric,
      (p_ruta -> (v_i + 1) ->> 0)::numeric, (p_ruta -> (v_i + 1) ->> 1)::numeric);
  end loop;

  update public.fiber_cables
     set path = case when v_n >= 2 then p_ruta else null end,
         length_m = case when v_n >= 2 then round(v_m, 2) else length_m end,
         updated_at = now()
   where id = p_cable and org_id = v_org;

  if not found then
    raise exception 'Ese cable no existe';
  end if;

  return round(v_m, 2);
end;
$$;

comment on function public.guardar_trazo is
  'Guarda el recorrido dibujado y saca de ahí la longitud del cable. Lo que se '
  'mide sobre el mapa es más confiable que lo que alguien recuerda.';

revoke all on function public.guardar_vista_zona(uuid, numeric, numeric, int) from public, anon;
revoke all on function public.guardar_trazo(uuid, jsonb) from public, anon;
grant execute on function public.guardar_vista_zona(uuid, numeric, numeric, int) to authenticated;
grant execute on function public.guardar_trazo(uuid, jsonb) to authenticated;
