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
