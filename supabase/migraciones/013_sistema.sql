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
