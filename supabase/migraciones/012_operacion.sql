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
