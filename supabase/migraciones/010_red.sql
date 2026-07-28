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
