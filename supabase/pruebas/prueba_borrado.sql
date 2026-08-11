-- ============================================================================
-- PRUEBAS DE BORRADO · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Se corre después de prueba_seguridad.sql.
--
-- Lo que se prueba no es que borre —eso es fácil— sino que se NIEGUE a borrar
-- cuando algo depende del renglón. Un borrado en cascada aquí desconectaría
-- clientes sin que nadie se entere.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

insert into public.branches (id, org_id, name, type)
values ('bbbbbbbb-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001', 'Bodega borrado', 'warehouse')
on conflict do nothing;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 1 · Un sitio vacío sí se borra'
\echo '  Se espera: PASA · ya no existe'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_s1 on commit drop as
  select public.guardar_sitio(null, 'Sitio con dedazo', 'tower',
                              (select id from public.zones where code = 'CUE')) as id;

  select public.eliminar_sitio((select id from t_s1));

  select case when not exists (select 1 from public.network_sites
                                where id = (select id from t_s1))
              then 'PASA' else '>>> FALLA <<<' end as resultado;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · Un sitio CON equipos no se borra'
\echo '  Se espera: PASA · lo niega y dice cuántos equipos hay'
\echo '════════════════════════════════════════════════════════════════'
-- Los ids se preparan aquí, con permisos plenos, y viajan en tabla temporal:
-- psql no sustituye variables dentro de un bloque $$ ... $$.
drop table if exists t_fix;
create temporary table t_fix (que text, id uuid);

do $$
declare v_sitio uuid; v_disp uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  v_sitio := public.guardar_sitio(null, 'Torre con equipo', 'tower',
                                  (select id from public.zones where code = 'CUE'));
  v_disp  := public.guardar_dispositivo(null, 'Sector de prueba', 'sector',
                                        v_sitio, null, '10.99.0.1', 'Mimosa', 'C5c');

  reset role;
  insert into t_fix values ('sitio', v_sitio), ('dispositivo', v_disp);
end $$;

do $$
declare v_msg text; v_id uuid;
begin
  select id into v_id from t_fix where que = 'sitio';
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.eliminar_sitio(v_id);
    raise notice '>>> FALLA <<< borró un sitio que tenía equipos';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%tiene un equipo%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · Se borra el equipo y entonces sí sale el sitio'
\echo '  Se espera: PASA · los dos desaparecen'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_sitio uuid; v_disp uuid; v_quedan int;
begin
  select id into v_sitio from t_fix where que = 'sitio';
  select id into v_disp  from t_fix where que = 'dispositivo';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  perform public.eliminar_dispositivo(v_disp);
  perform public.eliminar_sitio(v_sitio);

  reset role;
  select count(*) into v_quedan from public.network_sites where id = v_sitio;
  if v_quedan = 0 and not exists (select 1 from public.network_devices where id = v_disp) then
    raise notice 'PASA · el equipo y el sitio ya no están';
  else
    raise notice '>>> FALLA <<< quedó algo';
  end if;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · Una NAP con clientes colgados no se borra'
\echo '  Se espera: PASA · lo niega y habla de clientes, no de renglones'
\echo '════════════════════════════════════════════════════════════════'
drop table if exists t_nap;
create temporary table t_nap (id uuid);

do $$
declare v_nap uuid; v_srv uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  v_nap := public.guardar_elemento(null, 'NAP-PRUEBA-01', 'nap', 'Frente a la escuela',
                                   (select id from public.zones where code = 'CUE'),
                                   null, null, 8);
  reset role;

  select s.id into v_srv from public.customer_services s
    join public.customers c on c.id = s.customer_id
    join public.zones z on z.id = c.zone_id
   where z.code = 'CUE' limit 1;

  update public.customer_services set network_element_id = v_nap where id = v_srv;
  insert into t_nap values (v_nap);
end $$;

do $$
declare v_msg text; v_id uuid;
begin
  select id into v_id from t_nap;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.eliminar_elemento(v_id);
    raise notice '>>> FALLA <<< borró una NAP con clientes';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%un cliente conectado%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · Un artículo con existencia no se borra'
\echo '  Se espera: PASA · lo niega y dice cuánto hay'
\echo '════════════════════════════════════════════════════════════════'
drop table if exists t_art2;
create temporary table t_art2 (id uuid);

do $$
declare v_art uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  v_art := public.guardar_articulo(null, 'CBL-PRUEBA', 'Cable de prueba', 'drop_cable',
                                   'meter', false, 0, 8);
  perform public.mover_inventario(v_art, 300, 'purchase', null, null,
                                  'branch', 'bbbbbbbb-0000-0000-0000-000000000002',
                                  'Compra de prueba');
  reset role;
  insert into t_art2 values (v_art);
end $$;

do $$
declare v_msg text; v_id uuid;
begin
  select id into v_id from t_art2;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.eliminar_articulo(v_id);
    raise notice '>>> FALLA <<< borró un artículo con existencia';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%existencia%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · Sacada la existencia, tampoco se borra: ya tiene historia'
\echo '  Se espera: PASA · lo niega por los movimientos y sugiere apagarlo'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_id uuid;
begin
  select id into v_id from t_art2;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  perform public.mover_inventario(v_id, 300, 'adjustment',
                                  'branch', 'bbbbbbbb-0000-0000-0000-000000000002',
                                  null, null, 'Se saca para la prueba');
  begin
    perform public.eliminar_articulo(v_id);
    raise notice '>>> FALLA <<< borró un artículo con movimientos';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%movimientos%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · Carlos (técnico) no puede borrar nada de la red'
\echo '  Se espera: PASA · lo rechaza por permiso'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_id uuid;
begin
  select id into v_id from t_nap;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.eliminar_elemento(v_id);
    raise notice '>>> FALLA <<< Carlos borró un elemento de red';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%permiso%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · El borrado queda en la bitácora'
\echo '  Se espera: PASA · hay un renglón de borrado de network_sites'
\echo '════════════════════════════════════════════════════════════════'
select case when count(*) >= 2 then 'PASA' else '>>> FALLA <<<' end as resultado,
       count(*) as borrados_registrados
  from public.audit_logs
 where table_name in ('network_sites', 'network_devices')
   and action = 'delete';

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'FIN DE LAS PRUEBAS DE BORRADO'
\echo '════════════════════════════════════════════════════════════════'
