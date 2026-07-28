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
