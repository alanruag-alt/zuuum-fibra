-- ============================================================================
-- 00 · Simular Supabase en un PostgreSQL cualquiera
-- ============================================================================
-- Esto NO se corre en Supabase. Supabase ya trae todo esto.
--
-- Sirve para poder probar el esquema completo en una base local antes de
-- tocar la de producción. Sin esto, `ESQUEMA_COMPLETO.sql` falla en la línea 47
-- porque da por hecho que existen el esquema `extensions` y el esquema `auth`.
--
-- Uso:
--   createdb zuuum
--   psql -d zuuum -f pruebas/00_simular_supabase.sql
--   psql -d zuuum -f ESQUEMA_COMPLETO.sql
--   psql -d zuuum -f migraciones/019_operacion_cobranza.sql
--   psql -d zuuum -f pruebas/prueba_seguridad.sql
--   psql -d zuuum -f pruebas/prueba_cobranza.sql
-- ============================================================================

create schema if not exists extensions;
create schema if not exists auth;

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists pg_trgm   with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Los tres roles que Supabase crea solo.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- Versión mínima de auth.users: solo lo que el esquema referencia.
create table if not exists auth.users (
  id    uuid primary key default extensions.gen_random_uuid(),
  email text
);

-- En Supabase, auth.uid() lee el JWT. Aquí lee una variable de sesión, que es
-- lo que permite a las pruebas decir "ahora soy Beto" con:
--   set local request.jwt.claim.sub = '2222...';
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
