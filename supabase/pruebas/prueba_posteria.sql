-- ============================================================================
-- PRUEBAS DE POSTERÍA · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Se corre después de prueba_seguridad.sql.
--
-- Se tiende un cable recto de 500 m hacia el este y se le cuelgan 5 postes
-- cada 100 m, capturados EN DESORDEN a propósito: así se prueba que el orden
-- sale del recorrido y no de cómo se capturaron. Más un poste tirado a 400 m
-- de la ruta, que no debe pegarse a nada.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 1 · La distancia da lo que mide de verdad'
\echo '  Se espera: PASA · un grado de latitud son ~111 km'
\echo '════════════════════════════════════════════════════════════════'
select case when public.distancia_m(24.87, -103.70, 25.87, -103.70) between 110000 and 112000
             and public.distancia_m(24.87, -103.70, 24.87, -103.70) = 0
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       public.distancia_m(24.87, -103.70, 25.87, -103.70) as un_grado_de_latitud;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · Proyectar un punto sobre la ruta'
\echo '  Se espera: PASA · a ~0 m de la línea, a la mitad del recorrido'
\echo '════════════════════════════════════════════════════════════════'
select case when distancia_m < 5 and posicion_m between 240 and 260
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       round(distancia_m) as a_cuanto_de_la_linea,
       round(posicion_m)  as metros_recorridos
  from public.proyectar_en_ruta(
    '[[24.8700000,-103.7000000],[24.8700000,-103.6950385]]'::jsonb,
    24.8700000, -103.6975193);

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · Postes capturados en desorden quedan numerados en orden'
\echo '  Se espera: PASA · 1,2,3,4,5 de oeste a este'
\echo '════════════════════════════════════════════════════════════════'
drop table if exists t_post;
create temporary table t_post (que text, id uuid);
grant select on t_post to authenticated;

do $$
declare v_cue uuid; v_cable uuid;
begin
  select id into v_cue from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  v_cable := public.guardar_cable(null, 'TR-POST', 'adss', 12, v_cue,
                                  'Caseta', null, null, 'Salida del pueblo', null, null, 500);
  reset role;

  -- Una recta de 500 m hacia el este, a la latitud de Cuencamé.
  update public.fiber_cables
     set path = '[[24.8700000,-103.7000000],[24.8700000,-103.6950385]]'::jsonb
   where id = v_cable;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- A propósito en desorden: 3, 1, 5, 2, 4.
  perform public.guardar_poste(null, 24.8700000, -103.6980154, 'cfe_concreto', v_cue);
  perform public.guardar_poste(null, 24.8700000, -103.7000000, 'cfe_concreto', v_cue);
  perform public.guardar_poste(null, 24.8700000, -103.6960462, 'cfe_concreto', v_cue);
  perform public.guardar_poste(null, 24.8700000, -103.6990077, 'cfe_concreto', v_cue);
  perform public.guardar_poste(null, 24.8700000, -103.6970308, 'cfe_concreto', v_cue);
  -- Y uno tirado lejos de la ruta.
  perform public.guardar_poste(null, 24.8750000, -103.6980000, 'propio', v_cue);

  reset role;
  insert into t_post values ('cable', v_cable);
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  select * from public.renumerar_postes();
commit;

select case when string_agg(number::text, ',' order by longitude) = '1,2,3,4,5'
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       string_agg(number::text, ',' order by longitude) as de_oeste_a_este
  from public.v_postes where cable = 'TR-POST';

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · Los vanos salen de ~100 m cada uno'
\echo '  Se espera: PASA · 4 vanos, todos cerca de 100'
\echo '════════════════════════════════════════════════════════════════'
select case when count(*) = 4 and min(span_m) > 95 and max(span_m) < 105
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       count(*) as vanos, round(min(span_m)) as menor, round(max(span_m)) as mayor
  from public.v_postes where cable = 'TR-POST' and span_m is not null;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · El poste lejos de la ruta queda suelto, no inventado'
\echo '  Se espera: PASA · sin cable y sin vano, pero con número'
\echo '════════════════════════════════════════════════════════════════'
select case when cable is null and span_m is null and number is not null
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       number, cable, span_m
  from public.v_postes where pole_type = 'propio';

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · El primer poste no tiene vano: no hay de dónde medirlo'
\echo '  Se espera: PASA · el número 1 sin vano y sin poste anterior'
\echo '════════════════════════════════════════════════════════════════'
select case when span_m is null and viene_de is null
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       number, span_m, viene_de
  from public.v_postes where cable = 'TR-POST' and number = 1;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · Borrar un poste no deja vanos colgando'
\echo '  Se espera: PASA · el que venía después queda sin vano'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_id uuid;
begin
  select id into v_id from public.v_postes where cable = 'TR-POST' and number = 2;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  perform public.eliminar_poste(v_id);
end $$;

select case when count(*) filter (where span_m is null) >= 2
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       count(*) as quedan,
       count(*) filter (where span_m is null) as sin_vano
  from public.v_postes where cable = 'TR-POST';

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · El plano se guarda por partes sin borrar lo anterior'
\echo '  Se espera: PASA · conserva el concesionario y agrega las notas'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  v_id := public.guardar_plano(null, 'Cuencamé norte', null,
            '{"concesionario":"ZUUUM FIBRA","hoja":"carta"}'::jsonb);
  -- Otra pantalla guarda solo su parte.
  perform public.guardar_plano(v_id, null, null, '{"notas":"Acotaciones en metros."}'::jsonb);

  reset role;
  if (select config->>'concesionario' from public.cfe_plans where id = v_id) = 'ZUUUM FIBRA'
     and (select config->>'notas' from public.cfe_plans where id = v_id) is not null then
    raise notice 'PASA · conservó lo de antes y agregó lo nuevo';
  else
    raise notice '>>> FALLA <<< se perdió una parte';
  end if;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 9 · Carlos (técnico) no puede renumerar'
\echo '  Se espera: PASA · lo rechaza por permiso'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.renumerar_postes();
    raise notice '>>> FALLA <<< Carlos renumeró la postería';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%permiso%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'FIN DE LAS PRUEBAS DE POSTERÍA'
\echo '════════════════════════════════════════════════════════════════'
