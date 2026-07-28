-- ============================================================================
--  PRUEBA DE SEGURIDAD CON EL PADRÓN REAL YA CARGADO
--  Se corre después de ESQUEMA_COMPLETO.sql + CARGA_PADRON.sql.
--  Crea tres usuarios de prueba y comprueba qué ve cada uno.
--  Al final los borra: no deja basura.
-- ============================================================================
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

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  t uuid := 'cccccccc-0000-0000-0000-000000000003';
begin
  insert into auth.users(id,email) values (a,'p_admin@test'),(b,'p_cobra@test'),(t,'p_tec@test')
  on conflict do nothing;
  insert into public.profiles(id,org_id,full_name) values
    (a,v_org,'PRUEBA Administradora'),(b,v_org,'PRUEBA Cobrador Velardeña'),(t,v_org,'PRUEBA Técnico')
  on conflict do nothing;
  insert into public.user_roles(user_id,role_id)
    select a,id from public.roles where code='admin' union all
    select b,id from public.roles where code='office' union all
    select t,id from public.roles where code='technician'
  on conflict do nothing;
  insert into public.user_zones(user_id,zone_id,can_collect)
    select b, id, true from public.zones where code='VEL'
  on conflict do nothing;
end $$;

\echo ''
\echo '══════════ CON LOS 1,102 CLIENTES REALES CARGADOS ══════════'
\echo ''
\echo '── El ADMINISTRADOR: debe ver 1102 clientes y 10705 cargos'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) as clientes, (select count(*) from public.charges) as cargos,
         '$'||to_char((select sum(custom_price) from public.customer_services),'FM999,999') as ingreso
    from public.customers;
commit;

\echo ''
\echo '── El COBRADOR de Velardeña: debe ver 207, NO 1102'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
  select count(*) as clientes_que_ve,
         (select count(distinct z.name) from public.customers c
            join public.zones z on z.id=c.zone_id) as zonas_que_ve,
         (select count(*) from public.charges) as cargos_que_ve
    from public.customers;
commit;

\echo ''
\echo '── El TÉCNICO: debe ver 0 clientes, 0 cargos, 0 pagos'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
  select (select count(*) from public.customers) as clientes,
         (select count(*) from public.charges)   as cargos,
         (select count(*) from public.payments)  as pagos,
         (select count(*) from public.inventory_items) as inventario;
commit;

\echo ''
\echo '── Limpieza: se borran los usuarios de prueba'
delete from public.user_zones where user_id in
  ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',
   'cccccccc-0000-0000-0000-000000000003');
delete from public.user_roles where user_id in
  ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',
   'cccccccc-0000-0000-0000-000000000003');
delete from public.profiles where full_name like 'PRUEBA %';
delete from auth.users where email like 'p_%@test';
\echo '   listo, no quedó nada'
