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
