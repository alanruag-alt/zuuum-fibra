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
