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
