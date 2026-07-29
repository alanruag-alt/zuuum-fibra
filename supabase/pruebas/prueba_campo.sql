-- ============================================================================
-- PRUEBAS DE OPERACIÓN DE CAMPO · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- El camino completo: prospecto → cliente → orden → técnico → servicio activo.
--   Ana = administradora   Beto = oficina   Carlos = técnico
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- Carlos necesita poder cerrar órdenes; el rol técnico ya trae orders.write.
-- Ana necesita orders.assign, que su rol sí trae.

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 1 · Alta de un prospecto'
\echo '  Se espera: PASA · queda en «nuevo» en Velardeña'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_pros on commit drop as
  select public.guardar_prospecto(
    null, 'Rosa Martinez', '8711234567',
    (select id from public.zones where code='VEL'),
    null, 'Frente a la tienda, casa azul') as id;

  select case when pr.status='new' and pr.zona='Velardeña'
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         pr.full_name, pr.zona, pr.status
    from public.v_prospectos pr where pr.id = (select id from t_pros);
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · Un prospecto sin teléfono se rechaza'
\echo '  Se espera: PASA · sin teléfono no sirve de nada'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_zona uuid;
begin
  select id into v_zona from public.zones where code='VEL';
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.guardar_prospecto(null, 'Sin Telefono', null, v_zona);
    raise warning '>>> FALLA <<< entró sin teléfono';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · Convertir el prospecto en cliente'
\echo '  Se espera: PASA · cliente + servicio PENDIENTE + orden de instalación'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_conv on commit drop as
  select * from public.convertir_prospecto(
    (select id from public.prospects where full_name='Rosa Martinez'),
    (select id from public.service_plans where code='P450'),
    450, 'ftth', now() + interval '2 days');

  select case when c.customer_code like 'CL-VEL-%' and s.status='pending'
               and o.status='scheduled' and o.type='installation'
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         c.customer_code, s.status as servicio, o.order_number, o.status as orden
    from t_conv t
    join public.customers c on c.id = t.customer_id
    join public.customer_services s on s.id = t.service_id
    join public.work_orders o on o.order_number = t.order_number;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · El servicio nace PENDIENTE, no activo'
\echo '  Se espera: PASA · nadie le cobra a quien todavía no tiene servicio'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when count(*) = 0 then 'PASA · no aparece como activo'
              else '>>> FALLA <<<' end as resultado, count(*)
    from public.customer_services s
    join public.customers c on c.id = s.customer_id
   where c.full_name='Rosa Martinez' and s.status='active';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · Convertir dos veces el mismo prospecto se rechaza'
\echo '  Se espera: PASA · no se duplica el cliente'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_pr uuid; v_plan uuid;
begin
  select id into v_pr from public.prospects where full_name='Rosa Martinez';
  select id into v_plan from public.service_plans where code='P450';
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.convertir_prospecto(v_pr, v_plan, 450, 'ftth', null);
    raise warning '>>> FALLA <<< se duplicó el cliente';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · Ana le asigna la orden a Carlos'
\echo '  Se espera: PASA · queda asignada'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when public.asignar_orden(
                    (select id from public.work_orders
                      where description like '%Rosa Martinez%'),
                    array['33333333-3333-3333-3333-333333333333'::uuid]) = 1
              then 'PASA' else '>>> FALLA <<<' end as resultado;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · Ahora Carlos SÍ ve a ese cliente, y solo a ése'
\echo '  El técnico no ve el padrón. Ve el domicilio al que va hoy.'
\echo '  Se espera: PASA · exactamente 1 cliente'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_ord uuid;
begin
  select id into v_ord from public.work_orders where description like '%Rosa Martinez%';
  update public.work_orders set status='scheduled' where id = v_ord;
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

  select case when count(*) = 1 then 'PASA' else '>>> FALLA <<<' end as resultado,
         count(*) as clientes_que_ve,
         coalesce(max(full_name), 'ninguno') as quien
    from public.customers;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · Carlos no puede cerrar sin evidencia'
\echo '  Se espera: PASA · la base pide foto, potencia y firma'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_ord uuid;
begin
  select id into v_ord from public.work_orders where description like '%Rosa Martinez%';

  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.iniciar_orden(v_ord);
    perform public.cerrar_orden(v_ord, 'ya quedo');
    raise warning '>>> FALLA <<< cerró una instalación sin evidencia';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 9 · Con evidencia sí cierra, y el servicio se activa'
\echo '  Se espera: PASA · orden cerrada y servicio en «activo»'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

  select public.iniciar_orden((select id from public.work_orders
                                where description like '%Rosa Martinez%'));

  insert into public.work_order_photos (org_id, work_order_id, photo_type, storage_path, taken_by)
  select '00000000-0000-0000-0000-000000000001', o.id, 'installation',
         'fotos/prueba.jpg', '33333333-3333-3333-3333-333333333333'
    from public.work_orders o where o.description like '%Rosa Martinez%';

  insert into public.installation_readings
    (org_id, work_order_id, reading_point, rx_power_dbm, measured_by)
  select '00000000-0000-0000-0000-000000000001', o.id, 'ont', -21.5,
         '33333333-3333-3333-3333-333333333333'
    from public.work_orders o where o.description like '%Rosa Martinez%';

  insert into public.customer_signatures
    (org_id, customer_id, work_order_id, purpose, signature_url)
  select '00000000-0000-0000-0000-000000000001', o.customer_id, o.id,
         'installation', 'firmas/prueba.png'
    from public.work_orders o where o.description like '%Rosa Martinez%';

  select case when r.cerrada and r.servicio_activado
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         r.servicio_activado, r.mensaje
    from public.cerrar_orden(
           (select id from public.work_orders where description like '%Rosa Martinez%'),
           'instalada, potencia -21.5') r;
commit;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when s.status='active' and s.activated_at is not null
              then 'PASA · servicio activo' else '>>> FALLA <<<' end as servicio,
         s.status
    from public.customer_services s
    join public.customers c on c.id = s.customer_id
   where c.full_name='Rosa Martinez';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 10 · Cerrada la orden, Carlos deja de ver al cliente'
\echo '  Se espera: PASA · el acceso duraba lo que duraba el trabajo'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

  select case when count(*) = 0 then 'PASA' else '>>> FALLA <<< sigue viéndolo' end as resultado,
         count(*) as clientes_que_ve
    from public.customers;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 11 · Ticket: abrir y resolver'
\echo '  Se espera: PASA · folio TK-VEL-xxxx'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_tk on commit drop as
  select * from public.abrir_ticket(
    (select id from public.customers where full_name='Rosa Martinez'),
    'no_service', 'No tiene internet desde ayer', 'La luz roja del ONT prendida');

  select case when t.ticket_number like 'TK-VEL-%' then 'PASA' else '>>> FALLA <<<' end as resultado,
         t.ticket_number
    from t_tk t;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 12 · Resolver sin decir la causa se rechaza'
\echo '  Se espera: PASA · sin causa el historial no sirve'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_tk uuid;
begin
  select id into v_tk from public.tickets where subject like 'No tiene internet%';
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.atender_ticket(v_tk, 'resolved');
    raise warning '>>> FALLA <<< resolvió sin causa';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise warning 'PASA · rechazado: %', v_msg;
  end;
  reset role;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 13 · Con causa sí se resuelve, y queda el comentario'
\echo '  Se espera: PASA · resuelto, causa fiber_cut, 1 comentario'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.atender_ticket(
    (select id from public.tickets where subject like 'No tiene internet%'),
    'resolved', '33333333-3333-3333-3333-333333333333', 'fiber_cut',
    'Cable mordido por el perro. Empalmado.', false);

  select case when t.status='resolved' and t.root_cause='fiber_cut' and t.comentarios=1
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         t.status, t.root_cause, t.comentarios, t.atiende
    from public.v_tickets t where t.subject like 'No tiene internet%';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 14 · El técnico no puede crear órdenes fuera de su trabajo'
\echo '  Su rol SÍ trae orders.write. Lo que lo detiene es la zona: el'
\echo '  cliente de Cuencamé no es suyo, y el alcance del técnico es «lo'
\echo '  que se le asigne», no la empresa.'
\echo '  Se espera: PASA · rechazado por zona'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_cli uuid;
begin
  select id into v_cli from public.customers where customer_code='CL-CUE-0001';
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.crear_orden('installation', v_cli);
    raise warning '>>> FALLA <<< creó una orden de un cliente que no es suyo';
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
select (select count(*) from public.prospects)                              as prospectos,
       (select count(*) from public.prospects where status='converted')     as convertidos,
       (select count(*) from public.work_orders)                            as ordenes,
       (select count(*) from public.work_orders where status='completed')   as cerradas,
       (select count(*) from public.tickets)                                as tickets,
       (select count(*) from public.customer_services where status='active') as servicios_activos;
