-- ============================================================================
-- PRUEBAS DE SEGURIDAD · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Las tres que el plan maestro exige antes de dar la etapa 3 por terminada.
-- Se corren con un rol SIN privilegios (authenticated), dentro de transacciones:
-- si se corren como superusuario, PostgreSQL se salta el RLS y la prueba miente.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
end $$;
grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- ------------------------------------------------------------------ escenario
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_admin uuid := '11111111-1111-1111-1111-111111111111';
  v_cobra uuid := '22222222-2222-2222-2222-222222222222';
  v_tec   uuid := '33333333-3333-3333-3333-333333333333';
  v_cue uuid; v_vel uuid; v_plan uuid; v_i int; v_cli uuid; v_srv uuid; v_per uuid;
begin
  select id into v_cue from public.zones where code='CUE';
  select id into v_vel from public.zones where code='VEL';

  insert into auth.users(id,email) values
    (v_admin,'admin@zuuum.test'),(v_cobra,'cobrador@zuuum.test'),(v_tec,'tecnico@zuuum.test')
  on conflict do nothing;
  insert into public.profiles(id,org_id,full_name,email) values
    (v_admin,v_org,'Ana Administradora','admin@zuuum.test'),
    (v_cobra,v_org,'Beto Cobrador','cobrador@zuuum.test'),
    (v_tec,v_org,'Carlos Tecnico','tecnico@zuuum.test')
  on conflict do nothing;
  insert into public.user_roles(user_id,role_id)
    select v_admin,id from public.roles where code='admin' union all
    select v_cobra,id from public.roles where code='office' union all
    select v_tec,id   from public.roles where code='technician'
  on conflict do nothing;

  -- Beto SOLO cobra en Velardeña. Nunca se le asigna Cuencamé.
  insert into public.user_zones(user_id,zone_id,can_collect) values (v_cobra,v_vel,true)
  on conflict do nothing;

  insert into public.service_plans(org_id,code,name,price,download_mbps)
    values (v_org,'P450','Plan 450',450,50) on conflict do nothing;
  select id into v_plan from public.service_plans where code='P450';

  insert into public.billing_periods(org_id,year,month,label,due_date,grace_end_date,cutoff_date)
    values (v_org,2026,7,'2026-07',date '2026-07-05',date '2026-07-10',date '2026-07-11')
  on conflict do nothing;
  select id into v_per from public.billing_periods where label='2026-07';

  for v_i in 1..30 loop
    insert into public.customers(org_id,customer_code,full_name,phone,zone_id)
    values (v_org,'CL-CUE-'||lpad(v_i::text,4,'0'),'Cliente prueba CUE '||v_i,'871',v_cue)
    on conflict do nothing returning id into v_cli;
    if v_cli is not null then
      insert into public.customer_services(org_id,customer_id,plan_id,status)
        values (v_org,v_cli,v_plan,'active') returning id into v_srv;
      insert into public.charges(org_id,customer_id,service_id,period_id,zone_id,type,amount,balance,due_date)
        values (v_org,v_cli,v_srv,v_per,v_cue,'monthly',450,450,date '2026-07-05');
    end if;
  end loop;

  for v_i in 1..12 loop
    insert into public.customers(org_id,customer_code,full_name,phone,zone_id)
    values (v_org,'CL-VEL-'||lpad(v_i::text,4,'0'),'Cliente prueba VEL '||v_i,'871',v_vel)
    on conflict do nothing returning id into v_cli;
    if v_cli is not null then
      insert into public.customer_services(org_id,customer_id,plan_id,status)
        values (v_org,v_cli,v_plan,'active') returning id into v_srv;
      insert into public.charges(org_id,customer_id,service_id,period_id,zone_id,type,amount,balance,due_date)
        values (v_org,v_cli,v_srv,v_per,v_vel,'monthly',450,450,date '2026-07-05');
    end if;
  end loop;
end $$;

\echo '───────────────────────────────────────────────────────────────'
\echo 'PRUEBA 1 · El TÉCNICO no puede ver dinero'
\echo '  Se espera: 0 cargos, 0 pagos. Cero, no error.'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  select count(*) as cargos_que_ve, (select count(*) from public.payments) as pagos_que_ve
    from public.charges;
commit;

\echo '───────────────────────────────────────────────────────────────'
\echo 'PRUEBA 2 · El COBRADOR de Velardeña solo ve su zona'
\echo '  Se espera: 12 clientes, no 42.'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  select count(*) as clientes_que_ve from public.customers;
  select z.name as zona, count(*) from public.customers c
    join public.zones z on z.id=c.zone_id group by z.name;
commit;

\echo '───────────────────────────────────────────────────────────────'
\echo 'PRUEBA 3 · El ADMINISTRADOR sí ve todo'
\echo '  Se espera: 42 clientes y 42 cargos.'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  select count(*) as clientes_que_ve, (select count(*) from public.charges) as cargos_que_ve
    from public.customers;
commit;

\echo '───────────────────────────────────────────────────────────────'
\echo 'PRUEBA 4 · El candado de permisos sensibles'
\echo '  Se espera: la base RECHAZA darle payments.read a un técnico.'
do $$
begin
  insert into public.user_permissions(user_id,permission_id,granted)
  select '33333333-3333-3333-3333-333333333333', id, true
    from public.permissions where code='payments.read';
  raise exception 'FALLO — la base lo permitió, el candado no sirve';
exception
  when check_violation then
    raise notice 'CORRECTO · rechazado: %', left(sqlerrm,80);
end $$;

\echo '───────────────────────────────────────────────────────────────'
\echo 'PRUEBA 5 · Permiso efectivo por persona'
select p.full_name,
       public.auth_has('customers.read') as clientes,
       public.auth_has('payments.read')  as pagos,
       public.auth_has('orders.read')    as ordenes,
       public.auth_has('finance.read')   as finanzas
  from public.profiles p,
       lateral (select set_config('request.jwt.claim.sub', p.id::text, true)) _
 order by p.full_name;

\echo '───────────────────────────────────────────────────────────────'
\echo 'PRUEBA 6 · Un cobrador no puede registrar un pago fuera de su zona'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare v_cli uuid; v_cue uuid;
  begin
    select id into v_cue from public.zones where code='CUE';
    select id into v_cli from public.customers where zone_id=v_cue limit 1;
    if v_cli is null then
      raise notice 'CORRECTO · Beto ni siquiera puede LEER un cliente de Cuencamé';
      return;
    end if;
    insert into public.payments(org_id,receipt_number,customer_id,zone_id,amount,method,received_by)
    values ('00000000-0000-0000-0000-000000000001','RC-X-1',v_cli,v_cue,450,'cash',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'FALLO — pudo cobrar en una zona que no es suya';
  exception when insufficient_privilege or check_violation then
    raise notice 'CORRECTO · rechazado por RLS';
  end $$;
rollback;

\echo '───────────────────────────────────────────────────────────────'
\echo 'PRUEBA 7 · Folios por zona'
select public.siguiente_folio('00000000-0000-0000-0000-000000000001',
       (select id from public.zones where code='CUE'),'order') as folio_1,
       public.siguiente_folio('00000000-0000-0000-0000-000000000001',
       (select id from public.zones where code='CUE'),'order') as folio_2,
       public.siguiente_folio('00000000-0000-0000-0000-000000000001',
       (select id from public.zones where code='VEL'),'order') as folio_velardena;
