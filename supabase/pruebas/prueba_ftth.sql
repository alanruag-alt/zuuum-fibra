-- ============================================================================
-- PRUEBAS DE FTTH · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Se corre después de prueba_seguridad.sql.
--
-- Se arma una red chica pero real, con la forma que tiene la de Cuencamé:
--
--   ODF ──[TR-01 hilo 1]── CAJA-01 ──[DI-01 hilo 3]── NAP-01 (8 puertos)
--                             │
--                             └──[DI-02 hilo 1]── NAP-02 (8 puertos)
--
-- Y luego se le pregunta al sistema lo que uno le preguntaría a las 11 de la
-- noche: por dónde viene la fibra de este señor, y a quién dejo sin internet
-- si se cae esta caja.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

drop table if exists t_red;
create temporary table t_red (que text primary key, id uuid);
-- Las temporales no llevan RLS, pero sí permisos de tabla: sin esto, las
-- pruebas que corren como `authenticated` no pueden ni leer sus propios ids.
grant select on t_red to authenticated;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 1 · Los colores salen de la norma, no de la captura'
\echo '  Se espera: PASA · 1 azul tubo 1, 12 aqua tubo 1, 13 azul tubo 2'
\echo '════════════════════════════════════════════════════════════════'
select case when public.color_hilo(1) = 'Azul'
             and public.tubo_hilo(1) = 1
             and public.color_hilo(12) = 'Aqua'
             and public.tubo_hilo(12) = 1
             and public.color_hilo(13) = 'Azul'
             and public.tubo_hilo(13) = 2
             and public.color_hilo(24) = 'Aqua'
             and public.tubo_hilo(24) = 2
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       public.color_hilo(13) as hilo_13, public.tubo_hilo(13) as tubo_13;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · Al dar de alta un cable de 24, nacen sus 24 hilos'
\echo '  Se espera: PASA · 24 hilos, 2 tubos, todos disponibles'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_cue uuid; v_odf uuid; v_caja uuid; v_n1 uuid; v_n2 uuid;
        v_tr uuid; v_d1 uuid; v_d2 uuid;
begin
  select id into v_cue from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  v_odf  := public.guardar_elemento(null, 'ODF-CUE-01', 'odf', 'Caseta de la OLT', v_cue);
  v_caja := public.guardar_elemento(null, 'CAJA-01', 'closure', 'Esquina de la primaria', v_cue);
  v_n1   := public.guardar_elemento(null, 'NAP-01', 'nap', 'Calle Hidalgo', v_cue, null, null, 8);
  v_n2   := public.guardar_elemento(null, 'NAP-02', 'nap', 'Calle Juárez',  v_cue, null, null, 8);

  v_tr := public.guardar_cable(null, 'TR-01', 'adss', 24, v_cue,
                               'Caseta de la OLT', 'odf', v_odf,
                               'Esquina de la primaria', 'closure', v_caja, 850);
  v_d1 := public.guardar_cable(null, 'DI-01', 'adss', 12, v_cue,
                               'Esquina de la primaria', 'closure', v_caja,
                               'Calle Hidalgo', 'nap', v_n1, 320);
  v_d2 := public.guardar_cable(null, 'DI-02', 'adss', 12, v_cue,
                               'Esquina de la primaria', 'closure', v_caja,
                               'Calle Juárez', 'nap', v_n2, 410);

  reset role;
  insert into t_red values ('zona',v_cue),('odf',v_odf),('caja',v_caja),
                           ('nap1',v_n1),('nap2',v_n2),
                           ('tr',v_tr),('di1',v_d1),('di2',v_d2);
end $$;

select case when count(*) = 24
             and count(*) filter (where status = 'disponible') = 24
             and max(tube_number) = 2
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       count(*) as hilos, max(tube_number) as tubos
  from public.fiber_strands where cable_id = (select id from t_red where que = 'tr');

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · Fusionar y que los hilos dejen de estar libres'
\echo '  Se espera: PASA · quedan 22 libres de 24 (se usaron 2)'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_h_tr uuid; v_h_d1 uuid; v_h_d2 uuid; v_h_tr2 uuid;
        v_caja uuid; v_n1 uuid; v_n2 uuid;
begin
  select id into v_caja from t_red where que = 'caja';
  select id into v_n1   from t_red where que = 'nap1';
  select id into v_n2   from t_red where que = 'nap2';

  select id into v_h_tr  from public.fiber_strands
   where cable_id = (select id from t_red where que='tr')  and strand_number = 1;
  select id into v_h_tr2 from public.fiber_strands
   where cable_id = (select id from t_red where que='tr')  and strand_number = 2;
  select id into v_h_d1  from public.fiber_strands
   where cable_id = (select id from t_red where que='di1') and strand_number = 3;
  select id into v_h_d2  from public.fiber_strands
   where cable_id = (select id from t_red where que='di2') and strand_number = 1;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- Troncal → distribución, dentro de la caja
  perform public.guardar_fusion(null, v_caja, v_h_tr,  v_h_d1, null, 'fusion', 0.08);
  perform public.guardar_fusion(null, v_caja, v_h_tr2, v_h_d2, null, 'fusion', 0.11);
  -- Y cada distribución termina en su NAP
  perform public.guardar_fusion(null, v_caja, v_h_d1, null, v_n1, 'conector', 0.30);
  perform public.guardar_fusion(null, v_caja, v_h_d2, null, v_n2, 'conector', 0.25);

  -- La NAP guarda de qué hilo cuelga
  update public.network_elements set feed_strand_id = v_h_d1, input_dbm = -18.4 where id = v_n1;
  update public.network_elements set feed_strand_id = v_h_d2, input_dbm = -19.1 where id = v_n2;

  reset role;
  insert into t_red values ('h_tr',v_h_tr),('h_d1',v_h_d1),('h_d2',v_h_d2);
end $$;

select case when libres = 22 and en_servicio = 0 then 'PASA' else '>>> FALLA <<<' end as resultado,
       code, hilos, libres
  from public.v_cables where code = 'TR-01';

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · El mismo hilo no se puede fusionar dos veces en la caja'
\echo '  Se espera: PASA · lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_caja uuid; v_h uuid; v_otro uuid;
begin
  select id into v_caja from t_red where que = 'caja';
  select id into v_h    from t_red where que = 'h_tr';
  select id into v_otro from public.fiber_strands
   where cable_id = (select id from t_red where que='di1') and strand_number = 7;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.guardar_fusion(null, v_caja, v_h, v_otro, null, 'fusion', 0.1);
    raise notice '>>> FALLA <<< fusionó dos veces el mismo hilo';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%ya tiene una fusión activa%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · Clientes en los puertos de la NAP'
\echo '  Se espera: PASA · 3 ocupados, la NAP dice 3/8'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_n1 uuid; r record; i int := 0;
begin
  select id into v_n1 from t_red where que = 'nap1';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  for r in select s.id from public.customer_services s
             join public.customers c on c.id = s.customer_id
             join public.zones z on z.id = c.zone_id
            where z.code = 'CUE' order by c.customer_code limit 3
  loop
    i := i + 1;
    perform public.asignar_puerto_nap(v_n1, i, r.id, -21.5 - i);
  end loop;
end $$;

select case when ocupados = 3 and n.used_ports = 3 then 'PASA' else '>>> FALLA <<<' end as resultado,
       n.code, n.used_ports, n.capacity, ocupados
  from public.network_elements n,
       lateral (select count(*) as ocupados from public.nap_ports p
                 where p.element_id = n.id and p.status = 'ocupado') x
 where n.code = 'NAP-01';

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · Un cliente no puede estar en dos puertos'
\echo '  Se espera: PASA · al moverlo, el puerto viejo queda libre'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_n1 uuid; v_srv uuid;
begin
  select id into v_n1 from t_red where que = 'nap1';
  select service_id into v_srv from public.nap_ports
   where element_id = v_n1 and port_number = 1;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  perform public.asignar_puerto_nap(v_n1, 6, v_srv, -22.0);
end $$;

select case when count(*) = 1 and max(port_number) = 6
            then 'PASA' else '>>> FALLA <<<' end as resultado,
       count(*) as puertos_del_cliente, max(port_number) as en_el_puerto
  from public.nap_ports p
 where p.service_id = (select service_id from public.nap_ports
                        where element_id = (select id from t_red where que='nap1')
                          and port_number = 6);

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · Trazar desde el cliente: sube hasta el troncal'
\echo '  Se espera: PASA · pasa por DI-01 y TR-01, con la caja en medio'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_cli uuid; v_n int; v_cables text;
begin
  select c.id into v_cli
    from public.nap_ports p
    join public.customer_services s on s.id = p.service_id
    join public.customers c on c.id = s.customer_id
   where p.element_id = (select id from t_red where que='nap1')
     and p.status = 'ocupado' limit 1;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select count(*), string_agg(distinct cable, ' + ' order by cable)
    into v_n, v_cables
    from public.trazar_cliente(v_cli);

  if v_n = 2 and v_cables = 'DI-01 + TR-01' then
    raise notice 'PASA · % saltos por %', v_n, v_cables;
  else
    raise notice '>>> FALLA <<< % saltos por %', v_n, v_cables;
  end if;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · La traza dice la caja y la pérdida de cada empalme'
\echo '  Se espera: PASA · el salto 1 pasa por CAJA-01 con 0.08 dB'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when caja = 'CAJA-01' and perdida_db = 0.08 and cable = 'TR-01'
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         salto, cable, numero, color, caja, perdida_db
    from public.trazar_hilo((select id from t_red where que = 'h_d1'))
   where salto = 1;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 9 · Impacto de un corte'
\echo '  Se espera: PASA · TR-01 y CAJA-01 tumban a los 3 clientes'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- El troncal también tiene que salir: la NAP cuelga del DI, pero el DI
  -- cuelga del troncal. Si se corta el troncal, esos 3 se caen igual.
  select case when max(clientes_afectados) filter (where elemento = 'CAJA-01') = 3
               and max(clientes_afectados) filter (where elemento = 'DI-01')   = 3
               and max(clientes_afectados) filter (where elemento = 'TR-01')   = 3
               and max(clientes_afectados) filter (where elemento = 'DI-02')   = 0
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         max(clientes_afectados) filter (where elemento = 'CAJA-01') as por_la_caja,
         max(clientes_afectados) filter (where elemento = 'DI-01')   as por_el_di1,
         max(clientes_afectados) filter (where elemento = 'DI-02')   as por_el_di2,
         max(clientes_afectados) filter (where elemento = 'TR-01')   as por_el_troncal
    from public.v_impacto_corte;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 10 · El semáforo de potencia en el puerto'
\echo '  Se espera: PASA · -22.5 bien, -26 al límite, -30 mal'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_n2 uuid;
begin
  select id into v_n2 from t_red where que = 'nap2';
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  perform public.asignar_puerto_nap(v_n2, 1, null, -22.5, 'reservado');
  perform public.asignar_puerto_nap(v_n2, 2, null, -26.0, 'reservado');
  perform public.asignar_puerto_nap(v_n2, 3, null, -30.0, 'reservado');
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when string_agg(semaforo_rx, ',' order by port_number) = 'bien,al_limite,mal'
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         string_agg(port_number || ':' || semaforo_rx, ' · ' order by port_number) as lectura
    from public.v_puertos_nap
   where nap = 'NAP-02' and port_number <= 3;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 11 · Al borrar la fusión, el hilo vuelve a quedar libre'
\echo '  Se espera: PASA · el troncal regresa a 23 libres de 24'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_f uuid;
begin
  select f.id into v_f from public.fiber_splices f
   where f.in_strand_id = (select id from t_red where que = 'h_tr');

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  perform public.eliminar_fusion(v_f);
end $$;

select case when libres = 23 then 'PASA' else '>>> FALLA <<<' end as resultado,
       code, libres
  from public.v_cables where code = 'TR-01';

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 12 · Carlos (técnico) no puede capturar cables'
\echo '  Se espera: PASA · lo rechaza por permiso'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.guardar_cable(null, 'PIRATA-01', 'adss', 12);
    raise notice '>>> FALLA <<< Carlos capturó un cable';
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
\echo 'FIN DE LAS PRUEBAS DE FTTH'
\echo '════════════════════════════════════════════════════════════════'
