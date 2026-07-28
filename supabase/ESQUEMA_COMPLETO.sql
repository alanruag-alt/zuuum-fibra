-- ============================================================================
--  ZUUUM FIBRA · ESQUEMA COMPLETO
--  Todas las migraciones (001 a 017) en un solo archivo.
-- ----------------------------------------------------------------------------
--  CÓMO USARLO
--    1. Abre tu proyecto de Supabase → SQL Editor → New query
--    2. Copia TODO este archivo, pégalo y dale Run
--    3. Espera. Tarda entre 10 y 30 segundos.
--    4. Debe decir "Success. No rows returned."
--
--  IMPORTANTE: esto es para una base NUEVA, vacía. Si lo corres dos veces
--  se detiene solo con un aviso claro, no rompe nada. Para empezar de cero
--  usa `REINICIAR_BASE.sql` (borra todo, léelo antes).
--
--  Probado contra PostgreSQL 16 antes de entregarse: 53 tablas, 91 políticas,
--  y las 7 pruebas de seguridad pasando.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Candado contra el doble pegado.
-- Sin esto, correrlo dos veces suelta un "relation already exists" que no le
-- dice nada a nadie.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.organizations') is not null then
    raise exception using message =
      E'El esquema de ZUUUM FIBRA ya está instalado en esta base.\n'
      '  No hace falta volver a correrlo — y no se hizo ningún cambio.\n'
      '  Si de verdad quieres empezar de cero, corre primero REINICIAR_BASE.sql.';
  end if;
end $$;



-- ####################################################################
-- #  001_extensiones_y_ayudas.sql
-- ####################################################################

-- ============================================================================
-- 001 · Extensiones y funciones de ayuda
-- ============================================================================
-- Todo lo que el resto de las migraciones da por hecho.
-- Correr esta primero, siempre.
-- ============================================================================

create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid()
create extension if not exists pg_trgm   with schema extensions;  -- búsqueda con errores de dedo

-- ----------------------------------------------------------------------------
-- updated_at se actualiza solo. Nunca a mano.
-- ----------------------------------------------------------------------------
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tocar_actualizado is
  'Disparador: pone updated_at = now() en cada UPDATE.';

-- ----------------------------------------------------------------------------
-- Atajo para colgarle el disparador a una tabla sin repetir el bloque.
-- ----------------------------------------------------------------------------
create or replace function public.poner_tocar_actualizado(nombre_tabla text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  execute format(
    'drop trigger if exists trg_actualizado on public.%I;
     create trigger trg_actualizado before update on public.%I
     for each row execute function public.tocar_actualizado();',
    nombre_tabla, nombre_tabla);
end;
$$;


-- ####################################################################
-- #  002_organizacion_zonas.sql
-- ####################################################################

-- ============================================================================
-- 002 · Organización, sucursales y zonas
-- ============================================================================

create table public.organizations (
  id          uuid primary key default extensions.gen_random_uuid(),
  name        text not null,
  legal_name  text,
  tax_id      text,
  phone       text,
  email       text,
  address     text,
  logo_url    text,
  timezone    text not null default 'America/Monterrey',
  currency    text not null default 'MXN',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.organizations is
  'Empresas. Hoy solo hay una (ZUUUM FIBRA), pero la columna org_id va en todas '
  'las tablas desde el principio: agregarla después obligaría a rehacer todo.';

create table public.branches (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  name        text not null,
  type        text not null default 'both'
              check (type in ('office','warehouse','both')),
  address     text,
  latitude    numeric(10,7),
  longitude   numeric(10,7),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);

comment on table public.branches is 'Oficinas y almacenes. El inventario vive aquí.';

create table public.zones (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  name          text not null,
  code          text not null,
  branch_id     uuid references public.branches(id) on delete set null,
  network_type  text not null default 'mixed'
                check (network_type in ('ftth','wisp','mixed')),
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,
  constraint zones_code_unico unique (org_id, code)
);

comment on table public.zones is
  'Las 12 zonas de cobranza. No son solo localidades: cada una tiene cobrador '
  'asignado, y de aquí depende quién ve a qué cliente.';
comment on column public.zones.code is 'Prefijo de folios: CUE, VEL, PAS…';

create index zones_org_idx    on public.zones(org_id) where is_active;
create index branches_org_idx on public.branches(org_id) where is_active;

select public.poner_tocar_actualizado('organizations');
select public.poner_tocar_actualizado('branches');
select public.poner_tocar_actualizado('zones');


-- ####################################################################
-- #  003_perfiles_roles_permisos.sql
-- ####################################################################

-- ============================================================================
-- 003 · Perfiles, roles y catálogo de permisos
-- ============================================================================

-- profiles extiende auth.users de Supabase.
-- Las contraseñas NO viven aquí: las guarda Supabase Auth.
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  org_id         uuid not null references public.organizations(id) on delete restrict,
  full_name      text not null,
  email          text,
  phone          text,
  employee_code  text,
  branch_id      uuid references public.branches(id) on delete set null,
  device_id      text,
  avatar_url     text,
  last_seen_at   timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null,
  updated_by     uuid references public.profiles(id) on delete set null
);

comment on column public.profiles.device_id is
  'Número de serie del SUNMI L2s PRO asignado al técnico.';
comment on column public.profiles.is_active is
  'En false la persona no puede entrar, pero su historial se conserva completo.';

create table public.roles (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  code        text not null,
  name        text not null,
  description text,
  scope_type  text not null default 'zones'
              check (scope_type in ('all','zones','own')),
  is_system   boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint roles_code_unico unique (org_id, code)
);

comment on column public.roles.scope_type is
  'all = ve toda la empresa · zones = solo sus zonas · own = solo lo asignado a él';
comment on column public.roles.is_system is
  'Los siete roles del plan maestro. No se pueden borrar.';

create table public.permissions (
  id            uuid primary key default extensions.gen_random_uuid(),
  code          text not null unique,
  module        text not null,
  name          text not null,
  description   text,
  is_sensitive  boolean not null default false,
  created_at    timestamptz not null default now()
);

comment on column public.permissions.is_sensitive is
  'Dinero, costos y utilidades. Un técnico, almacén o cliente NUNCA puede tenerlos, '
  'ni aunque el administrador se los quiera dar a mano.';

create table public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_id  uuid not null references public.permissions(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index profiles_org_idx on public.profiles(org_id) where is_active;

select public.poner_tocar_actualizado('profiles');
select public.poner_tocar_actualizado('roles');


-- ####################################################################
-- #  004_asignaciones_y_candado.sql
-- ####################################################################

-- ============================================================================
-- 004 · Roles por persona, permisos individuales, zonas — y el candado
-- ============================================================================

create table public.user_roles (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role_id     uuid not null references public.roles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null,
  primary key (user_id, role_id)
);

comment on table public.user_roles is
  'Una persona puede tener más de un rol: el supervisor que también instala.';

-- Lo que el administrador prende y apaga uno por uno.
create table public.user_permissions (
  id             uuid primary key default extensions.gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  permission_id  uuid not null references public.permissions(id) on delete cascade,
  granted        boolean not null,
  reason         text,
  created_at     timestamptz not null default now(),
  granted_by     uuid references public.profiles(id) on delete set null,
  constraint user_permissions_unico unique (user_id, permission_id)
);

comment on column public.user_permissions.granted is
  'true = se le da además de su rol · false = se le quita aunque el rol lo traiga';

-- El alcance: qué zonas ve cada quien.
create table public.user_zones (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  zone_id      uuid not null references public.zones(id) on delete cascade,
  can_collect  boolean not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,
  primary key (user_id, zone_id)
);

comment on table public.user_zones is
  'Sin renglones aquí, y con un rol de alcance "zones", la persona no ve NADA. '
  'Es a propósito: más vale que no vea nada a que vea de más.';
comment on column public.user_zones.can_collect is
  'Cobrador: puede registrar pagos en campo en esa zona.';

-- ----------------------------------------------------------------------------
-- EL CANDADO
-- Ni el propietario puede darle un permiso de dinero a un técnico.
-- Se valida aquí, en la base. No en la pantalla.
-- ----------------------------------------------------------------------------
create or replace function public.impedir_permiso_sensible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  es_sensible boolean;
  solo_operativo boolean;
begin
  if new.granted is not true then
    return new;                     -- quitar un permiso siempre se permite
  end if;

  select p.is_sensitive into es_sensible
    from public.permissions p where p.id = new.permission_id;

  if not coalesce(es_sensible, false) then
    return new;
  end if;

  -- ¿Todos sus roles son operativos? (técnico, almacén, cliente)
  select bool_and(r.code in ('technician','warehouse','customer'))
    into solo_operativo
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
   where ur.user_id = new.user_id;

  if coalesce(solo_operativo, true) then
    raise exception
      'No se puede dar un permiso de dinero a un usuario operativo (técnico, almacén o cliente). '
      'Si esta persona debe ver cobranza, primero hay que darle el rol correspondiente.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_candado_permiso_sensible
  before insert or update on public.user_permissions
  for each row execute function public.impedir_permiso_sensible();

-- El mismo candado al revés: no darle un rol operativo a alguien que ya
-- trae permisos sensibles individuales.
create or replace function public.impedir_rol_incompatible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  choca integer;
begin
  if (select r.code from public.roles r where r.id = new.role_id)
     not in ('technician','warehouse','customer') then
    return new;
  end if;

  select count(*) into choca
    from public.user_permissions up
    join public.permissions p on p.id = up.permission_id
   where up.user_id = new.user_id and up.granted and p.is_sensitive;

  if choca > 0 then
    raise exception
      'Esta persona tiene permisos de dinero asignados. Quítaselos antes de darle un rol operativo.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_candado_rol_incompatible
  before insert or update on public.user_roles
  for each row execute function public.impedir_rol_incompatible();

create index user_zones_zona_idx on public.user_zones(zone_id);


-- ####################################################################
-- #  005_ajustes.sql
-- ####################################################################

-- ============================================================================
-- 005 · Ajustes del sistema
-- ============================================================================
-- Día de corte, tolerancia, cargos: TODO vive aquí, no en el código.
-- Cambiar una regla de negocio no debe requerir volver a compilar nada.
-- ============================================================================

create table public.settings (
  id           uuid primary key default extensions.gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  key          text not null,
  value        jsonb not null,
  value_type   text not null default 'string'
               check (value_type in ('string','number','boolean','json')),
  category     text not null default 'general',
  name         text not null,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null,
  constraint settings_key_unico unique (org_id, key)
);

select public.poner_tocar_actualizado('settings');

-- Lectura cómoda con valor por omisión, para no repetir coalesce en todos lados.
create or replace function public.ajuste_numero(p_org uuid, p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::numeric
                     from public.settings s
                    where s.org_id = p_org and s.key = p_key), p_default);
$$;


-- ####################################################################
-- #  006_comercial.sql
-- ####################################################################

-- ============================================================================
-- 006 · Planes, clientes, direcciones, contratos y servicios
-- ============================================================================

create table public.service_plans (
  id                uuid primary key default extensions.gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete restrict,
  code              text not null,
  name              text not null,
  download_mbps     integer,
  upload_mbps       integer,
  price             numeric(12,2) not null check (price >= 0),
  network_type      text not null default 'both'
                    check (network_type in ('ftth','wisp','both')),
  is_legacy         boolean not null default false,
  visible_for_sale  boolean not null default true,
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  updated_by        uuid references public.profiles(id) on delete set null,
  constraint service_plans_code_unico unique (org_id, code)
);

comment on column public.service_plans.is_legacy is
  'Los 16 precios que venían de los Excel entran marcados así. No se ofrecen a '
  'clientes nuevos, pero los actuales los conservan hasta que se decida migrarlos.';

create table public.customers (
  id                    uuid primary key default extensions.gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete restrict,
  customer_code         text not null,
  full_name             text not null,
  phone                 text,
  phone_alt             text,
  email                 text,
  tax_id                text,
  zone_id               uuid not null references public.zones(id) on delete restrict,
  status                text not null default 'active'
                        check (status in ('active','suspended','overdue','cancelled')),
  notes                 text,
  legacy_id             text,
  price_review_needed   boolean not null default false,
  import_batch_id       uuid,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.profiles(id) on delete set null,
  updated_by            uuid references public.profiles(id) on delete set null,
  deleted_at            timestamptz,
  constraint customers_code_unico unique (org_id, customer_code)
);

comment on column public.customers.price_review_needed is
  'Los 167 clientes sin precio en el Excel entran con esto en true, para que no '
  'se pierdan entre los demás.';
comment on column public.customers.zone_id is
  'De aquí depende quién puede ver a este cliente. No es opcional.';

create table public.addresses (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  type          text not null default 'installation'
                check (type in ('installation','billing','other')),
  street        text,
  number        text,
  neighborhood  text,
  city          text,
  state         text,
  postal_code   text,
  reference     text,
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  gps_accuracy_m numeric(6,2),
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null
);

comment on column public.addresses.reference is
  'En el campo esto vale más que la calle: "casa azul, frente a la tienda".';

create table public.contracts (
  id               uuid primary key default extensions.gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete restrict,
  customer_id      uuid not null references public.customers(id) on delete restrict,
  contract_number  text not null,
  plan_id          uuid references public.service_plans(id) on delete restrict,
  start_date       date,
  end_date         date,
  status           text not null default 'draft'
                   check (status in ('draft','active','expired','cancelled')),
  pdf_url          text,
  signature_id     uuid,
  signed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null,
  updated_by       uuid references public.profiles(id) on delete set null,
  constraint contracts_numero_unico unique (org_id, contract_number),
  constraint contracts_fechas check (end_date is null or end_date >= start_date)
);

create table public.customer_services (
  id                  uuid primary key default extensions.gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  customer_id         uuid not null references public.customers(id) on delete restrict,
  contract_id         uuid references public.contracts(id) on delete set null,
  plan_id             uuid not null references public.service_plans(id) on delete restrict,
  custom_price        numeric(12,2) check (custom_price is null or custom_price >= 0),
  address_id          uuid references public.addresses(id) on delete set null,
  network_type        text not null default 'ftth'
                      check (network_type in ('ftth','wisp')),
  equipment_unit_id   uuid,
  pon_port_id         uuid,
  network_element_id  uuid,
  parent_device_id    uuid,
  ip_address          inet,
  vlan                integer check (vlan is null or vlan between 1 and 4094),
  wifi_ssid           text,
  wifi_password       text,
  status              text not null default 'pending'
                      check (status in ('pending','active','suspended','cancelled')),
  activated_at        timestamptz,
  suspended_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null,
  updated_by          uuid references public.profiles(id) on delete set null
);

comment on table public.customer_services is
  'El corazón del sistema. Un cliente puede tener más de un servicio: casa y '
  'negocio, o fibra e inalámbrico.';
comment on column public.customer_services.custom_price is
  'Precio heredado del Excel. Si es nulo, manda el precio del plan.';

-- Precio que se cobra de verdad: el especial si existe, si no el del plan.
create or replace function public.precio_servicio(p_service uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(cs.custom_price, sp.price)
    from public.customer_services cs
    join public.service_plans sp on sp.id = cs.plan_id
   where cs.id = p_service;
$$;

create table public.prospects (
  id                    uuid primary key default extensions.gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete restrict,
  full_name             text not null,
  phone                 text not null,
  email                 text,
  zone_id               uuid not null references public.zones(id) on delete restrict,
  address_text          text,
  latitude              numeric(10,7),
  longitude             numeric(10,7),
  interested_plan_id    uuid references public.service_plans(id) on delete set null,
  coverage_status       text not null default 'unknown'
                        check (coverage_status in ('unknown','covered','needs_build','no_coverage')),
  nearest_element_id    uuid,
  status                text not null default 'new'
                        check (status in ('new','contacted','quoted','scheduled','converted','lost')),
  lost_reason           text check (lost_reason is null or lost_reason in
                        ('no_coverage','price','competitor','no_answer','other')),
  converted_customer_id uuid references public.customers(id) on delete set null,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.profiles(id) on delete set null,
  updated_by            uuid references public.profiles(id) on delete set null
);

create index customers_zona_idx    on public.customers(org_id, zone_id, status) where deleted_at is null;
create index customers_codigo_idx  on public.customers(org_id, customer_code);
create index customers_nombre_trgm on public.customers using gin (full_name extensions.gin_trgm_ops);
create index customers_revisar_idx on public.customers(org_id) where price_review_needed;
create index addresses_cliente_idx on public.addresses(customer_id);
create index servicios_cliente_idx on public.customer_services(customer_id, status);
create index prospects_zona_idx    on public.prospects(org_id, zone_id, status);

select public.poner_tocar_actualizado('service_plans');
select public.poner_tocar_actualizado('customers');
select public.poner_tocar_actualizado('addresses');
select public.poner_tocar_actualizado('contracts');
select public.poner_tocar_actualizado('customer_services');
select public.poner_tocar_actualizado('prospects');


-- ####################################################################
-- #  007_folios.sql
-- ####################################################################

-- ============================================================================
-- 007 · Folios por zona:  OI-CUE-0001, TK-VEL-0007, RC-PAS-0123
-- ============================================================================
-- Cada zona lleva su propia numeración. El cobrador y el técnico reconocen de
-- inmediato si un folio es suyo, y los reportes por zona cuadran solos.
-- ============================================================================

create table public.folio_counters (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  zone_id     uuid not null references public.zones(id) on delete cascade,
  kind        text not null check (kind in ('order','ticket','receipt','contract','customer')),
  last_number bigint not null default 0,
  primary key (org_id, zone_id, kind)
);

comment on table public.folio_counters is
  'Un contador por zona y por tipo. La fila se bloquea al pedir folio, así que '
  'dos cobradores no pueden sacar el mismo número aunque graben al mismo tiempo.';

create or replace function public.siguiente_folio(
  p_org uuid, p_zone uuid, p_kind text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
  v_num    bigint;
  v_pre    text;
begin
  select z.code into v_codigo from public.zones z
   where z.id = p_zone and z.org_id = p_org;

  if v_codigo is null then
    raise exception 'La zona no existe o no es de esta organización';
  end if;

  insert into public.folio_counters (org_id, zone_id, kind, last_number)
       values (p_org, p_zone, p_kind, 1)
  on conflict (org_id, zone_id, kind)
    do update set last_number = public.folio_counters.last_number + 1
    returning last_number into v_num;

  v_pre := case p_kind
             when 'order'    then 'OI'
             when 'ticket'   then 'TK'
             when 'receipt'  then 'RC'
             when 'contract' then 'CT'
             when 'customer' then 'CL'
           end;

  return v_pre || '-' || v_codigo || '-' || lpad(v_num::text, 4, '0');
end;
$$;

comment on function public.siguiente_folio is
  'Devuelve el siguiente folio de esa zona y lo aparta. Nunca repite.';


-- ####################################################################
-- #  008_cobranza.sql
-- ####################################################################

-- ============================================================================
-- 008 · Periodos, cargos, pagos y aplicaciones
-- ============================================================================
-- Reglas de ZUUUM (todas configurables en `settings`):
--   pago del 1 al 5 · gracia del 6 al 10 · corte el día 11
--   reconexión $30 · equipo no devuelto $550 · se paga por adelantado
-- ============================================================================

create table public.billing_periods (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  year            integer not null check (year between 2000 and 2100),
  month           integer not null check (month between 1 and 12),
  label           text not null,
  due_date        date not null,
  grace_end_date  date not null,
  cutoff_date     date not null,
  status          text not null default 'open' check (status in ('open','closed')),
  generated_at    timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null,
  constraint billing_periods_unico unique (org_id, year, month),
  constraint billing_periods_orden check (due_date <= grace_end_date and grace_end_date < cutoff_date)
);

comment on constraint billing_periods_orden on public.billing_periods is
  'El vencimiento no puede ser después de la gracia, ni la gracia después del corte.';

create table public.charges (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  customer_id   uuid not null references public.customers(id) on delete restrict,
  service_id    uuid references public.customer_services(id) on delete set null,
  period_id     uuid references public.billing_periods(id) on delete restrict,
  zone_id       uuid not null references public.zones(id) on delete restrict,
  type          text not null check (type in
                ('monthly','reconnection','installation','equipment_loss','other')),
  description   text,
  amount        numeric(12,2) not null check (amount > 0),
  balance       numeric(12,2) not null check (balance >= 0),
  due_date      date,
  status        text not null default 'pending'
                check (status in ('pending','partial','paid','cancelled')),
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles(id) on delete set null,
  cancelled_reason  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  constraint charges_saldo check (balance <= amount)
);

-- Impide generar dos veces la mensualidad del mismo servicio en el mismo periodo,
-- aunque alguien corra la generación por error dos veces.
-- Es un índice PARCIAL a propósito: los cargos sueltos (reconexión, equipo no
-- devuelto) no traen servicio ni periodo, y con una restricción normal todos
-- ellos chocarían entre sí.
create unique index charges_mensual_unico
    on public.charges (service_id, period_id)
 where type = 'monthly' and service_id is not null and period_id is not null;

create table public.cash_sessions (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  collector_id       uuid not null references public.profiles(id) on delete restrict,
  zone_id            uuid references public.zones(id) on delete set null,
  opened_at          timestamptz not null default now(),
  closed_at          timestamptz,
  expected_cash      numeric(12,2) not null default 0,
  expected_transfer  numeric(12,2) not null default 0,
  declared_cash      numeric(12,2),
  payment_count      integer not null default 0,
  status             text not null default 'open'
                     check (status in ('open','closed','delivered','verified')),
  delivered_to       uuid references public.profiles(id) on delete set null,
  verified_at        timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  difference         numeric(12,2)
                     generated always as (coalesce(declared_cash, 0) - expected_cash) stored
);

comment on column public.cash_sessions.difference is
  'Se calcula sola: lo declarado menos lo esperado. Si no cuadra, queda registrado y con nombre.';

create table public.payments (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  receipt_number     text not null,
  customer_id        uuid not null references public.customers(id) on delete restrict,
  zone_id            uuid not null references public.zones(id) on delete restrict,
  amount             numeric(12,2) not null check (amount > 0),
  method             text not null check (method in ('cash','transfer')),
  reference          text,
  paid_at            timestamptz not null default now(),
  received_by        uuid not null references public.profiles(id) on delete restrict,
  cash_session_id    uuid references public.cash_sessions(id) on delete set null,
  collected_in_field boolean not null default false,
  latitude           numeric(10,7),
  longitude          numeric(10,7),
  status             text not null default 'applied' check (status in ('applied','cancelled')),
  cancelled_at       timestamptz,
  cancelled_by       uuid references public.profiles(id) on delete set null,
  cancelled_reason   text,
  client_uuid        uuid,
  device_synced_at   timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint payments_folio_unico  unique (org_id, receipt_number),
  constraint payments_cliente_uuid unique (client_uuid)
);

comment on column public.payments.client_uuid is
  'Lo genera el SUNMI antes de sincronizar. Sin esto, un cobrador con mala señal '
  'puede registrar el mismo pago dos veces. Con esto, la base rechaza el duplicado sola.';
comment on column public.payments.received_by is
  'Quién recibió el dinero. Nunca nulo: siempre hay un responsable.';

create table public.payment_allocations (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  payment_id  uuid not null references public.payments(id) on delete cascade,
  charge_id   uuid not null references public.charges(id) on delete restrict,
  amount      numeric(12,2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);

comment on table public.payment_allocations is
  'A qué cargos se aplicó cada pago. Permite pagos parciales y adelantados.';

create table public.receipts (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  payment_id      uuid not null references public.payments(id) on delete cascade,
  receipt_number  text not null,
  pdf_url         text,
  sent_to         text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table public.service_suspensions (
  id                      uuid primary key default extensions.gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete restrict,
  service_id              uuid not null references public.customer_services(id) on delete cascade,
  suspended_at            timestamptz not null default now(),
  reactivated_at          timestamptz,
  reason                  text not null default 'overdue'
                          check (reason in ('overdue','requested','technical','other')),
  method                  text not null default 'manual'
                          check (method in ('manual','agent')),
  suspended_by            uuid references public.profiles(id) on delete set null,
  reactivated_by          uuid references public.profiles(id) on delete set null,
  reconnection_charge_id  uuid references public.charges(id) on delete set null,
  notes                   text,
  created_at              timestamptz not null default now()
);

comment on column public.service_suspensions.method is
  'En el MVP siempre "manual": la oficina corta a mano. "agent" entra en la etapa 12.';

-- ----------------------------------------------------------------------------
-- Aplicar un pago mueve el saldo del cargo. Se hace con disparador para que
-- sea imposible que la aplicación se le olvide.
-- ----------------------------------------------------------------------------
create or replace function public.aplicar_a_cargo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saldo numeric(12,2);
begin
  if tg_op = 'INSERT' then
    select balance into v_saldo from public.charges where id = new.charge_id for update;

    if v_saldo is null then
      raise exception 'El cargo no existe';
    end if;
    if new.amount > v_saldo then
      raise exception 'No se puede aplicar % a un cargo que solo debe %', new.amount, v_saldo
        using errcode = 'check_violation';
    end if;

    update public.charges
       set balance = balance - new.amount,
           status  = case when balance - new.amount = 0 then 'paid' else 'partial' end,
           updated_at = now()
     where id = new.charge_id;

    return new;

  elsif tg_op = 'DELETE' then
    update public.charges
       set balance = least(amount, balance + old.amount),
           status  = case when least(amount, balance + old.amount) = amount then 'pending'
                          else 'partial' end,
           updated_at = now()
     where id = old.charge_id;
    return old;
  end if;

  return null;
end;
$$;

create trigger trg_aplicar_a_cargo
  after insert or delete on public.payment_allocations
  for each row execute function public.aplicar_a_cargo();

create index charges_cliente_idx  on public.charges(customer_id, status);
create index charges_periodo_idx  on public.charges(period_id, status);
create index charges_zona_idx     on public.charges(zone_id, status) where status <> 'paid';
create index payments_cliente_idx on public.payments(customer_id, paid_at desc);
create index payments_zona_idx    on public.payments(zone_id, paid_at desc);
create index payments_caja_idx    on public.payments(cash_session_id);
create index cash_cobrador_idx    on public.cash_sessions(collector_id, opened_at desc);
create index suspensiones_idx     on public.service_suspensions(service_id, suspended_at desc);

select public.poner_tocar_actualizado('billing_periods');
select public.poner_tocar_actualizado('charges');
select public.poner_tocar_actualizado('payments');
select public.poner_tocar_actualizado('cash_sessions');


-- ####################################################################
-- #  009_inventario.sql
-- ####################################################################

-- ============================================================================
-- 009 · Inventario, existencias, equipos con serie y movimientos
-- ============================================================================

create table public.inventory_items (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete restrict,
  sku            text not null,
  name           text not null,
  category       text not null check (category in
                 ('ont','cpe','router','drop_cable','connector','outlet',
                  'patchcord','splitter','tool','other')),
  unit           text not null default 'piece' check (unit in ('piece','meter','roll')),
  is_serialized  boolean not null default false,
  min_stock      numeric(12,2) not null default 0,
  cost           numeric(12,2),
  brand          text,
  model          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null,
  constraint inventory_sku_unico unique (org_id, sku)
);

comment on column public.inventory_items.cost is
  'SENSIBLE. El técnico y el almacén no lo ven: se les sirve por una vista aparte.';

create table public.inventory_stock (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete restrict,
  item_id        uuid not null references public.inventory_items(id) on delete restrict,
  location_type  text not null check (location_type in ('branch','technician','vehicle')),
  location_id    uuid not null,
  quantity       numeric(12,2) not null default 0,
  updated_at     timestamptz not null default now(),
  constraint inventory_stock_unico unique (item_id, location_type, location_id)
);

create table public.equipment_units (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete restrict,
  item_id        uuid references public.inventory_items(id) on delete set null,
  serial_number  text not null,
  gpon_serial    text,
  mac_address    macaddr,
  brand          text,
  model          text,
  firmware       text,
  status         text not null default 'in_stock' check (status in
                 ('in_stock','assigned','installed','repair','lost','retired')),
  location_type  text check (location_type in ('branch','technician','vehicle','customer')),
  location_id    uuid,
  customer_id    uuid references public.customers(id) on delete set null,
  installed_at   timestamptz,
  removed_at     timestamptz,
  install_count  integer not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null,
  constraint equipment_serie_unica unique (org_id, serial_number)
);

comment on column public.equipment_units.gpon_serial is
  'Serial GPON ya limpio, sin prefijos. De aquí sale la marca: 48575443 = HWTC = Huawei.';
comment on column public.equipment_units.install_count is
  'Cuántas veces se ha reinstalado. Un equipo que va en la quinta vuelta merece revisión.';

create table public.inventory_movements (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  item_id            uuid references public.inventory_items(id) on delete restrict,
  equipment_unit_id  uuid references public.equipment_units(id) on delete restrict,
  quantity           numeric(12,2) not null,
  movement_type      text not null check (movement_type in
                     ('purchase','transfer','install','return','adjustment','loss')),
  from_type          text check (from_type in ('branch','technician','vehicle','supplier','customer')),
  from_id            uuid,
  to_type            text check (to_type in ('branch','technician','vehicle','customer','scrap')),
  to_id              uuid,
  work_order_id      uuid,
  reason             text,
  performed_by       uuid not null references public.profiles(id) on delete restrict,
  created_at         timestamptz not null default now()
);

comment on table public.inventory_movements is
  'Histórico puro. Nada se edita hacia atrás: si hubo un error, se hace un ajuste.';

create index inv_items_org_idx  on public.inventory_items(org_id) where is_active;
create index inv_stock_item_idx on public.inventory_stock(item_id);
create index equipos_serie_idx  on public.equipment_units(org_id, serial_number);
create index equipos_gpon_idx   on public.equipment_units(gpon_serial) where gpon_serial is not null;
create index equipos_cliente_idx on public.equipment_units(customer_id) where customer_id is not null;
create index movs_fecha_idx     on public.inventory_movements(org_id, created_at desc);

select public.poner_tocar_actualizado('inventory_items');
select public.poner_tocar_actualizado('equipment_units');


-- ####################################################################
-- #  010_red.sql
-- ####################################################################

-- ============================================================================
-- 010 · Sitios, equipos de red, OLT, puertos PON y elementos FTTH
-- ============================================================================

create table public.network_sites (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  name          text not null,
  type          text not null check (type in ('olt_site','tower','pop','other')),
  zone_id       uuid references public.zones(id) on delete set null,
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  elevation_m   numeric(8,2),
  height_m      numeric(6,2),
  access_notes  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null
);

comment on column public.network_sites.access_notes is
  'Llaves, permisos, a quién hay que hablarle para que abran. Se agradece a las 2 de la mañana.';

create table public.network_devices (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  name               text not null,
  device_type        text not null check (device_type in
                     ('olt','router','switch','sector','ap','server','other')),
  vendor             text,
  model              text,
  site_id            uuid references public.network_sites(id) on delete set null,
  zone_id            uuid references public.zones(id) on delete set null,
  mgmt_ip            inet,
  mac_address        macaddr,
  firmware           text,
  uisp_id            text,
  credentials_ref    text,
  latitude           numeric(10,7),
  longitude          numeric(10,7),
  azimuth            numeric(5,1) check (azimuth is null or azimuth between 0 and 360),
  tilt               numeric(4,1),
  beam_width         numeric(5,1),
  status             text not null default 'unknown'
                     check (status in ('online','offline','unknown','maintenance')),
  last_seen_at       timestamptz,
  config_backup_url  text,
  config_backup_at   timestamptz,
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id) on delete set null
);

comment on column public.network_devices.credentials_ref is
  'SOLO el nombre de la variable de entorno que el agente local lee de su propio '
  'archivo. NUNCA la contraseña. Si alguien se lleva un respaldo completo de esta '
  'base, no se lleva ni un acceso a las OLT.';
comment on column public.network_devices.uisp_id is
  'Identificador del equipo en UISP, para cruzar la señal en vivo.';

create table public.olt_cards (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  device_id   uuid not null references public.network_devices(id) on delete cascade,
  slot_number integer not null,
  card_type   text,
  port_count  integer not null default 16,
  status      text not null default 'up' check (status in ('up','down','empty')),
  created_at  timestamptz not null default now(),
  constraint olt_cards_unico unique (device_id, slot_number)
);

create table public.pon_ports (
  id           uuid primary key default extensions.gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  card_id      uuid not null references public.olt_cards(id) on delete cascade,
  port_number  integer not null,
  port_index   integer,
  max_onus     integer not null default 128,
  used_onus    integer not null default 0,
  status       text not null default 'up' check (status in ('up','down','disabled')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pon_ports_unico unique (card_id, port_number),
  constraint pon_ports_cupo check (used_onus <= max_onus)
);

comment on column public.pon_ports.port_number is
  'VSOL numera 1 a 16; Huawei 0 a 15. Se guarda tal como lo dice el equipo.';
comment on column public.pon_ports.port_index is
  'El índice calculado por marca, que ya está resuelto y verificado contra 8 ONU reales.';

create table public.network_elements (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  element_type       text not null check (element_type in
                     ('nap','closure','splitter','pole','hand_hole','other')),
  code               text not null,
  name               text,
  zone_id            uuid references public.zones(id) on delete set null,
  parent_element_id  uuid references public.network_elements(id) on delete set null,
  pon_port_id        uuid references public.pon_ports(id) on delete set null,
  latitude           numeric(10,7),
  longitude          numeric(10,7),
  capacity           integer,
  used_ports         integer not null default 0,
  split_ratio        text,
  insertion_loss_db  numeric(5,2),
  otdr_distance_m    numeric(10,2),
  real_distance_m    numeric(10,2),
  installed_at       date,
  photo_url          text,
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id) on delete set null,
  constraint network_elements_code_unico unique (org_id, code),
  constraint network_elements_cupo check (capacity is null or used_ports <= capacity)
);

comment on column public.network_elements.otdr_distance_m is
  'Lo que marca el OTDR. La distancia real se calcula con las guardas ya definidas: '
  '50 m de sitio, 20 m por poste, 20 m por caja.';

create table public.fiber_links (
  id               uuid primary key default extensions.gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete restrict,
  from_element_id  uuid not null references public.network_elements(id) on delete cascade,
  to_element_id    uuid not null references public.network_elements(id) on delete cascade,
  cable_type       text,
  fiber_count      integer,
  fiber_color      text,
  length_m         numeric(10,2),
  loss_db          numeric(5,2),
  path             jsonb,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint fiber_links_distintos check (from_element_id <> to_element_id)
);

comment on column public.fiber_links.fiber_color is 'Código de colores TIA-598.';
comment on column public.fiber_links.path is 'Puntos del trazo, para dibujarlo en el mapa.';

-- Ahora sí se pueden amarrar las llaves que quedaron sueltas en 006.
alter table public.customer_services
  add constraint fk_servicio_equipo   foreign key (equipment_unit_id)
      references public.equipment_units(id) on delete set null,
  add constraint fk_servicio_puerto   foreign key (pon_port_id)
      references public.pon_ports(id) on delete set null,
  add constraint fk_servicio_elemento foreign key (network_element_id)
      references public.network_elements(id) on delete set null,
  add constraint fk_servicio_padre    foreign key (parent_device_id)
      references public.network_devices(id) on delete set null;

alter table public.prospects
  add constraint fk_prospecto_elemento foreign key (nearest_element_id)
      references public.network_elements(id) on delete set null;

create index devices_zona_idx    on public.network_devices(org_id, zone_id) where is_active;
create index devices_tipo_idx    on public.network_devices(org_id, device_type) where is_active;
create index elements_zona_idx   on public.network_elements(org_id, zone_id, element_type) where is_active;
create index elements_padre_idx  on public.network_elements(parent_element_id);
create index elements_puerto_idx on public.network_elements(pon_port_id);
create index links_desde_idx     on public.fiber_links(from_element_id);
create index links_hasta_idx     on public.fiber_links(to_element_id);
create index servicios_puerto_idx   on public.customer_services(pon_port_id);
create index servicios_elemento_idx on public.customer_services(network_element_id);

select public.poner_tocar_actualizado('network_sites');
select public.poner_tocar_actualizado('network_devices');
select public.poner_tocar_actualizado('pon_ports');
select public.poner_tocar_actualizado('network_elements');
select public.poner_tocar_actualizado('fiber_links');


-- ####################################################################
-- #  011_lecturas_senal.sql
-- ####################################################################

-- ============================================================================
-- 011 · Historial de señal  (particionado por mes)
-- ============================================================================
-- 206 CPE + 158 ONU leídos cada 5 minutos son ~105,000 renglones al día.
-- Dos medidas desde el principio:
--   1. Particionar por mes: borrar un mes viejo es instantáneo.
--   2. Guardar solo cuando la señal cambia más de 1 dBm.
-- Después de 90 días se resume a promedios por hora y se sueltan los crudos.
-- ============================================================================

create table public.device_readings (
  id                 uuid not null default extensions.gen_random_uuid(),
  org_id             uuid not null,
  device_id          uuid,
  equipment_unit_id  uuid,
  service_id         uuid,
  read_at            timestamptz not null default now(),
  source             text not null check (source in
                     ('uisp','snmp','telnet','adminolt','manual')),
  rx_power_dbm       numeric(6,2),
  tx_power_dbm       numeric(6,2),
  signal_dbm         numeric(6,2),
  noise_floor_dbm    numeric(6,2),
  ccq                numeric(5,2),
  uptime_seconds     bigint,
  status             text check (status in ('online','offline')),
  primary key (id, read_at)
) partition by range (read_at);

comment on table public.device_readings is
  'Particionada por mes. Sin llaves foráneas a propósito: en una tabla de este '
  'volumen cada verificación cuesta, y los datos los escribe solo el agente local.';

-- Crea la partición del mes que se le pida (y no truena si ya existe).
create or replace function public.crear_particion_lecturas(p_anio int, p_mes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ini date := make_date(p_anio, p_mes, 1);
  v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month')::date;
  v_nom text := format('device_readings_%s_%s', p_anio, lpad(p_mes::text, 2, '0'));
begin
  if to_regclass('public.' || v_nom) is not null then
    return;
  end if;
  execute format(
    'create table public.%I partition of public.device_readings for values from (%L) to (%L);',
    v_nom, v_ini, v_fin);
  execute format(
    'create index %I on public.%I (equipment_unit_id, read_at desc);',
    v_nom || '_equipo_idx', v_nom);
  execute format(
    'create index %I on public.%I (device_id, read_at desc);',
    v_nom || '_equipored_idx', v_nom);
end;
$$;

-- Resumen por hora: lo que queda cuando se sueltan los crudos.
create table public.device_readings_hourly (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null,
  device_id          uuid,
  equipment_unit_id  uuid,
  hour               timestamptz not null,
  samples            integer not null,
  rx_avg             numeric(6,2),
  rx_min             numeric(6,2),
  rx_max             numeric(6,2),
  signal_avg         numeric(6,2),
  signal_min         numeric(6,2),
  offline_minutes    integer not null default 0,
  constraint hourly_unico unique nulls not distinct (equipment_unit_id, device_id, hour)
);

-- Resume y limpia lo más viejo que los días indicados.
create or replace function public.resumir_lecturas(p_dias int default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_corte timestamptz := now() - make_interval(days => p_dias);
  v_filas integer;
begin
  insert into public.device_readings_hourly
    (org_id, device_id, equipment_unit_id, hour, samples,
     rx_avg, rx_min, rx_max, signal_avg, signal_min, offline_minutes)
  select org_id, device_id, equipment_unit_id,
         date_trunc('hour', read_at), count(*),
         round(avg(rx_power_dbm), 2), min(rx_power_dbm), max(rx_power_dbm),
         round(avg(signal_dbm), 2),  min(signal_dbm),
         count(*) filter (where status = 'offline') * 5
    from public.device_readings
   where read_at < v_corte
   group by org_id, device_id, equipment_unit_id, date_trunc('hour', read_at)
  on conflict do nothing;

  get diagnostics v_filas = row_count;

  delete from public.device_readings where read_at < v_corte;
  return v_filas;
end;
$$;

comment on function public.resumir_lecturas is
  'Se corre una vez al día desde el agente local o un cron. Deja el detalle de '
  'los últimos 90 días y convierte lo viejo en promedios por hora.';

-- Particiones para arrancar: el mes actual y los tres siguientes.
do $$
declare i int;
begin
  for i in 0..3 loop
    perform public.crear_particion_lecturas(
      extract(year  from (current_date + make_interval(months => i)))::int,
      extract(month from (current_date + make_interval(months => i)))::int);
  end loop;
end $$;


-- ####################################################################
-- #  012_operacion.sql
-- ####################################################################

-- ============================================================================
-- 012 · Órdenes de trabajo, evidencias, lecturas, firmas y tickets
-- ============================================================================

create table public.work_orders (
  id                  uuid primary key default extensions.gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  order_number        text not null,
  type                text not null check (type in
                      ('installation','relocation','removal','maintenance','repair')),
  customer_id         uuid references public.customers(id) on delete restrict,
  service_id          uuid references public.customer_services(id) on delete set null,
  ticket_id           uuid,
  zone_id             uuid not null references public.zones(id) on delete restrict,
  status              text not null default 'draft' check (status in
                      ('draft','scheduled','in_progress','completed','cancelled')),
  priority            text not null default 'normal'
                      check (priority in ('low','normal','high','urgent')),
  scheduled_for       timestamptz,
  started_at          timestamptz,
  completed_at        timestamptz,
  reserved_element_id uuid references public.network_elements(id) on delete set null,
  reserved_port       integer,
  description         text,
  resolution_notes    text,
  client_uuid         uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null,
  updated_by          uuid references public.profiles(id) on delete set null,
  constraint work_orders_folio_unico  unique (org_id, order_number),
  constraint work_orders_cliente_uuid unique (client_uuid)
);

create table public.work_order_assignments (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete restrict,
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  technician_id  uuid not null references public.profiles(id) on delete restrict,
  role           text not null default 'lead' check (role in ('lead','helper')),
  assigned_at    timestamptz not null default now(),
  accepted_at    timestamptz,
  constraint asignacion_unica unique (work_order_id, technician_id)
);

create table public.work_order_photos (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  work_order_id   uuid not null references public.work_orders(id) on delete cascade,
  photo_type      text not null default 'other' check (photo_type in
                  ('facade','installation','equipment','reading','other')),
  storage_path    text not null,
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  taken_at        timestamptz,
  taken_by        uuid references public.profiles(id) on delete set null,
  file_size_bytes integer,
  created_at      timestamptz not null default now()
);

create table public.work_order_materials (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  work_order_id      uuid not null references public.work_orders(id) on delete cascade,
  item_id            uuid references public.inventory_items(id) on delete restrict,
  equipment_unit_id  uuid references public.equipment_units(id) on delete set null,
  quantity           numeric(12,2) not null check (quantity > 0),
  movement_id        uuid references public.inventory_movements(id) on delete set null,
  created_at         timestamptz not null default now()
);

create table public.installation_readings (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete restrict,
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  reading_point  text not null check (reading_point in ('nap','ont','cpe')),
  rx_power_dbm   numeric(6,2),
  tx_power_dbm   numeric(6,2),
  signal_dbm     numeric(6,2),
  measured_at    timestamptz not null default now(),
  measured_by    uuid references public.profiles(id) on delete set null,
  is_acceptable  boolean generated always as
                 (rx_power_dbm is not null and rx_power_dbm between -25 and -8) stored
);

comment on column public.installation_readings.is_acceptable is
  'Se calcula sola: verde entre −25 y −8 dBm. No depende de que la app lo evalúe bien.';

create table public.customer_signatures (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete restrict,
  customer_id    uuid not null references public.customers(id) on delete restrict,
  work_order_id  uuid references public.work_orders(id) on delete set null,
  contract_id    uuid references public.contracts(id) on delete set null,
  purpose        text not null check (purpose in
                 ('installation','contract','equipment_receipt','equipment_return')),
  signature_url  text not null,
  signer_name    text,
  signed_at      timestamptz not null default now(),
  latitude       numeric(10,7),
  longitude      numeric(10,7),
  created_at     timestamptz not null default now()
);

alter table public.contracts
  add constraint fk_contrato_firma foreign key (signature_id)
      references public.customer_signatures(id) on delete set null;

create table public.tickets (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  ticket_number      text not null,
  customer_id        uuid references public.customers(id) on delete restrict,
  service_id         uuid references public.customer_services(id) on delete set null,
  zone_id            uuid not null references public.zones(id) on delete restrict,
  category           text not null check (category in
                     ('no_service','slow','intermittent','equipment','billing','other')),
  priority           text not null default 'normal'
                     check (priority in ('low','normal','high','urgent')),
  status             text not null default 'open' check (status in
                     ('open','assigned','in_progress','waiting','resolved','closed')),
  subject            text,
  description        text,
  assigned_to        uuid references public.profiles(id) on delete set null,
  parent_incident_id uuid references public.tickets(id) on delete set null,
  root_cause         text check (root_cause is null or root_cause in
                     ('fiber_cut','dirty_connector','equipment_failure','power',
                      'configuration','customer_side','false_alarm','other')),
  opened_at          timestamptz not null default now(),
  resolved_at        timestamptz,
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id) on delete set null,
  constraint tickets_folio_unico unique (org_id, ticket_number)
);

create table public.ticket_comments (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete restrict,
  ticket_id      uuid not null references public.tickets(id) on delete cascade,
  author_id      uuid references public.profiles(id) on delete set null,
  body           text not null,
  is_internal    boolean not null default false,
  attachment_url text,
  created_at     timestamptz not null default now()
);

comment on column public.ticket_comments.is_internal is
  'Los internos no se le muestran al cliente en su portal.';

alter table public.work_orders
  add constraint fk_orden_ticket foreign key (ticket_id)
      references public.tickets(id) on delete set null;

alter table public.inventory_movements
  add constraint fk_mov_orden foreign key (work_order_id)
      references public.work_orders(id) on delete set null;

-- ----------------------------------------------------------------------------
-- No se cierra una instalación sin foto, sin potencia y sin firma.
-- Se valida en la base: ni una app vieja ni un error de programación
-- pueden saltárselo.
-- ----------------------------------------------------------------------------
create or replace function public.exigir_evidencia_al_cerrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fotos int; v_lecturas int; v_firmas int;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  if new.type <> 'installation' then
    return new;                      -- solo se exige en instalaciones
  end if;

  select count(*) into v_fotos    from public.work_order_photos      where work_order_id = new.id;
  select count(*) into v_lecturas from public.installation_readings  where work_order_id = new.id;
  select count(*) into v_firmas   from public.customer_signatures    where work_order_id = new.id;

  if v_fotos = 0 then
    raise exception 'No se puede cerrar la instalación sin al menos una foto.'
      using errcode = 'check_violation';
  end if;
  if v_lecturas = 0 then
    raise exception 'No se puede cerrar la instalación sin la potencia medida.'
      using errcode = 'check_violation';
  end if;
  if v_firmas = 0 then
    raise exception 'No se puede cerrar la instalación sin la firma del cliente.'
      using errcode = 'check_violation';
  end if;

  new.completed_at := coalesce(new.completed_at, now());
  return new;
end;
$$;

create trigger trg_evidencia_al_cerrar
  before update on public.work_orders
  for each row execute function public.exigir_evidencia_al_cerrar();

create index ordenes_estado_idx  on public.work_orders(status, scheduled_for);
create index ordenes_zona_idx    on public.work_orders(org_id, zone_id, status);
create index ordenes_cliente_idx on public.work_orders(customer_id);
create index asign_tecnico_idx   on public.work_order_assignments(technician_id);
create index fotos_orden_idx     on public.work_order_photos(work_order_id);
create index tickets_estado_idx  on public.tickets(org_id, status, priority, opened_at desc);
create index tickets_zona_idx    on public.tickets(org_id, zone_id, status);
create index comentarios_idx     on public.ticket_comments(ticket_id, created_at);

select public.poner_tocar_actualizado('work_orders');
select public.poner_tocar_actualizado('tickets');


-- ####################################################################
-- #  013_sistema.sql
-- ####################################################################

-- ============================================================================
-- 013 · Notificaciones, adjuntos, importaciones y auditoría
-- ============================================================================

create table public.notifications (
  id           uuid primary key default extensions.gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  customer_id  uuid references public.customers(id) on delete cascade,
  channel      text not null default 'in_app'
               check (channel in ('in_app','email','push','whatsapp')),
  type         text not null,
  title        text not null,
  body         text,
  data         jsonb,
  status       text not null default 'pending'
               check (status in ('pending','sent','failed','read')),
  sent_at      timestamptz,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create table public.attachments (
  id           uuid primary key default extensions.gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  file_name    text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   integer,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null
);

create table public.import_batches (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  source_file    text not null,
  kind           text not null default 'customers',
  row_count      integer not null default 0,
  created_count  integer not null default 0,
  updated_count  integer not null default 0,
  error_count    integer not null default 0,
  errors         jsonb,
  status         text not null default 'running'
                 check (status in ('running','completed','failed','reverted')),
  imported_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

comment on table public.import_batches is
  'Cada importación de Excel queda registrada. Si algo salió mal, se sabe qué '
  'entró en esa tanda y se puede deshacer.';

alter table public.customers
  add constraint fk_cliente_importacion foreign key (import_batch_id)
      references public.import_batches(id) on delete set null;

-- ----------------------------------------------------------------------------
-- AUDITORÍA
-- Se llena con disparadores, no desde la aplicación: así no se puede evitar.
-- Nadie puede modificarla ni borrarla. Ni el propietario.
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  org_id      uuid,
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('insert','update','delete')),
  old_values  jsonb,
  new_values  jsonb,
  user_id     uuid,
  ip_address  inet,
  user_agent  text,
  device_id   text,
  created_at  timestamptz not null default now()
);

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viejo jsonb;
  v_nuevo jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_llave text;
  v_org uuid;
  v_id  uuid;
begin
  if tg_op = 'INSERT' then
    v_nuevo := to_jsonb(new);
    v_org := (v_nuevo ->> 'org_id')::uuid;
    v_id  := (v_nuevo ->> 'id')::uuid;

  elsif tg_op = 'UPDATE' then
    v_viejo := to_jsonb(old);
    v_nuevo := to_jsonb(new);
    -- Solo se guarda lo que de verdad cambió: si no, el registro se vuelve inútil.
    for v_llave in select jsonb_object_keys(v_nuevo) loop
      if v_llave <> 'updated_at'
         and (v_viejo -> v_llave) is distinct from (v_nuevo -> v_llave) then
        v_cambios := v_cambios || jsonb_build_object(
          v_llave, jsonb_build_object('antes', v_viejo -> v_llave,
                                      'ahora', v_nuevo -> v_llave));
      end if;
    end loop;
    if v_cambios = '{}'::jsonb then
      return new;                      -- nada cambió, no se ensucia la bitácora
    end if;
    v_org := (v_nuevo ->> 'org_id')::uuid;
    v_id  := (v_nuevo ->> 'id')::uuid;

  else
    v_viejo := to_jsonb(old);
    v_org := (v_viejo ->> 'org_id')::uuid;
    v_id  := (v_viejo ->> 'id')::uuid;
  end if;

  insert into public.audit_logs
    (org_id, table_name, record_id, action, old_values, new_values, user_id)
  values
    (v_org, tg_table_name, v_id, lower(tg_op),
     case when tg_op = 'UPDATE' then v_cambios else v_viejo end,
     case when tg_op = 'UPDATE' then null      else v_nuevo end,
     nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);

  return coalesce(new, old);
end;
$$;

create or replace function public.poner_auditoria(nombre_tabla text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  execute format(
    'drop trigger if exists trg_auditoria on public.%I;
     create trigger trg_auditoria after insert or update or delete on public.%I
     for each row execute function public.registrar_auditoria();',
    nombre_tabla, nombre_tabla);
end;
$$;

-- Se audita lo que importa: dinero, clientes, permisos y red.
select public.poner_auditoria(t) from unnest(array[
  'customers','customer_services','service_plans','contracts',
  'charges','payments','payment_allocations','cash_sessions','service_suspensions',
  'profiles','user_roles','user_permissions','user_zones','roles',
  'equipment_units','inventory_movements',
  'network_devices','network_elements','pon_ports',
  'work_orders','tickets','zones','settings'
]) as t;

-- La bitácora es de solo lectura, a nivel de tabla.
revoke insert, update, delete on public.audit_logs from public;
revoke update, delete on public.audit_logs from postgres;

create index audit_tabla_idx   on public.audit_logs(table_name, record_id, created_at desc);
create index audit_usuario_idx on public.audit_logs(user_id, created_at desc);
create index audit_org_idx     on public.audit_logs(org_id, created_at desc);
create index notif_usuario_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index adjuntos_idx      on public.attachments(entity_type, entity_id);


-- ####################################################################
-- #  014_funciones_de_acceso.sql
-- ####################################################################

-- ============================================================================
-- 014 · Las tres funciones de las que cuelga toda la seguridad
-- ============================================================================
-- Van con `security definer` para poder leer las tablas de permisos sin que
-- el propio RLS se muerda la cola, y con `search_path = ''` para que nadie
-- pueda engañarlas creando una tabla con el mismo nombre en otro esquema.
-- ============================================================================

-- ¿De qué organización es quien está preguntando?
create or replace function public.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.org_id from public.profiles p
   where p.id = (select auth.uid()) and p.is_active
   limit 1;
$$;

-- ¿Tiene este permiso? Rol + individuales, con el candado de los sensibles.
create or replace function public.auth_has(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (
    select p.id from public.profiles p
     where p.id = (select auth.uid()) and p.is_active
  ),
  perm as (
    select id, is_sensitive from public.permissions where code = p_permiso
  ),
  solo_operativo as (
    select coalesce(bool_and(r.code in ('technician','warehouse','customer')), true) as si
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = (select id from yo)
  ),
  quitado as (
    select 1 from public.user_permissions up
     where up.user_id = (select id from yo)
       and up.permission_id = (select id from perm)
       and up.granted = false
  ),
  por_rol as (
    select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
     where ur.user_id = (select id from yo)
       and rp.permission_id = (select id from perm)
  ),
  dado as (
    select 1 from public.user_permissions up
     where up.user_id = (select id from yo)
       and up.permission_id = (select id from perm)
       and up.granted = true
  )
  select
    exists (select 1 from yo)
    and not exists (select 1 from quitado)
    and (exists (select 1 from por_rol) or exists (select 1 from dado))
    -- El candado: un permiso de dinero nunca aplica a alguien solo operativo.
    and not ((select is_sensitive from perm) and (select si from solo_operativo));
$$;

comment on function public.auth_has is
  'Permiso efectivo: lo que da el rol, más lo individual, menos lo quitado, '
  'y con los permisos de dinero bloqueados para roles operativos.';

-- ¿Ve toda la empresa, o solo sus zonas?
create or replace function public.auth_alcance_total()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = (select auth.uid()) and r.scope_type = 'all'
  );
$$;

-- ¿Puede ver esta zona?
create or replace function public.auth_ve_zona(p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_alcance_total()
      or exists (select 1 from public.user_zones uz
                  where uz.user_id = (select auth.uid()) and uz.zone_id = p_zona);
$$;

-- ¿Puede cobrar en esta zona?
create or replace function public.auth_cobra_zona(p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_alcance_total()
      or exists (select 1 from public.user_zones uz
                  where uz.user_id = (select auth.uid())
                    and uz.zone_id = p_zona and uz.can_collect);
$$;

-- ¿Esta orden está asignada a quien pregunta?
create or replace function public.auth_orden_propia(p_orden uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.work_order_assignments a
                  where a.work_order_id = p_orden
                    and a.technician_id = (select auth.uid()));
$$;

-- ¿Este cliente tiene una orden asignada hoy a quien pregunta?
-- Es lo que le deja al técnico ver al cliente del domicilio al que va, y a nadie más.
create or replace function public.auth_cliente_de_mi_orden(p_cliente uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.work_orders o
      join public.work_order_assignments a on a.work_order_id = o.id
     where o.customer_id = p_cliente
       and a.technician_id = (select auth.uid())
       and o.status in ('scheduled','in_progress')
  );
$$;


-- ####################################################################
-- #  015_rls.sql
-- ####################################################################

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


-- ####################################################################
-- #  016_vistas.sql
-- ####################################################################

-- ============================================================================
-- 016 · Vistas
-- ============================================================================
-- Todas con security_invoker: la vista respeta el RLS de quien pregunta,
-- no el de quien la creó. Sin esto, una vista sería una puerta trasera.
-- ============================================================================

-- Inventario SIN costo. Es la que consumen técnico y almacén.
create view public.inventario_sin_costo
with (security_invoker = true) as
select id, org_id, sku, name, category, unit, is_serialized,
       min_stock, brand, model, is_active
  from public.inventory_items;

comment on view public.inventario_sin_costo is
  'Igual que inventory_items pero sin la columna cost. El panel se la sirve a '
  'quien no tiene inventory.cost.read.';

-- Expediente del cliente, de un jalón.
--
-- OJO: aquí NO se puede usar join + group by. Si se juntan servicios, cargos y
-- pagos en el mismo FROM, cada cargo multiplica el precio del servicio y la
-- mensualidad sale inflada. Se probó con datos reales: un cliente de $797 con
-- 6 cargos aparecía con $4,782. Por eso van subconsultas, no joins.
create view public.v_clientes
with (security_invoker = true) as
select c.id, c.org_id, c.customer_code, c.full_name, c.phone, c.email,
       c.status, c.price_review_needed, c.created_at,
       z.id as zone_id, z.name as zona, z.code as zona_codigo,
       (select count(*) from public.customer_services s
         where s.customer_id = c.id and s.status = 'active') as servicios_activos,
       (select coalesce(sum(coalesce(s.custom_price, p.price)), 0)
          from public.customer_services s
          join public.service_plans p on p.id = s.plan_id
         where s.customer_id = c.id and s.status = 'active') as mensualidad,
       (select coalesce(sum(ch.balance), 0) from public.charges ch
         where ch.customer_id = c.id and ch.status in ('pending','partial')) as adeudo,
       (select max(pg.paid_at) from public.payments pg
         where pg.customer_id = c.id and pg.status = 'applied') as ultimo_pago
  from public.customers c
  join public.zones z on z.id = c.zone_id
 where c.deleted_at is null;

-- Cobranza por zona y periodo. Es el reporte que más se va a abrir.
-- Aquí sí se puede agrupar: cada cargo es un renglón, no hay multiplicación.
create view public.v_cobranza_zona
with (security_invoker = true) as
select ch.org_id, ch.zone_id, z.name as zona, ch.period_id, bp.label as periodo,
       count(*) as cargos,
       count(*) filter (where ch.status = 'paid') as pagados,
       count(*) filter (where ch.status in ('pending','partial')) as pendientes,
       sum(ch.amount) as esperado,
       sum(ch.amount - ch.balance) as cobrado,
       sum(ch.balance) as por_cobrar
  from public.charges ch
  join public.zones z on z.id = ch.zone_id
  left join public.billing_periods bp on bp.id = ch.period_id
 where ch.status <> 'cancelled'
 group by ch.org_id, ch.zone_id, z.name, ch.period_id, bp.label;

-- Morosos: quién pasó del día de corte sin pagar.
-- Mismo cuidado que en v_clientes: el adeudo va por subconsulta.
create view public.v_morosos
with (security_invoker = true) as
select c.id as customer_id, c.org_id, c.customer_code, c.full_name, c.phone,
       c.zone_id, z.name as zona,
       (select coalesce(sum(ch.balance), 0) from public.charges ch
         where ch.customer_id = c.id and ch.status in ('pending','partial')) as adeudo,
       (select min(ch.due_date) from public.charges ch
         where ch.customer_id = c.id and ch.status in ('pending','partial')) as vence_desde,
       (current_date - (select min(ch.due_date) from public.charges ch
                         where ch.customer_id = c.id
                           and ch.status in ('pending','partial'))) as dias_vencido,
       (select count(*) from public.customer_services s
         where s.customer_id = c.id and s.status = 'active') as servicios_activos
  from public.customers c
  join public.zones z on z.id = c.zone_id
 where c.deleted_at is null
   and c.status <> 'cancelled'
   and exists (select 1 from public.charges ch
                where ch.customer_id = c.id
                  and ch.status in ('pending','partial')
                  and ch.due_date < current_date);

comment on view public.v_morosos is
  'Con la regla de ZUUUM: vencen el día 5, gracia hasta el 10, corte el 11. '
  'Los que aquí traen dias_vencido >= 6 son los que se cortan.';

-- Ocupación de la red: qué NAP y qué puertos PON están por llenarse.
create view public.v_ocupacion_red
with (security_invoker = true) as
select e.id, e.org_id, e.code, e.element_type, e.zone_id, z.name as zona,
       e.capacity, e.used_ports,
       case when coalesce(e.capacity, 0) > 0
            then round(e.used_ports * 100.0 / e.capacity) else null end as porcentaje,
       e.latitude, e.longitude
  from public.network_elements e
  join public.zones z on z.id = e.zone_id
 where e.is_active and e.element_type in ('nap','splitter');


-- ####################################################################
-- #  017_semilla.sql
-- ####################################################################

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


-- ####################################################################
-- #  018_rls_particiones.sql
-- ####################################################################

-- ============================================================================
-- 018 · RLS en las particiones del historial de señal
-- ============================================================================
-- HUECO QUE ESTO CIERRA
--
-- `device_readings` está particionada por mes. Al prender RLS en la tabla padre,
-- las consultas que pasan por ella quedan protegidas. Pero PostgreSQL NO aplica
-- las políticas del padre cuando alguien consulta una partición POR SU NOMBRE:
--
--     select * from device_readings              -> 0 filas   (protegido)
--     select * from device_readings_2026_07      -> 1 fila    (¡se cuela!)
--
-- Y como las particiones viven en el esquema `public`, la API de Supabase las
-- expone igual que cualquier otra tabla. Cualquiera con la llave pública podría
-- leer el historial de señal de toda la red entrando por ahí.
--
-- Se descubrió corriendo la consulta de verificación de COMO_APLICAR.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cerrar las particiones que ya existen
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_inherits i on i.inhrelid = c.oid
      join pg_class p on p.oid = i.inhparent
     where n.nspname = 'public' and p.relname = 'device_readings'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists lecturas_particion on public.%I;', t);
    execute format(
      'create policy lecturas_particion on public.%I for select
         using (org_id = public.auth_org_id() and public.auth_has(''network.read''));', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Que las particiones futuras nazcan cerradas
--    (se redefine la función para que no haya que acordarse)
-- ----------------------------------------------------------------------------
create or replace function public.crear_particion_lecturas(p_anio int, p_mes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ini date := make_date(p_anio, p_mes, 1);
  v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month')::date;
  v_nom text := format('device_readings_%s_%s', p_anio, lpad(p_mes::text, 2, '0'));
begin
  if to_regclass('public.' || v_nom) is not null then
    return;
  end if;

  execute format(
    'create table public.%I partition of public.device_readings for values from (%L) to (%L);',
    v_nom, v_ini, v_fin);
  execute format(
    'create index %I on public.%I (equipment_unit_id, read_at desc);',
    v_nom || '_equipo_idx', v_nom);
  execute format(
    'create index %I on public.%I (device_id, read_at desc);',
    v_nom || '_equipored_idx', v_nom);

  -- Sin esto, la partición nueva quedaría abierta aunque el padre esté cerrado.
  execute format('alter table public.%I enable row level security;', v_nom);
  execute format(
    'create policy lecturas_particion on public.%I for select
       using (org_id = public.auth_org_id() and public.auth_has(''network.read''));', v_nom);
end;
$$;

comment on function public.crear_particion_lecturas is
  'Crea la partición del mes indicado, con sus índices Y con RLS. '
  'Las particiones no heredan las políticas del padre cuando se consultan directo.';

-- ----------------------------------------------------------------------------
-- 3. Comprobación: esto no debe devolver ni un renglón
-- ----------------------------------------------------------------------------
do $$
declare v_abiertas int;
begin
  select count(*) into v_abiertas
    from pg_tables t
   where t.schemaname = 'public'
     and not exists (select 1 from pg_class c
                       join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname = t.tablename
                        and c.relrowsecurity);
  if v_abiertas > 0 then
    raise exception 'Quedaron % tablas sin RLS. Revisar antes de seguir.', v_abiertas;
  end if;
  raise notice 'Todas las tablas de public tienen RLS activo.';
end $$;




-- ============================================================================
--  LISTO. Para comprobar que quedó bien, corre esto en otra consulta:
--
--    select 'tablas' as que, count(*) from pg_tables where schemaname='public'
--    union all select 'politicas', count(*) from pg_policies where schemaname='public'
--    union all select 'permisos',  count(*) from public.permissions
--    union all select 'roles',     count(*) from public.roles
--    union all select 'zonas',     count(*) from public.zones;
--
--  Debe dar: 53 tablas · 91 politicas · 43 permisos · 7 roles · 12 zonas
-- ============================================================================
