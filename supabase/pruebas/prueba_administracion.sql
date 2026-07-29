-- ============================================================================
-- PRUEBAS DE ADMINISTRACIÓN · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Se corre después de prueba_seguridad.sql.
--   Ana  = administradora   Beto = oficina/cobranza   Carlos = técnico
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- Una cuenta de Auth ya creada, como la que crearía Supabase al invitar.
insert into auth.users(id, email)
values ('44444444-4444-4444-4444-444444444444', 'nuevo@zuuum.test')
on conflict do nothing;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 1 · Ana da de alta a un cobrador con sus zonas'
\echo '  Se espera: PASA · perfil creado, rol office, 1 zona, cobra en ella'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- Se le da Velardeña, que es donde el escenario tiene clientes. Con una zona
  -- vacía la prueba 2 diría "PASA" viendo cero, que es lo mismo que diría si
  -- las RLS estuvieran rotas al revés.
  select public.alta_persona(
    '44444444-4444-4444-4444-444444444444',
    'Daniel Cobrador', 'nuevo@zuuum.test', 'office',
    array[(select id from public.zones where code='VEL')],
    array[(select id from public.zones where code='VEL')]);

  select case when v.rol_codigo='office' and v.zonas=1 and v.zonas_cobra=1 and v.is_active
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         v.full_name, v.rol, v.zonas, v.zonas_cobra
    from public.v_personas v where v.id='44444444-4444-4444-4444-444444444444';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · El nuevo cobrador solo ve SU zona'
\echo '  Se espera: PASA · ve los 12 de Velardeña y nada más'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

  select case when count(*) = 12 and count(distinct z.code) = 1
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         count(*) as clientes_que_ve,
         coalesce(string_agg(distinct z.code, ','), 'ninguna') as zonas_que_ve
    from public.customers c join public.zones z on z.id = c.zone_id;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · El TÉCNICO no puede dar de alta gente'
\echo '  Se espera: PASA · la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.alta_persona('44444444-4444-4444-4444-444444444444',
                                'Yo Mismo Jefe', 'x@x.test', 'owner');
    raise warning '>>> FALLA <<< el técnico dio de alta a alguien';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · Nadie crea a alguien con más alcance del que tiene'
\echo '  A Beto (oficina, solo sus zonas) se le DA users.write, y aun así'
\echo '  no puede fabricarse un propietario.'
\echo '  Se espera: PASA · rechazado POR ALCANCE, no por falta de permiso'
\echo '════════════════════════════════════════════════════════════════'
-- OJO: primero hay que darle el permiso. Sin esto la prueba "pasa" porque a
-- Beto le falta users.write, y entonces no comprueba el candado de alcance,
-- que es lo único que aquí interesa.
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  select public.ajustar_permiso('22222222-2222-2222-2222-222222222222','users.write', true);
commit;

insert into auth.users(id, email)
values ('55555555-5555-5555-5555-555555555555', 'beto2@zuuum.test')
on conflict do nothing;

do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  begin
    perform public.alta_persona('55555555-5555-5555-5555-555555555555',
                                'Beto Segunda Cuenta', 'beto2@zuuum.test', 'owner');
    raise warning '>>> FALLA <<< se fabricó un propietario';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%alcance%' then
      raise warning 'PASA · rechazado por alcance: %', v_msg;
    else
      raise warning '>>> REVISAR <<< rechazado por otra razón: %', v_msg;
    end if;
  end;
  reset role;
end $$;

\echo '  · y con un rol de su mismo nivel, Beto SÍ puede:'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select case when public.alta_persona('55555555-5555-5555-5555-555555555555',
                                       'Beto Ayudante', 'beto2@zuuum.test', 'technician')
              is not null then 'PASA' else '>>> FALLA <<<' end as resultado;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · Nadie se desactiva a sí mismo'
\echo '  Se espera: PASA · la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.editar_persona('11111111-1111-1111-1111-111111111111', null, null, false);
    raise warning '>>> FALLA <<< Ana se apagó a sí misma';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · Nadie se quita a sí mismo el permiso de administrar'
\echo '  Se espera: PASA · la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.ajustar_permiso('11111111-1111-1111-1111-111111111111','users.write', false);
    raise warning '>>> FALLA <<< se cerró la puerta por dentro';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · Cambiar de rol borra los permisos sueltos'
\echo '  A Daniel se le da un permiso extra, luego pasa a técnico.'
\echo '  Se espera: PASA · el permiso suelto se fue con el cargo'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.ajustar_permiso('44444444-4444-4444-4444-444444444444','reports.read', true);

  select case when count(*) = 1 then 'PASA · lo tenía' else '>>> FALLA <<<' end as antes,
         count(*)
    from public.user_permissions where user_id='44444444-4444-4444-4444-444444444444';

  select public.editar_persona('44444444-4444-4444-4444-444444444444', null, 'technician');

  select case when count(*) = 0 then 'PASA · se fue con el cargo' else '>>> FALLA <<<' end as despues,
         count(*)
    from public.user_permissions where user_id='44444444-4444-4444-4444-444444444444';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · Un permiso de dinero a alguien operativo se rechaza'
\echo '  Daniel ya es técnico. Se le intenta dar payments.create.'
\echo '  Se espera: PASA · el candado de la 004 lo impide'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.ajustar_permiso('44444444-4444-4444-4444-444444444444','payments.create', true);
    raise warning '>>> FALLA <<< un técnico quedó con permiso de cobrar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 9 · Alta y edición de zona, con el código congelado'
\echo '  Se espera: PASA · se crea, se le cambia el nombre, el código no'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_zona on commit drop as
  select public.guardar_zona(null, 'Zona de Prueba', 'ZPR', true) as id;

  select public.guardar_zona((select id from t_zona), 'Zona Renombrada', 'OTRO', true);

  select case when z.name='Zona Renombrada' and z.code='ZPR'
              then 'PASA · nombre cambió, código no' else '>>> FALLA <<<' end as resultado,
         z.name, z.code
    from public.zones z where z.id = (select id from t_zona);
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 10 · Cambiar el precio del plan NO se lo cambia a quien ya lo tiene'
\echo '  Se espera: PASA · el plan sube a 600, el cliente sigue en 450'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- El cliente de prueba trae precio propio, como todos los que vinieron del Excel.
  update public.customer_services set custom_price = 450
   where customer_id = (select id from public.customers where customer_code='CL-CUE-0001');

  select public.guardar_plan((select id from public.service_plans where code='P450'),
                             null, 'Plan 450 (subió)', 600, 50, 10, 'both', true, true, null);

  select case when p.price = 600 and s.custom_price = 450
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         p.price as precio_del_plan, s.custom_price as lo_que_paga_el_cliente
    from public.service_plans p, public.customer_services s
   where p.code='P450'
     and s.customer_id = (select id from public.customers where customer_code='CL-CUE-0001');
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 11 · Un día de corte imposible se rechaza'
\echo '  Vence el 5, gracia 5 días, y se intenta poner el corte el día 3.'
\echo '  Se espera: PASA · la base no deja que exista esa combinación'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.guardar_ajuste('billing.cutoff_day', '3');
    raise warning '>>> FALLA <<< quedó un corte antes de la gracia';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 12 · Un ajuste numérico con letras se rechaza'
\echo '  Se espera: PASA · la base lo caza al guardar, no el día 11'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.guardar_ajuste('billing.cutoff_day', 'once');
    raise warning '>>> FALLA <<< guardó "once" como día de corte';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 13 · Un cambio válido sí entra'
\echo '  Se espera: PASA · la reconexión pasa de $30 a $50'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.guardar_ajuste('billing.reconnection_fee', '50');

  select case when public.ajuste_numero('00000000-0000-0000-0000-000000000001',
                                        'billing.reconnection_fee', 30) = 50
              then 'PASA' else '>>> FALLA <<<' end as resultado;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 14 · El técnico no puede cambiar reglas de negocio'
\echo '  Se espera: PASA · la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.guardar_ajuste('billing.reconnection_fee', '0');
    raise warning '>>> FALLA <<< el técnico se perdonó la reconexión';
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
select (select count(*) from public.profiles)          as personas,
       (select count(*) from public.user_zones)        as asignaciones_de_zona,
       (select count(*) from public.user_permissions)  as permisos_sueltos,
       (select count(*) from public.zones)             as zonas,
       (select count(*) from public.service_plans)     as planes;
