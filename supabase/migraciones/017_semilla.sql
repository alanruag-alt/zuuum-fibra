-- ============================================================================
-- 017 · Datos semilla
-- ============================================================================
-- Roles, catálogo de permisos, las 12 zonas y los ajustes de ZUUUM.
-- Se puede correr más de una vez sin duplicar nada.
-- ============================================================================

-- ---------------------------------------------------------------- organización
insert into public.organizations (id, name, legal_name, timezone, currency)
values ('00000000-0000-0000-0000-000000000001', 'ZUUUM FIBRA', 'ZUUUM FIBRA', 'America/Monterrey', 'MXN')
on conflict (id) do nothing;

-- ------------------------------------------------------------------- permisos
insert into public.permissions (code, module, name, is_sensitive) values
  ('dashboard.read',        'dashboard',  'Ver el tablero',                    false),
  ('customers.read',        'customers',  'Ver clientes',                      false),
  ('customers.write',       'customers',  'Crear y editar clientes',           false),
  ('customers.import',      'customers',  'Importar padrón desde Excel',       false),
  ('prospects.read',        'prospects',  'Ver prospectos',                    false),
  ('prospects.write',       'prospects',  'Crear y editar prospectos',         false),
  ('services.read',         'services',   'Ver servicios',                     false),
  ('services.write',        'services',   'Crear y editar servicios',          false),
  ('services.suspend',      'services',   'Suspender y reactivar servicios',   false),
  ('contracts.read',        'contracts',  'Ver contratos',                     false),
  ('contracts.write',       'contracts',  'Generar contratos',                 false),
  ('plans.read',            'plans',      'Ver planes',                        false),
  ('plans.write',           'plans',      'Editar el catálogo de planes',      false),
  ('charges.read',          'billing',    'Ver cargos y adeudos',              true),
  ('charges.create',        'billing',    'Generar cargos',                    true),
  ('charges.cancel',        'billing',    'Cancelar cargos',                   true),
  ('payments.read',         'billing',    'Ver pagos',                         true),
  ('payments.create',       'billing',    'Registrar pagos',                   true),
  ('payments.cancel',       'billing',    'Cancelar o corregir pagos',         true),
  ('cash.read',             'billing',    'Ver cortes de caja',                true),
  ('cash.verify',           'billing',    'Verificar entregas de caja',        true),
  ('tickets.read',          'tickets',    'Ver tickets',                       false),
  ('tickets.write',         'tickets',    'Crear y editar tickets',            false),
  ('orders.read',           'orders',     'Ver órdenes de trabajo',            false),
  ('orders.write',          'orders',     'Crear y editar órdenes',            false),
  ('orders.assign',         'orders',     'Asignar técnicos',                  false),
  ('inventory.read',        'inventory',  'Ver inventario',                    false),
  ('inventory.write',       'inventory',  'Editar el catálogo de inventario',  false),
  ('inventory.move',        'inventory',  'Registrar movimientos',             false),
  ('inventory.cost.read',   'inventory',  'Ver costos de inventario',          true),
  ('network.read',          'network',    'Ver la red',                        false),
  ('network.write',         'network',    'Editar la red',                     false),
  ('zones.read',            'admin',      'Ver zonas',                         false),
  ('zones.write',           'admin',      'Editar zonas',                      false),
  ('users.read',            'admin',      'Ver usuarios',                      false),
  ('users.write',           'admin',      'Crear usuarios y dar permisos',     false),
  ('settings.read',         'admin',      'Ver la configuración',              false),
  ('settings.write',        'admin',      'Cambiar la configuración',          false),
  ('reports.read',          'reports',    'Ver reportes de operación',         false),
  ('reports.financial',     'reports',    'Ver reportes financieros',          true),
  ('finance.read',          'finance',    'Ver finanzas y utilidades',         true),
  ('finance.write',         'finance',    'Editar finanzas',                   true),
  ('audit.read',            'admin',      'Ver la auditoría',                  false)
on conflict (code) do update set
  name = excluded.name, is_sensitive = excluded.is_sensitive;

-- ---------------------------------------------------------------------- roles
insert into public.roles (org_id, code, name, scope_type, is_system) values
  ('00000000-0000-0000-0000-000000000001','owner',      'Propietario',        'all',   true),
  ('00000000-0000-0000-0000-000000000001','admin',      'Administrador',      'all',   true),
  ('00000000-0000-0000-0000-000000000001','office',     'Oficina y cobranza', 'zones', true),
  ('00000000-0000-0000-0000-000000000001','supervisor', 'Supervisor',         'zones', true),
  ('00000000-0000-0000-0000-000000000001','technician', 'Técnico',            'own',   true),
  ('00000000-0000-0000-0000-000000000001','warehouse',  'Almacén',            'zones', true),
  ('00000000-0000-0000-0000-000000000001','customer',   'Cliente',            'own',   true)
on conflict (org_id, code) do nothing;

-- --------------------------------------------------------- permisos por rol
-- Propietario y administrador: todo.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
 where r.code in ('owner','admin')
on conflict do nothing;

-- Oficina y cobranza
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in (
  'dashboard.read','customers.read','customers.write','prospects.read','prospects.write',
  'services.read','services.suspend','contracts.read','contracts.write','plans.read',
  'charges.read','charges.create','payments.read','payments.create','cash.read',
  'tickets.read','tickets.write','orders.read','inventory.read','reports.read')
 where r.code = 'office'
on conflict do nothing;

-- Supervisor: opera y coordina, pero NO toca dinero.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in (
  'dashboard.read','customers.read','prospects.read','prospects.write',
  'services.read','contracts.read','plans.read','tickets.read','tickets.write',
  'orders.read','orders.write','orders.assign','inventory.read',
  'network.read','network.write','reports.read')
 where r.code = 'supervisor'
on conflict do nothing;

-- Técnico: lo mínimo para trabajar en campo. Ni un permiso de dinero.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in (
  'orders.read','orders.write','tickets.read','tickets.write',
  'services.read','inventory.read','inventory.move','network.read','plans.read')
 where r.code = 'technician'
on conflict do nothing;

-- Almacén
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in (
  'inventory.read','inventory.write','inventory.move','orders.read','network.read')
 where r.code = 'warehouse'
on conflict do nothing;

-- Cliente: lo suyo, y nada más.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in (
  'tickets.read','tickets.write','plans.read')
 where r.code = 'customer'
on conflict do nothing;

-- ---------------------------------------------------------------- las 12 zonas
insert into public.zones (org_id, name, code, network_type) values
  ('00000000-0000-0000-0000-000000000001','Cuencamé',      'CUE','mixed'),
  ('00000000-0000-0000-0000-000000000001','Velardeña',     'VEL','mixed'),
  ('00000000-0000-0000-0000-000000000001','Pasaje',        'PAS','mixed'),
  ('00000000-0000-0000-0000-000000000001','Pedriceña',     'PED','mixed'),
  ('00000000-0000-0000-0000-000000000001','Cuatillos',     'CUA','mixed'),
  ('00000000-0000-0000-0000-000000000001','La Fe',         'LFE','mixed'),
  ('00000000-0000-0000-0000-000000000001','La Cuchilla',   'LCU','mixed'),
  ('00000000-0000-0000-0000-000000000001','Vista Hermosa', 'VHE','mixed'),
  ('00000000-0000-0000-0000-000000000001','El Tanque',     'ETA','mixed'),
  ('00000000-0000-0000-0000-000000000001','20 Amigos',     'AMI','mixed'),
  ('00000000-0000-0000-0000-000000000001','Las Mercedes',  'MER','mixed'),
  ('00000000-0000-0000-0000-000000000001','Ocuila',        'OCU','mixed')
on conflict (org_id, code) do nothing;

-- ------------------------------------------------------------------- ajustes
insert into public.settings (org_id, key, value, value_type, category, name, description) values
  ('00000000-0000-0000-0000-000000000001','billing.due_day','5','number','cobranza',
   'Día de vencimiento','El pago corre del 1 al 5.'),
  ('00000000-0000-0000-0000-000000000001','billing.grace_days','5','number','cobranza',
   'Días de gracia','Del 6 al 10.'),
  ('00000000-0000-0000-0000-000000000001','billing.cutoff_day','11','number','cobranza',
   'Día de corte','Se suspende el servicio.'),
  ('00000000-0000-0000-0000-000000000001','billing.reconnection_fee','30','number','cobranza',
   'Cargo por reconexión','En pesos.'),
  ('00000000-0000-0000-0000-000000000001','billing.equipment_loss_fee','550','number','cobranza',
   'Equipo no devuelto','Se cobra solo si el cliente no regresa el equipo.'),
  ('00000000-0000-0000-0000-000000000001','billing.advance_payment','true','boolean','cobranza',
   'Pago por adelantado','El servicio se paga antes de consumirse.'),
  ('00000000-0000-0000-0000-000000000001','wifi.ssid_format','"ZUUUM_FIBRA_{last4}"','string','instalacion',
   'Formato del nombre de red','{last4} = últimos 4 del serial.'),
  ('00000000-0000-0000-0000-000000000001','wifi.password_format','"ZF{last4}{random4}"','string','instalacion',
   'Formato de la contraseña','De 10 a 12 caracteres.'),
  ('00000000-0000-0000-0000-000000000001','optical.rx_min_dbm','-25','number','instalacion',
   'Potencia mínima aceptable','En dBm.'),
  ('00000000-0000-0000-0000-000000000001','optical.rx_max_dbm','-8','number','instalacion',
   'Potencia máxima aceptable','En dBm.'),
  ('00000000-0000-0000-0000-000000000001','otdr.guard_site_m','50','number','red',
   'Guarda de sitio','Metros.'),
  ('00000000-0000-0000-0000-000000000001','otdr.guard_pole_m','20','number','red',
   'Guarda por poste','Metros.'),
  ('00000000-0000-0000-0000-000000000001','otdr.guard_box_m','20','number','red',
   'Guarda por caja','Metros.'),
  ('00000000-0000-0000-0000-000000000001','readings.summarize_after_days','90','number','red',
   'Resumir lecturas','Días antes de convertir a promedios por hora.')
on conflict (org_id, key) do nothing;
