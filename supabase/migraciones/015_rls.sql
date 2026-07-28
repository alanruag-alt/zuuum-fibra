-- ============================================================================
-- 015 · Seguridad a nivel de renglón  (RLS)
-- ============================================================================
-- ESTA es la seguridad de verdad. Lo que se esconde en la pantalla es cortesía;
-- lo que se niega aquí no hay forma de sacarlo, ni desde la consola del
-- navegador, ni con la llave anon en la mano.
-- ============================================================================

-- Se prende en TODAS las tablas. Una tabla sin RLS en Supabase queda expuesta.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public'
       and tablename not like 'device_readings_2%'
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Catálogos: los ve cualquiera con sesión de la misma organización.
-- ----------------------------------------------------------------------------
create policy org_lectura on public.organizations for select
  using (id = public.auth_org_id());

create policy zonas_lectura on public.zones for select
  using (org_id = public.auth_org_id());
create policy zonas_escritura on public.zones for all
  using (org_id = public.auth_org_id() and public.auth_has('zones.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('zones.write'));

create policy sucursales_lectura on public.branches for select
  using (org_id = public.auth_org_id());

create policy planes_lectura on public.service_plans for select
  using (org_id = public.auth_org_id());
create policy planes_escritura on public.service_plans for all
  using (org_id = public.auth_org_id() and public.auth_has('plans.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('plans.write'));

create policy permisos_lectura on public.permissions for select using (true);
create policy roles_lectura on public.roles for select
  using (org_id = public.auth_org_id());

create policy ajustes_lectura on public.settings for select
  using (org_id = public.auth_org_id());
create policy ajustes_escritura on public.settings for all
  using (org_id = public.auth_org_id() and public.auth_has('settings.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('settings.write'));

-- ----------------------------------------------------------------------------
-- Perfiles: el suyo siempre; los demás solo con permiso.
-- ----------------------------------------------------------------------------
create policy perfil_propio on public.profiles for select
  using (id = (select auth.uid()) or (org_id = public.auth_org_id() and public.auth_has('users.read')));
create policy perfil_editar_propio on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy perfiles_admin on public.profiles for all
  using (org_id = public.auth_org_id() and public.auth_has('users.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('users.write'));

create policy mis_roles on public.user_roles for select
  using (user_id = (select auth.uid()) or public.auth_has('users.read'));
create policy roles_admin on public.user_roles for all
  using (public.auth_has('users.write')) with check (public.auth_has('users.write'));

create policy mis_permisos on public.user_permissions for select
  using (user_id = (select auth.uid()) or public.auth_has('users.read'));
create policy permisos_admin on public.user_permissions for all
  using (public.auth_has('users.write')) with check (public.auth_has('users.write'));

create policy mis_zonas on public.user_zones for select
  using (user_id = (select auth.uid()) or public.auth_has('users.read'));
create policy zonas_asignar on public.user_zones for all
  using (public.auth_has('users.write')) with check (public.auth_has('users.write'));

-- ----------------------------------------------------------------------------
-- CLIENTES · aquí es donde se juega el alcance por zona
-- ----------------------------------------------------------------------------
create policy clientes_lectura on public.customers for select
  using (
    org_id = public.auth_org_id()
    and (
      -- quien tiene alcance total o la zona asignada, con permiso de lectura
      (public.auth_has('customers.read') and public.auth_ve_zona(zone_id))
      -- el técnico: solo el cliente al que va hoy
      or public.auth_cliente_de_mi_orden(id)
    )
  );

create policy clientes_escritura on public.customers for all
  using (org_id = public.auth_org_id() and public.auth_has('customers.write')
         and public.auth_ve_zona(zone_id))
  with check (org_id = public.auth_org_id() and public.auth_has('customers.write')
         and public.auth_ve_zona(zone_id));

create policy direcciones_lectura on public.addresses for select
  using (exists (select 1 from public.customers c where c.id = customer_id));
create policy direcciones_escritura on public.addresses for all
  using (org_id = public.auth_org_id() and public.auth_has('customers.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('customers.write'));

create policy servicios_lectura on public.customer_services for select
  using (exists (select 1 from public.customers c where c.id = customer_id));
create policy servicios_escritura on public.customer_services for all
  using (org_id = public.auth_org_id() and public.auth_has('services.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('services.write'));

create policy contratos_lectura on public.contracts for select
  using (exists (select 1 from public.customers c where c.id = customer_id));
create policy contratos_escritura on public.contracts for all
  using (org_id = public.auth_org_id() and public.auth_has('contracts.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('contracts.write'));

create policy prospectos_lectura on public.prospects for select
  using (org_id = public.auth_org_id() and public.auth_has('prospects.read')
         and public.auth_ve_zona(zone_id));
create policy prospectos_escritura on public.prospects for all
  using (org_id = public.auth_org_id() and public.auth_has('prospects.write')
         and public.auth_ve_zona(zone_id))
  with check (org_id = public.auth_org_id() and public.auth_has('prospects.write')
         and public.auth_ve_zona(zone_id));

-- ----------------------------------------------------------------------------
-- DINERO · el técnico no aparece por ningún lado
-- ----------------------------------------------------------------------------
create policy periodos_lectura on public.billing_periods for select
  using (org_id = public.auth_org_id() and public.auth_has('payments.read'));

create policy cargos_lectura on public.charges for select
  using (org_id = public.auth_org_id() and public.auth_has('charges.read')
         and public.auth_ve_zona(zone_id));
create policy cargos_escritura on public.charges for insert
  with check (org_id = public.auth_org_id() and public.auth_has('charges.create'));
create policy cargos_cancelar on public.charges for update
  using (org_id = public.auth_org_id() and public.auth_has('charges.cancel'))
  with check (org_id = public.auth_org_id() and public.auth_has('charges.cancel'));

create policy pagos_lectura on public.payments for select
  using (org_id = public.auth_org_id() and public.auth_has('payments.read')
         and public.auth_ve_zona(zone_id));
create policy pagos_registrar on public.payments for insert
  with check (org_id = public.auth_org_id() and public.auth_has('payments.create')
              and public.auth_cobra_zona(zone_id)
              and received_by = (select auth.uid()));
-- Cancelar un pago: SOLO quien tenga payments.cancel. Es del administrador.
create policy pagos_cancelar on public.payments for update
  using (org_id = public.auth_org_id() and public.auth_has('payments.cancel'))
  with check (org_id = public.auth_org_id() and public.auth_has('payments.cancel'));

create policy aplicaciones_lectura on public.payment_allocations for select
  using (org_id = public.auth_org_id() and public.auth_has('payments.read'));
create policy aplicaciones_crear on public.payment_allocations for insert
  with check (org_id = public.auth_org_id() and public.auth_has('payments.create'));

create policy recibos_lectura on public.receipts for select
  using (org_id = public.auth_org_id() and public.auth_has('payments.read'));

-- Corte de caja: el cobrador ve los suyos; oficina y admin ven los de sus zonas.
create policy caja_lectura on public.cash_sessions for select
  using (org_id = public.auth_org_id()
         and (collector_id = (select auth.uid())
              or (public.auth_has('cash.read') and public.auth_ve_zona(zone_id))));
create policy caja_propia on public.cash_sessions for insert
  with check (org_id = public.auth_org_id() and collector_id = (select auth.uid()));
create policy caja_cerrar on public.cash_sessions for update
  using (org_id = public.auth_org_id()
         and (collector_id = (select auth.uid()) or public.auth_has('cash.verify')))
  with check (org_id = public.auth_org_id());

create policy suspensiones_lectura on public.service_suspensions for select
  using (org_id = public.auth_org_id() and public.auth_has('services.read'));
create policy suspensiones_escritura on public.service_suspensions for all
  using (org_id = public.auth_org_id() and public.auth_has('services.suspend'))
  with check (org_id = public.auth_org_id() and public.auth_has('services.suspend'));

-- ----------------------------------------------------------------------------
-- INVENTARIO · el costo se sirve por una vista aparte (ver 016)
-- ----------------------------------------------------------------------------
create policy inv_lectura on public.inventory_items for select
  using (org_id = public.auth_org_id() and public.auth_has('inventory.read'));
create policy inv_escritura on public.inventory_items for all
  using (org_id = public.auth_org_id() and public.auth_has('inventory.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('inventory.write'));

create policy stock_lectura on public.inventory_stock for select
  using (org_id = public.auth_org_id() and public.auth_has('inventory.read'));
create policy stock_escritura on public.inventory_stock for all
  using (org_id = public.auth_org_id() and public.auth_has('inventory.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('inventory.write'));

create policy equipos_lectura on public.equipment_units for select
  using (org_id = public.auth_org_id() and public.auth_has('inventory.read'));
create policy equipos_escritura on public.equipment_units for all
  using (org_id = public.auth_org_id() and public.auth_has('inventory.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('inventory.write'));

create policy movs_lectura on public.inventory_movements for select
  using (org_id = public.auth_org_id() and public.auth_has('inventory.read'));
create policy movs_crear on public.inventory_movements for insert
  with check (org_id = public.auth_org_id() and public.auth_has('inventory.move')
              and performed_by = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- RED
-- ----------------------------------------------------------------------------
create policy sitios_lectura on public.network_sites for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy sitios_escritura on public.network_sites for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy equipored_lectura on public.network_devices for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy equipored_escritura on public.network_devices for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy tarjetas_lectura on public.olt_cards for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy tarjetas_escritura on public.olt_cards for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy puertos_lectura on public.pon_ports for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy puertos_escritura on public.pon_ports for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy elementos_lectura on public.network_elements for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy elementos_escritura on public.network_elements for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy tramos_lectura on public.fiber_links for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy tramos_escritura on public.fiber_links for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy lecturas_lectura on public.device_readings for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy lecturas_resumen on public.device_readings_hourly for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));

-- ----------------------------------------------------------------------------
-- OPERACIÓN · el técnico ve lo suyo y nada más
-- ----------------------------------------------------------------------------
create policy ordenes_lectura on public.work_orders for select
  using (org_id = public.auth_org_id()
         and ((public.auth_has('orders.read') and public.auth_ve_zona(zone_id))
              or public.auth_orden_propia(id)));
create policy ordenes_escritura on public.work_orders for insert
  with check (org_id = public.auth_org_id() and public.auth_has('orders.write'));
create policy ordenes_actualizar on public.work_orders for update
  using (org_id = public.auth_org_id()
         and (public.auth_has('orders.write') or public.auth_orden_propia(id)))
  with check (org_id = public.auth_org_id());

create policy asignaciones_lectura on public.work_order_assignments for select
  using (technician_id = (select auth.uid()) or public.auth_has('orders.read'));
create policy asignaciones_escritura on public.work_order_assignments for all
  using (public.auth_has('orders.assign')) with check (public.auth_has('orders.assign'));

create policy fotos_lectura on public.work_order_photos for select
  using (exists (select 1 from public.work_orders o where o.id = work_order_id));
create policy fotos_subir on public.work_order_photos for insert
  with check (org_id = public.auth_org_id()
              and (public.auth_orden_propia(work_order_id) or public.auth_has('orders.write')));

create policy materiales_lectura on public.work_order_materials for select
  using (exists (select 1 from public.work_orders o where o.id = work_order_id));
create policy materiales_crear on public.work_order_materials for insert
  with check (org_id = public.auth_org_id()
              and (public.auth_orden_propia(work_order_id) or public.auth_has('orders.write')));

create policy lecturasinst_lectura on public.installation_readings for select
  using (exists (select 1 from public.work_orders o where o.id = work_order_id));
create policy lecturasinst_crear on public.installation_readings for insert
  with check (org_id = public.auth_org_id()
              and (public.auth_orden_propia(work_order_id) or public.auth_has('orders.write')));

create policy firmas_lectura on public.customer_signatures for select
  using (exists (select 1 from public.customers c where c.id = customer_id));
create policy firmas_crear on public.customer_signatures for insert
  with check (org_id = public.auth_org_id());

create policy tickets_lectura on public.tickets for select
  using (org_id = public.auth_org_id()
         and ((public.auth_has('tickets.read') and public.auth_ve_zona(zone_id))
              or assigned_to = (select auth.uid())));
create policy tickets_escritura on public.tickets for all
  using (org_id = public.auth_org_id()
         and (public.auth_has('tickets.write') or assigned_to = (select auth.uid())))
  with check (org_id = public.auth_org_id());

create policy comentarios_lectura on public.ticket_comments for select
  using (exists (select 1 from public.tickets t where t.id = ticket_id));
create policy comentarios_crear on public.ticket_comments for insert
  with check (org_id = public.auth_org_id() and author_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- SISTEMA
-- ----------------------------------------------------------------------------
create policy notif_propias on public.notifications for select
  using (user_id = (select auth.uid()));
create policy notif_marcar on public.notifications for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy adjuntos_lectura on public.attachments for select
  using (org_id = public.auth_org_id());
create policy adjuntos_subir on public.attachments for insert
  with check (org_id = public.auth_org_id());

create policy importaciones_lectura on public.import_batches for select
  using (org_id = public.auth_org_id() and public.auth_has('customers.import'));
create policy importaciones_crear on public.import_batches for all
  using (org_id = public.auth_org_id() and public.auth_has('customers.import'))
  with check (org_id = public.auth_org_id() and public.auth_has('customers.import'));

create policy folios_lectura on public.folio_counters for select
  using (org_id = public.auth_org_id());

-- AUDITORÍA: se lee con permiso. Escribir, actualizar o borrar: NADIE.
-- Los disparadores entran por security definer, así que sí pueden insertar.
create policy auditoria_lectura on public.audit_logs for select
  using (org_id = public.auth_org_id() and public.auth_has('audit.read'));
