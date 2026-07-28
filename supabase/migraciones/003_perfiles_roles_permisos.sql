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
