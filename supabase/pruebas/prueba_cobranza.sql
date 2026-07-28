-- ============================================================================
-- PRUEBAS DE COBRANZA · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Se corre DESPUÉS de prueba_seguridad.sql, sobre el mismo escenario:
--   Ana  = administradora, ve todo
--   Beto = cobrador, SOLO Velardeña
--   Carlos = técnico, no toca dinero
--   30 clientes en Cuencamé + 12 en Velardeña, todos con cargo de $450
--
-- Cada prueba dice sola si PASA o FALLA. No hay que interpretar números.
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
\echo 'PRUEBA 1 · Beto cobra $450 a un cliente SUYO (Velardeña)'
\echo '  Se espera: PASA · folio RC-VEL-0001 · aplicado 450 · sobra 0'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select case when r.receipt_number like 'RC-VEL-%'
               and r.aplicado = 450 and r.saldo_a_favor = 0
               and r.cargos_pagados = 1
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         r.receipt_number as folio, r.aplicado, r.saldo_a_favor, r.cargos_pagados
    from public.registrar_pago(
           (select id from public.customers where customer_code = 'CL-VEL-0001'),
           450, 'cash') r;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · El cargo quedó pagado y el cliente al corriente'
\echo '  Se espera: PASA · saldo 0 · estado paid'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select case when ch.balance = 0 and ch.status = 'paid'
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         ch.amount, ch.balance, ch.status
    from public.charges ch
    join public.customers c on c.id = ch.customer_id
   where c.customer_code = 'CL-VEL-0001';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · Beto NO puede cobrarle a un cliente de Cuencamé'
\echo '  Se espera: PASA · la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
-- OJO: el id del cliente se busca ANTES de ponerse el rol de Beto. Si se busca
-- después, las RLS se lo esconden, la función recibe NULL y la prueba "pasa"
-- por el motivo equivocado. Lo que aquí se quiere probar es el candado de zona
-- dentro de registrar_pago, no el de la vista.
do $$
declare v_msg text; v_cli uuid;
begin
  select id into v_cli from public.customers where customer_code = 'CL-CUE-0001';

  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  begin
    perform public.registrar_pago(v_cli, 450, 'cash');
    raise warning '>>> FALLA <<< le dejó cobrar fuera de su zona';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%zona%' then
      raise warning 'PASA · rechazado por zona: %', v_msg;
    else
      raise warning '>>> REVISAR <<< lo rechazó, pero por otra razón: %', v_msg;
    end if;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · El TÉCNICO no puede registrar pagos'
\echo '  Se espera: PASA · la base lo rechaza por falta de permiso'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_cli uuid;
begin
  select id into v_cli from public.customers where customer_code = 'CL-VEL-0002';

  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.registrar_pago(v_cli, 450, 'cash');
    raise warning '>>> FALLA <<< el técnico cobró';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · Pago de MÁS: $700 sobre un cargo de $450'
\echo '  Se espera: PASA · aplicado 450 · saldo a favor 250'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select case when r.aplicado = 450 and r.saldo_a_favor = 250
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         r.aplicado, r.saldo_a_favor
    from public.registrar_pago(
           (select id from public.customers where customer_code = 'CL-VEL-0002'),
           700, 'cash') r;

  select case when v.saldo_a_favor = 250 then 'PASA' else '>>> FALLA <<<' end as en_la_vista,
         v.saldo_a_favor
    from public.v_saldo_a_favor v
    join public.customers c on c.id = v.customer_id
   where c.customer_code = 'CL-VEL-0002';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · Pago PARCIAL: $200 sobre un cargo de $450'
\echo '  Se espera: PASA · el cargo queda en partial con saldo 250'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select r.aplicado from public.registrar_pago(
    (select id from public.customers where customer_code = 'CL-VEL-0003'), 200, 'cash') r
  \gset cobro_

  select case when ch.balance = 250 and ch.status = 'partial'
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         ch.balance, ch.status
    from public.charges ch
    join public.customers c on c.id = ch.customer_id
   where c.customer_code = 'CL-VEL-0003';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · Reintento del SUNMI: el mismo pago dos veces'
\echo '  Se espera: PASA · el segundo devuelve el MISMO folio, no cobra doble'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  create temporary table t_reintento on commit drop as
  select r.receipt_number as folio1
    from public.registrar_pago(
           (select id from public.customers where customer_code = 'CL-VEL-0004'),
           450, 'cash', null, null,
           'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid) r;

  select case when r.receipt_number = t.folio1 and r.ya_existia
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         t.folio1 as primer_folio, r.receipt_number as segundo_folio, r.ya_existia
    from t_reintento t,
         public.registrar_pago(
           (select id from public.customers where customer_code = 'CL-VEL-0004'),
           450, 'cash', null, null,
           'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid) r;

  select case when count(*) = 1 then 'PASA' else '>>> FALLA <<< se guardó dos veces' end
           as pagos_guardados, count(*)
    from public.payments p
    join public.customers c on c.id = p.customer_id
   where c.customer_code = 'CL-VEL-0004';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · Cancelar un pago: solo el administrador, y el saldo regresa'
\echo '  Se espera: PASA · Beto no puede · Ana sí · el cargo vuelve a deber 450'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_pago uuid;
begin
  select p.id into v_pago from public.payments p
    join public.customers c on c.id = p.customer_id
   where c.customer_code = 'CL-VEL-0001' limit 1;

  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  begin
    perform public.cancelar_pago(v_pago, 'me equivoque de cliente');
    raise warning '>>> FALLA <<< el cobrador canceló un pago';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · a Beto se le rechazó: %', v_msg;
  end;
  reset role;
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.cancelar_pago(
    (select p.id from public.payments p
       join public.customers c on c.id = p.customer_id
      where c.customer_code = 'CL-VEL-0001' limit 1),
    'cobro duplicado, se devuelve al cliente');

  select case when ch.balance = 450 and ch.status = 'pending'
              then 'PASA' else '>>> FALLA <<<' end as saldo_regreso,
         ch.balance, ch.status
    from public.charges ch
    join public.customers c on c.id = ch.customer_id
   where c.customer_code = 'CL-VEL-0001';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 9 · Motivo obligatorio al cancelar'
\echo '  Se espera: PASA · la base exige que se escriba por qué'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.cancelar_pago(
      (select p.id from public.payments p
         join public.customers c on c.id = p.customer_id
        where c.customer_code = 'CL-VEL-0002' limit 1), 'x');
    raise warning '>>> FALLA <<< canceló sin motivo';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 10 · Generar el mes no duplica cargos'
\echo '  Se espera: PASA · la segunda corrida genera 0 y omite los 42'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when g.generados = 0 and g.omitidos = 42
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         g.generados, g.omitidos, g.sin_precio
    from public.generar_cargos_mensuales(
           (select id from public.billing_periods where label = '2026-07')) g;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 11 · Abrir agosto pone las fechas del 5, 10 y 11'
\echo '  Se espera: PASA · vence 05-ago · gracia 10-ago · corte 11-ago'
\echo '════════════════════════════════════════════════════════════════'
-- El abrir_periodo va en su PROPIA consulta. Si se pone dentro del `where` de
-- la consulta que lo lee, la fila recién insertada no existe todavía para la
-- foto que esa consulta tomó al empezar, y devuelve cero renglones.
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.abrir_periodo(2026, 8) as periodo_de_agosto;

  select case when bp.due_date = date '2026-08-05'
               and bp.grace_end_date = date '2026-08-10'
               and bp.cutoff_date = date '2026-08-11'
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         bp.label, bp.due_date as vence, bp.grace_end_date as gracia, bp.cutoff_date as corte
    from public.billing_periods bp
   where bp.year = 2026 and bp.month = 8;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 12 · Agosto genera los 42 cargos, ninguno sin precio'
\echo '  Se espera: PASA · generados 42'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when g.generados = 42 and g.sin_precio = 0
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         g.generados, g.omitidos, g.sin_precio
    from public.generar_cargos_mensuales(
           (select id from public.billing_periods where year=2026 and month=8)) g;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 13 · EL QUE PAGÓ ADELANTADO NO AMANECE MOROSO'
\echo '  CL-VEL-0002 pagó $700 en julio: $450 del mes y $250 adelantados.'
\echo '  Al generar agosto, esos $250 deben haberse aplicado SOLOS.'
\echo '  Se espera: PASA · agosto debe 200, no 450 · sin saldo flotando'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when ch.balance = 200 and ch.status = 'partial'
              then 'PASA' else '>>> FALLA <<<' end as cargo_de_agosto,
         ch.amount, ch.balance, ch.status
    from public.charges ch
    join public.customers c on c.id = ch.customer_id
    join public.billing_periods bp on bp.id = ch.period_id
   where c.customer_code = 'CL-VEL-0002' and bp.year = 2026 and bp.month = 8;

  select case when count(*) = 0 then 'PASA'
              else '>>> FALLA <<< quedó dinero sin acomodar' end as sin_saldo_flotando,
         coalesce(sum(v.saldo_a_favor), 0) as saldo
    from public.v_saldo_a_favor v
    join public.customers c on c.id = v.customer_id
   where c.customer_code = 'CL-VEL-0002';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 14 · Aplicar saldos dos veces no regala dinero'
\echo '  Se espera: PASA · la segunda corrida aplica $0'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when s.aplicado = 0 then 'PASA' else '>>> FALLA <<<' end as resultado,
         s.clientes, s.aplicado
    from public.aplicar_saldos_a_favor() s;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 15 · Nadie recibió más dinero del que entregó'
\echo '  La suma aplicada de cada pago nunca puede pasar de su importe.'
\echo '  Se espera: PASA · 0 pagos sobregirados'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when count(*) = 0 then 'PASA'
              else '>>> FALLA <<<' end as resultado, count(*) as sobregirados
    from public.payments p
   where coalesce((select sum(a.amount) from public.payment_allocations a
                    where a.payment_id = p.id), 0) > p.amount;

  select case when count(*) = 0 then 'PASA'
              else '>>> FALLA <<<' end as cargos_sanos, count(*) as cargos_raros
    from public.charges
   where balance < 0 or balance > amount;
commit;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'RESUMEN'
\echo '════════════════════════════════════════════════════════════════'
select (select count(*) from public.payments where status='applied')   as pagos_vigentes,
       (select count(*) from public.payments where status='cancelled') as pagos_cancelados,
       (select count(*) from public.payment_allocations)               as aplicaciones,
       (select count(*) from public.charges)                           as cargos_totales,
       (select count(*) from public.charges where status='paid')       as cargos_pagados,
       (select coalesce(sum(saldo_a_favor),0) from public.v_saldo_a_favor) as saldo_a_favor;
