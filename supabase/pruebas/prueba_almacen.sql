-- ============================================================================
-- PRUEBAS DE ALMACÉN Y RED · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Se corre después de prueba_seguridad.sql.
--   Ana = administradora   Beto = oficina   Carlos = técnico
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- Una sucursal donde guardar las cosas.
insert into public.branches (id, org_id, name, type)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001', 'Bodega Cuencamé', 'warehouse')
on conflict do nothing;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 1 · Alta de artículo y entrada de 50 piezas'
\echo '  Se espera: PASA · existencia 50'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_art on commit drop as
  select public.guardar_articulo(null, 'ONT-HW', 'ONT Huawei HG8310', 'ont',
                                 'piece', true, 10, 550, 'Huawei', 'HG8310M') as id;

  select public.mover_inventario((select id from t_art), 50, 'purchase',
                                 null, null, 'branch',
                                 'bbbbbbbb-0000-0000-0000-000000000001',
                                 'Compra inicial');

  select case when v.existencia = 50 then 'PASA' else '>>> FALLA <<<' end as resultado,
         v.sku, v.existencia
    from public.v_inventario v where v.id = (select id from t_art);
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · Sacar más de lo que hay se rechaza'
\echo '  Se espera: PASA · el almacén nunca queda en negativo'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_art uuid;
begin
  select id into v_art from public.inventory_items where sku='ONT-HW';
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.mover_inventario(v_art, 80, 'transfer', 'branch',
                                    'bbbbbbbb-0000-0000-0000-000000000001',
                                    'technician', '33333333-3333-3333-3333-333333333333');
    raise warning '>>> FALLA <<< el almacén quedó en negativo';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · Traspaso a Carlos: 10 piezas'
\echo '  Se espera: PASA · bodega 40, Carlos 10'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.mover_inventario(
    (select id from public.inventory_items where sku='ONT-HW'), 10, 'transfer',
    'branch', 'bbbbbbbb-0000-0000-0000-000000000001',
    'technician', '33333333-3333-3333-3333-333333333333', 'Sale a instalar');

  select case when bodega = 40 and tecnico = 10 then 'PASA' else '>>> FALLA <<<' end as resultado,
         bodega, tecnico
    from (
      select (select quantity from public.inventory_stock
               where location_type='branch' and location_id='bbbbbbbb-0000-0000-0000-000000000001'
                 and item_id=(select id from public.inventory_items where sku='ONT-HW')) as bodega,
             (select quantity from public.inventory_stock
               where location_type='technician' and location_id='33333333-3333-3333-3333-333333333333'
                 and item_id=(select id from public.inventory_items where sku='ONT-HW')) as tecnico
    ) x;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · El serial GPON se guarda limpio'
\echo '  Se da de alta con guiones y minúsculas; debe quedar sin nada de eso.'
\echo '  Se espera: PASA · HWTC12AB34CD'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.alta_equipo('ONT000001',
                            (select id from public.inventory_items where sku='ONT-HW'),
                            'hwtc-12ab:34cd', '00:11:22:33:44:55', 'Huawei', 'HG8310M',
                            'branch', 'bbbbbbbb-0000-0000-0000-000000000001');

  select case when gpon_serial = 'HWTC12AB34CD' then 'PASA' else '>>> FALLA <<<' end as resultado,
         serial_number, gpon_serial
    from public.equipment_units where serial_number='ONT000001';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · Dos equipos con la misma serie se rechazan'
\echo '  Se espera: PASA · la serie es única'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.alta_equipo('ONT000001');
    raise warning '>>> FALLA <<< se duplicó la serie';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · Instalar el equipo en casa de un cliente'
\echo '  Se espera: PASA · queda instalado, amarrado al servicio, 1 vuelta'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when r.veces_instalado = 1 then 'PASA' else '>>> FALLA <<<' end as resultado,
         r.veces_instalado
    from public.instalar_equipo('ONT000001',
      (select s.id from public.customer_services s
         join public.customers c on c.id = s.customer_id
        where c.customer_code='CL-CUE-0001' limit 1)) r;

  select case when e.status='installed' and e.customer_id is not null and s.equipment_unit_id = e.id
              then 'PASA · amarrado al servicio' else '>>> FALLA <<<' end as amarre
    from public.equipment_units e
    join public.customer_services s on s.equipment_unit_id = e.id
   where e.serial_number='ONT000001';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · Instalarlo en otro domicilio sin recuperarlo se rechaza'
\echo '  Se espera: PASA · un equipo no puede estar en dos casas'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_srv uuid;
begin
  select s.id into v_srv from public.customer_services s
    join public.customers c on c.id = s.customer_id
   where c.customer_code='CL-CUE-0002' limit 1;

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.instalar_equipo('ONT000001', v_srv);
    raise warning '>>> FALLA <<< el mismo equipo quedó en dos casas';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · Lo devolvió: regresa al almacén, sin cargo'
\echo '  Se espera: PASA · in_stock y ningún cargo de equipo'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when not r.cobrado and r.importe = 0 then 'PASA' else '>>> FALLA <<<' end as resultado,
         r.cobrado, r.importe
    from public.recuperar_equipo('ONT000001', true,
                                 'bbbbbbbb-0000-0000-0000-000000000001', 'Baja voluntaria') r;

  select case when status='in_stock' and customer_id is null
              then 'PASA · de vuelta en bodega' else '>>> FALLA <<<' end as estado, status
    from public.equipment_units where serial_number='ONT000001';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 9 · NO lo devolvió: se marca perdido y se cobran los $550'
\echo '  Se espera: PASA · perdido + cargo de 550'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.instalar_equipo('ONT000001',
    (select s.id from public.customer_services s
       join public.customers c on c.id = s.customer_id
      where c.customer_code='CL-CUE-0003' limit 1));

  select case when r.cobrado and r.importe = 550 then 'PASA' else '>>> FALLA <<<' end as resultado,
         r.cobrado, r.importe
    from public.recuperar_equipo('ONT000001', false, null, 'Se lo quedó') r;

  select case when e.status='lost' and ch.id is not null
              then 'PASA · perdido y cobrado' else '>>> FALLA <<<' end as revision,
         e.status, ch.amount
    from public.equipment_units e
    left join public.charges ch on ch.type='equipment_loss'
     and ch.description like '%ONT000001%'
   where e.serial_number='ONT000001';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 10 · El costo solo lo ve quien puede ver finanzas'
\echo '  Ana sí, Carlos no. Y Carlos NO puede recibir finance.read (es sensible).'
\echo '  Se espera: PASA · Ana ve 550, Carlos ve nulo'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  select case when costo = 550 then 'PASA · Ana ve el costo' else '>>> FALLA <<<' end as ana, costo
    from public.v_inventario where sku='ONT-HW';
commit;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  select case when count(*) = 0 or bool_and(costo is null)
              then 'PASA · Carlos no ve el costo' else '>>> FALLA <<<' end as carlos
    from public.v_inventario where sku='ONT-HW';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 11 · La NAP avisa al 85 por ciento, no al llenarse'
\echo '  Se espera: PASA · 7 de 8 = por_llenarse · 8 de 8 = lleno'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- La NAP va sobre la fibra, así que primero hay cable y trazo.
  create temporary table t_cab on commit drop as
  select public.guardar_cable(null, 'CAB-ALMACEN', 'adss', 12,
                              (select id from public.zones where code='CUE')) as id;
  select public.guardar_trazo((select id from t_cab),
                              '[[24.8600000,-103.7000000],[24.8600000,-103.6900000]]'::jsonb);

  create temporary table t_nap on commit drop as
  select public.guardar_elemento(null, 'NAP-CUE-001', 'nap', 'NAP frente a la escuela',
                                 (select id from public.zones where code='CUE'),
                                 null, null, 8, 24.8600000, -103.6950000) as id;

  update public.network_elements set used_ports = 7 where id = (select id from t_nap);
  select case when semaforo = 'por_llenarse' then 'PASA' else '>>> FALLA <<<' end as con_7,
         used_ports, capacity, ocupacion_pct, semaforo
    from public.v_elementos_red where id = (select id from t_nap);

  update public.network_elements set used_ports = 8 where id = (select id from t_nap);
  select case when semaforo = 'lleno' then 'PASA' else '>>> FALLA <<<' end as con_8, semaforo
    from public.v_elementos_red where id = (select id from t_nap);
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 12 · Una NAP no puede tener más ocupado que su capacidad'
\echo '  Se espera: PASA · la base lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  begin
    update public.network_elements set used_ports = 9
     where code = 'NAP-CUE-001';
    raise warning '>>> FALLA <<< quedaron 9 clientes en una caja de 8';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 13 · El técnico no edita el catálogo ni la red'
\echo '  Se espera: PASA · las dos rechazadas'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.guardar_articulo(null, 'XX', 'Lo que sea');
    raise warning '>>> FALLA <<< el técnico editó el catálogo';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · catálogo rechazado: %', v_msg;
  end;
  begin
    perform public.guardar_elemento(null, 'NAP-X', 'nap');
    raise warning '>>> FALLA <<< el técnico editó la red';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · red rechazada: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 14 · Carlos SÍ puede mover inventario (es su trabajo)'
\echo '  Se espera: PASA · su rol trae inventory.move'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

  select case when public.mover_inventario(
                    (select id from public.inventory_items where sku='ONT-HW'),
                    2, 'return', 'technician', '33333333-3333-3333-3333-333333333333',
                    'branch', 'bbbbbbbb-0000-0000-0000-000000000001',
                    'Regresa lo que no usó') is not null
              then 'PASA' else '>>> FALLA <<<' end as resultado;
commit;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'RESUMEN'
\echo '════════════════════════════════════════════════════════════════'
select (select count(*) from public.inventory_items)      as articulos,
       (select count(*) from public.equipment_units)      as equipos,
       (select count(*) from public.inventory_movements)  as movimientos,
       (select count(*) from public.network_elements)     as cajas,
       (select count(*) from public.charges where type='equipment_loss') as cargos_equipo;
