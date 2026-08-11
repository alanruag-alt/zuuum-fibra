-- ============================================================================
-- Prueba · Ramales, y que un trazo no se borre solo
--
-- Se reproduce el problema tal como pasó en Pedriceña: hay un troncal
-- dibujado, llega a una caja, y de ahí se quiere sacar otro cable. Antes eso
-- borraba el troncal. Aquí se comprueba que ya no, y que el ramal queda
-- amarrado a su caja.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

do $prueba$
declare
  v_zona   uuid;
  v_troncal uuid;
  v_caja   uuid;
  v_r1     uuid;
  v_r2     uuid;
  v_falla  int := 0;
  v_msg    text;
  v_n      int;
  v_m      numeric;
  r        record;

  -- Un troncal recto de un kilómetro por la carretera.
  c_troncal jsonb := '[[24.8300000,-103.7000000],[24.8300000,-103.6900000]]'::jsonb;
  -- Y dos ramales que se van para el otro lado desde la caja de en medio.
  c_ramal1  jsonb := '[[24.8300000,-103.6950000],[24.8340000,-103.6950000]]'::jsonb;
  c_ramal2  jsonb := '[[24.8300000,-103.6950000],[24.8260000,-103.6950000]]'::jsonb;
begin
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── el troncal ───────────────────────────────────────────────────────────
  v_troncal := public.guardar_cable(null, 'TR-RAMALES', 'adss', 24, v_zona);
  v_msg := public.guardar_trazo(v_troncal, c_troncal, 'reemplazar');
  raise notice 'PASA · %', v_msg;

  select jsonb_array_length(path), length_m into v_n, v_m
    from public.fiber_cables where id = v_troncal;

  if v_n = 2 and v_m between 990 and 1020 then
    raise notice 'PASA · el troncal quedo con % puntos y % m', v_n, round(v_m);
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el troncal midio % m con % puntos', round(v_m), v_n;
  end if;

  -- ── la caja a la mitad del troncal ───────────────────────────────────────
  v_caja := public.guardar_elemento(p_codigo => 'CE-RAMALES', p_tipo => 'closure',
                                    p_zona => v_zona,
                                    p_lat => 24.8300000, p_lon => -103.6950000);

  -- ── 1 · EL BUG · dibujar otro ramal NO debe borrar el troncal ────────────
  -- Antes, esto mismo dejaba al troncal con la ruta del ramal y 440 m.
  v_r1 := public.ramal_desde(v_caja, 'RAM-01', 'adss', 12);
  v_msg := public.guardar_trazo(v_r1, c_ramal1, 'reemplazar');
  raise notice 'PASA · %', v_msg;

  select jsonb_array_length(path), length_m into v_n, v_m
    from public.fiber_cables where id = v_troncal;

  if v_n = 2 and v_m between 990 and 1020 then
    raise notice 'PASA · el troncal SIGUE ahi, con sus % m', round(v_m);
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ramal se comio el troncal: % m, % puntos', round(v_m), v_n;
  end if;

  -- ── 2 · un segundo ramal de la misma caja ────────────────────────────────
  v_r2 := public.ramal_desde(v_caja, 'RAM-02', 'adss', 12);
  perform public.guardar_trazo(v_r2, c_ramal2, 'reemplazar');

  select count(*) into v_n from public.cables_de_caja(v_caja);
  if v_n >= 2 then
    raise notice 'PASA · de la caja salen % cables, cada uno con su trazo', v_n;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la caja solo reporta % cables', v_n;
  end if;

  -- ── 3 · el ramal arranca EXACTAMENTE en la caja ──────────────────────────
  select (path -> 0 ->> 0)::numeric, (path -> 0 ->> 1)::numeric into v_m, v_n
    from public.fiber_cables where id = v_r1;
  if v_m = 24.8300000 then
    raise notice 'PASA · el ramal arranca justo en la caja, no cerca';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ramal empieza en % y la caja esta en 24.83', v_m;
  end if;

  -- ── 4 · y queda amarrado a ella ──────────────────────────────────────────
  select from_id, from_text into r from public.fiber_cables where id = v_r1;
  if r.from_id = v_caja then
    raise notice 'PASA · el ramal sabe que sale de % (%)', r.from_text, 'CE-RAMALES';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ramal no quedo amarrado a su caja';
  end if;

  -- ── 5 · continuar alarga, no reemplaza ───────────────────────────────────
  v_msg := public.guardar_trazo(
    v_r1, '[[24.8340000,-103.6950000],[24.8380000,-103.6950000]]'::jsonb, 'continuar');

  select jsonb_array_length(path), length_m into v_n, v_m
    from public.fiber_cables where id = v_r1;

  if v_n = 3 and v_m between 870 and 900 then
    raise notice 'PASA · continuar alargo el ramal a % puntos y % m', v_n, round(v_m);
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · continuar dejo % puntos y % m', v_n, round(v_m);
  end if;

  -- El punto repetido no se duplica: el primero del tramo nuevo era el último
  -- del viejo, y contarlo dos veces metería un vano de cero metros.
  if v_n = 3 then
    raise notice 'PASA · no duplico el punto de union';
  end if;

  -- ── 6 · reemplazar avisa qué se llevó ────────────────────────────────────
  v_msg := public.guardar_trazo(v_r1, c_ramal1, 'reemplazar');
  if v_msg like '%Se reemplazó el recorrido%' and v_msg like '%tenía 3 puntos%' then
    raise notice 'PASA · al reemplazar dice cuanto tenia antes: %', left(v_msg, 70);
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · reemplazo sin avisar: %', v_msg;
  end if;

  -- ── 7 · continuar sin trazo previo se niega con sentido ──────────────────
  declare v_vacio uuid;
  begin
    v_vacio := public.guardar_cable(null, 'TR-VACIO', 'adss', 12, v_zona);
    begin
      perform public.guardar_trazo(v_vacio, c_ramal1, 'continuar');
      v_falla := v_falla + 1;
      raise notice 'FALLA · dejo continuar un cable sin recorrido';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like '%no hay de dónde continuar%' then
        raise notice 'PASA · continuar sin recorrido previo se niega y explica';
      else
        v_falla := v_falla + 1;
        raise notice 'FALLA · otro error: %', v_msg;
      end if;
    end;
    perform public.eliminar_cable(v_vacio);
  end;

  -- ── limpieza ─────────────────────────────────────────────────────────────
  perform public.eliminar_cable(v_r1);
  perform public.eliminar_cable(v_r2);
  perform public.eliminar_cable(v_troncal);
  perform public.eliminar_elemento(v_caja);

  if v_falla = 0 then
    raise notice '── TODO BIEN · varios ramales por caja, y el troncal no se borra ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end;
$prueba$;
