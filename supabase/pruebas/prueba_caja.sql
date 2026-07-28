-- ============================================================================
-- PRUEBAS DE CAJA, CORTE Y RECONEXIÓN · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Se corre después de prueba_seguridad.sql y prueba_cobranza.sql.
--   Ana  = administradora   Beto = cobrador de Velardeña   Carlos = técnico
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 1 · Beto abre su caja, y abrirla otra vez no crea una segunda'
\echo '  Se espera: PASA · el mismo id las dos veces'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  create temporary table t_caja on commit drop as
  select public.abrir_caja((select id from public.zones where code='VEL')) as caja;

  select case when public.abrir_caja(null) = t.caja then 'PASA' else '>>> FALLA <<<' end
           as misma_caja
    from t_caja t;

  select case when count(*) = 1 then 'PASA' else '>>> FALLA <<< hay dos cajas abiertas' end
           as cajas_abiertas, count(*)
    from public.cash_sessions where status='open'
      and collector_id = '22222222-2222-2222-2222-222222222222';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · Lo que Beto cobre se suma solo a su caja'
\echo '  Se espera: PASA · cobra 450 en efectivo y la caja espera 450'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select r.aplicado from public.registrar_pago(
    (select id from public.customers where customer_code='CL-VEL-0005'), 450, 'cash') r
  \gset p1_

  select case when cs.expected_cash = 450 and cs.payment_count = 1
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         cs.expected_cash as espera_efectivo, cs.payment_count as pagos
    from public.cash_sessions cs
   where cs.collector_id = '22222222-2222-2222-2222-222222222222' and cs.status='open';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · Una transferencia NO cuenta como efectivo en la caja'
\echo '  Se espera: PASA · efectivo sigue en 450, transferencias 450'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select r.aplicado from public.registrar_pago(
    (select id from public.customers where customer_code='CL-VEL-0006'),
    450, 'transfer', 'SPEI 4471') r
  \gset p2_

  select case when cs.expected_cash = 450 and cs.expected_transfer = 450
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         cs.expected_cash as efectivo, cs.expected_transfer as transferencias
    from public.cash_sessions cs
   where cs.collector_id = '22222222-2222-2222-2222-222222222222' and cs.status='open';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · Beto cierra con un faltante de $50'
\echo '  Se espera: PASA · se permite cerrar y la diferencia queda en -50'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select case when c.diferencia = -50 and c.esperado_efectivo = 450 and c.declarado = 400
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         c.esperado_efectivo, c.declarado, c.diferencia, c.transferencias, c.pagos
    from public.cerrar_caja(
           (select id from public.cash_sessions
             where collector_id='22222222-2222-2222-2222-222222222222' and status='open'),
           400, 'me falto un billete') c;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · Beto entrega su caja a Ana, y no puede verificarla él'
\echo '  Se espera: PASA · la entrega sí, la verificación no'
\echo '════════════════════════════════════════════════════════════════'
-- OJO: la entrega va FUERA del bloque con `exception`. Un bloque con manejo de
-- excepciones en plpgsql abre un punto de guardado propio: si algo revienta
-- adentro, se deshace TODO lo que ese bloque hizo, incluida la entrega. Así fue
-- como la prueba 6 falló la primera vez.
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select public.entregar_caja(
    (select id from public.cash_sessions
      where collector_id='22222222-2222-2222-2222-222222222222'
      order by opened_at desc limit 1),
    '11111111-1111-1111-1111-111111111111');

  select case when cs.status='delivered' then 'PASA' else '>>> FALLA <<<' end as entregada,
         cs.status
    from public.cash_sessions cs
   where cs.collector_id='22222222-2222-2222-2222-222222222222'
   order by cs.opened_at desc limit 1;
commit;

do $$
declare v_msg text; v_caja uuid;
begin
  select id into v_caja from public.cash_sessions
   where collector_id='22222222-2222-2222-2222-222222222222' order by opened_at desc limit 1;

  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  begin
    perform public.verificar_caja(v_caja);
    raise warning '>>> FALLA <<< el cobrador verificó una caja';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · a Beto se le rechazó: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · Ana sí la verifica'
\echo '  Se espera: PASA · la caja queda en verified'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.verificar_caja(
    (select id from public.cash_sessions
      where collector_id='22222222-2222-2222-2222-222222222222'
      order by opened_at desc limit 1), 'contado y correcto salvo los 50');

  select case when cs.status='verified' and cs.verified_at is not null
              then 'PASA' else '>>> FALLA <<<' end as resultado, cs.status
    from public.cash_sessions cs
   where cs.collector_id='22222222-2222-2222-2222-222222222222'
   order by cs.opened_at desc limit 1;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6b · NADIE verifica su propia caja, ni el administrador'
\echo '  Ana abre una caja suya, la cierra, la entrega y trata de darla'
\echo '  por buena ella misma. Tiene el permiso, pero es su propio dinero.'
\echo '  Se espera: PASA · la base la rechaza por ser suya'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_ana on commit drop as
  select public.abrir_caja(null) as caja;

  select c.declarado from public.cerrar_caja((select caja from t_ana), 0, 'dia sin cobros') c
  \gset ana_

  select public.entregar_caja((select caja from t_ana),
                              '22222222-2222-2222-2222-222222222222');
commit;

do $$
declare v_msg text; v_caja uuid;
begin
  select id into v_caja from public.cash_sessions
   where collector_id='11111111-1111-1111-1111-111111111111'
   order by opened_at desc limit 1;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.verificar_caja(v_caja);
    raise warning '>>> FALLA <<< Ana verificó su propia caja';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%propia%' then
      raise warning 'PASA · rechazada por ser suya: %', v_msg;
    else
      raise warning '>>> REVISAR <<< la rechazó, pero por otra razón: %', v_msg;
    end if;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · No se puede cortar antes del día 11'
\echo '  Se espera: PASA · agosto todavía no llega, la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_per uuid;
begin
  -- Se mueve el corte de agosto a un año adelante para que sea futuro seguro.
  update public.billing_periods
     set cutoff_date = current_date + 400,
         grace_end_date = current_date + 399,
         due_date = current_date + 398
   where year = 2026 and month = 8
  returning id into v_per;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.suspender_vencidos(v_per, true);
    raise warning '>>> FALLA <<< dejó cortar antes de tiempo';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · Simular el corte de julio no suspende a nadie'
\echo '  Se espera: PASA · devuelve la lista pero ningún servicio cambia'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_sim on commit drop as
  select * from public.suspender_vencidos(
    (select id from public.billing_periods where year=2026 and month=7), true);

  select case when count(*) > 0 and bool_and(not suspendido)
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         count(*) as les_tocaria
    from t_sim;

  select case when count(*) = 0 then 'PASA'
              else '>>> FALLA <<< sí suspendió en modo simulación' end as nadie_cortado,
         count(*)
    from public.customer_services where status='suspended';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 9 · El técnico no puede cortar'
\echo '  Se espera: PASA · la base lo rechaza por falta de permiso'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_per uuid;
begin
  select id into v_per from public.billing_periods where year=2026 and month=7;

  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.suspender_vencidos(v_per, false);
    raise warning '>>> FALLA <<< el técnico cortó servicios';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 10 · El corte de verdad suspende, y queda registrado'
\echo '  Se espera: PASA · suspende y deja renglón en service_suspensions'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_cortados on commit drop as
  select * from public.suspender_vencidos(
    (select id from public.billing_periods where year=2026 and month=7), false);

  select case when count(*) > 0 and bool_and(suspendido)
              then 'PASA' else '>>> FALLA <<<' end as resultado, count(*) as cortados
    from t_cortados;

  select case when (select count(*) from public.customer_services where status='suspended')
                 = (select count(*) from t_cortados)
              then 'PASA' else '>>> FALLA <<<' end as servicios_suspendidos,
         (select count(*) from public.customer_services where status='suspended') as suspendidos;

  select case when (select count(*) from public.service_suspensions where reactivated_at is null)
                 = (select count(*) from t_cortados)
              then 'PASA' else '>>> FALLA <<<' end as historial;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 11 · Reconectar reactiva y deja el cargo de $30'
\echo '  Se espera: PASA · servicio activo otra vez y un cargo de reconexión'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_recon on commit drop as
  select id as service_id from public.customer_services where status='suspended' limit 1;

  select case when r.reconectado and r.importe = 30 and r.cargo_id is not null
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         r.importe, r.cargo_id is not null as dejo_cargo
    from t_recon t, public.reconectar(t.service_id, true) r;

  select case when s.status = 'active' then 'PASA' else '>>> FALLA <<<' end as servicio,
         s.status
    from public.customer_services s join t_recon t on t.service_id = s.id;

  select case when ch.amount = 30 and ch.type = 'reconnection'
              then 'PASA' else '>>> FALLA <<<' end as cargo,
         ch.amount, ch.type, ch.status
    from public.charges ch
   where ch.service_id = (select service_id from t_recon) and ch.type='reconnection';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 12 · Reconectar algo que no está suspendido se rechaza'
\echo '  Se espera: PASA · la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_srv uuid;
begin
  select id into v_srv from public.customer_services where status='active' limit 1;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.reconectar(v_srv, true);
    raise warning '>>> FALLA <<< reconectó algo que no estaba cortado';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 13 · Los $550 del equipo no devuelto'
\echo '  Se espera: PASA · cargo de 550 tipo equipment_loss'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when e.importe = 550 and e.cargo_id is not null
              then 'PASA' else '>>> FALLA <<<' end as resultado, e.importe
    from public.cobrar_equipo_no_devuelto(
           (select id from public.customers where customer_code='CL-CUE-0030'),
           'ONT no regresada en la baja') e;

  select case when ch.type='equipment_loss' and ch.amount=550
              then 'PASA' else '>>> FALLA <<<' end as cargo, ch.description
    from public.charges ch
    join public.customers c on c.id = ch.customer_id
   where c.customer_code='CL-CUE-0030' and ch.type='equipment_loss';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 14 · El técnico no puede generar el cargo de los $550'
\echo '  Se espera: PASA · la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_cli uuid;
begin
  select id into v_cli from public.customers where customer_code='CL-CUE-0029';

  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.cobrar_equipo_no_devuelto(v_cli, 'prueba');
    raise warning '>>> FALLA <<< el técnico generó un cargo de dinero';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'RESUMEN'
\echo '════════════════════════════════════════════════════════════════'
select (select count(*) from public.cash_sessions)                          as cajas,
       (select count(*) from public.cash_sessions where status='verified')  as verificadas,
       (select count(*) from public.customer_services where status='suspended') as suspendidos,
       (select count(*) from public.service_suspensions)                    as cortes_registrados,
       (select count(*) from public.charges where type='reconnection')      as cargos_reconexion,
       (select count(*) from public.charges where type='equipment_loss')    as cargos_equipo;
