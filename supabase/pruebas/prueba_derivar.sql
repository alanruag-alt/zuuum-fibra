-- ============================================================================
-- Prueba · Derivar sobre un cable, como en el sistema que ya funcionaba
--
-- El troncal pasa por la calle. A la mitad se inserta una caja SOBRE su línea,
-- se cortan dos hilos ahí, y de esa caja arranca un ramal. Al final se
-- comprueba lo que importa: que el troncal siga entero, que los hilos cortados
-- lo sepan, que los demás sigan de largo, y que la caja tenga los dos cables
-- abiertos adentro para poder empalmar.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

do $p$
declare
  v_zona uuid; v_tr uuid; v_caja uuid; v_ram uuid;
  v_falla int := 0; v_n int; v_m numeric; v_msg text;
  v_h uuid[]; r record;
  c_tr jsonb := '[[24.8200000,-103.7000000],[24.8200000,-103.6900000]]'::jsonb;
begin
  select id into v_zona from public.zones where code = 'CUE';
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- El troncal, 24 hilos.
  v_tr := public.guardar_cable(null, 'TR-DERIVA', 'adss', 24, v_zona);
  perform public.guardar_trazo(v_tr, c_tr, 'reemplazar');

  -- Los hilos 1 y 2 son los que se van a derivar.
  select array_agg(id) into v_h from (
    select id from public.fiber_strands where cable_id = v_tr and strand_number in (1,2)) x;

  -- ── 1 · la caja se inserta SOBRE la línea ───────────────────────────────
  -- Se pide 20 m al norte a propósito: tiene que pegarse a la línea.
  select * into r from public.insertar_caja_en_cable(
    v_tr, 24.8201800, -103.6950000, 'CE-DERIVA', 'Esquina', v_h, false, 8);
  v_caja := r.caja_id;

  select latitude into v_m from public.network_elements where id = v_caja;
  if v_m = 24.8200000 then
    raise notice 'PASA · la caja se pego a la linea del cable, en el metro %', round(r.en_metro);
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la caja quedo en % y la linea esta en 24.82', v_m;
  end if;

  if r.cortados = 2 then
    raise notice 'PASA · se cortaron los 2 hilos que se eligieron';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · corto % hilos', r.cortados;
  end if;

  -- ── 2 · los cortados lo saben, los demas siguen de largo ────────────────
  select count(*) into v_n from public.fiber_strands
   where cable_id = v_tr and cut_at @> to_jsonb(array[v_caja::text]);
  if v_n = 2 then
    raise notice 'PASA · solo 2 hilos quedaron marcados como cortados en esa caja';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · % hilos marcados', v_n;
  end if;

  select count(*) into v_n from public.fiber_strands
   where cable_id = v_tr and status = 'disponible';
  if v_n = 22 then
    raise notice 'PASA · los otros 22 hilos siguen disponibles y de largo';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · quedan % disponibles', v_n;
  end if;

  -- ── 3 · el ramal arranca en la caja y NO borra el troncal ───────────────
  select * into r from public.cerrar_ruta(
    '[[24.8200000,-103.6950000],[24.8240000,-103.6950000]]'::jsonb,
    null, 'RAM-DERIVA', 12, 'adss', v_zona, v_caja, 35);
  v_ram := r.cable_id;
  raise notice 'PASA · ramal % de % m, enganchado a %', r.codigo, round(r.metros), r.enganchadas;

  select jsonb_array_length(path), length_m into v_n, v_m
    from public.fiber_cables where id = v_tr;
  if v_n = 2 and v_m between 990 and 1030 then
    raise notice 'PASA · el troncal sigue entero: % m', round(v_m);
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el troncal quedo en % m', round(v_m);
  end if;

  -- ── 4 · la caja tiene los DOS cables abiertos adentro ───────────────────
  select count(*) into v_n from public.closure_cables where closure_id = v_caja;
  if v_n = 2 then
    raise notice 'PASA · la caja tiene los 2 cables en su diagrama, se puede empalmar';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la caja tiene % cables', v_n;
  end if;

  -- ── 5 · la lista de hilos dice quien esta ocupado y donde se corta ──────
  select count(*) into v_n from public.hilos_de_cable(v_tr) where cortado is not null;
  if v_n = 2 then
    raise notice 'PASA · la lista de hilos dice cuales vienen cortados y en que caja';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la lista marca % cortados', v_n;
  end if;

  -- ── 6 · el mismo hilo puede seguir en otro tramo ────────────────────────
  -- Es justo el punto: se corta en una caja y de ahi sigue en otro cable.
  select count(*) into v_n from public.fiber_strands
   where cable_id = v_tr and strand_number = 1 and jsonb_array_length(cut_at) = 1;
  if v_n = 1 then
    raise notice 'PASA · el hilo 1 sirve un tramo, se corta, y de ahi puede seguir en otro';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el hilo 1 no quedo bien marcado';
  end if;

  perform public.eliminar_cable(v_ram);
  delete from public.closure_cables where closure_id = v_caja;
  perform public.eliminar_elemento(v_caja);
  perform public.eliminar_cable(v_tr);

  if v_falla = 0 then
    raise notice '── TODO BIEN · se deriva sobre el cable como debe ser ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end $p$;
