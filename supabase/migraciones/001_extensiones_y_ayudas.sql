-- ============================================================================
-- 001 · Extensiones y funciones de ayuda
-- ============================================================================
-- Todo lo que el resto de las migraciones da por hecho.
-- Correr esta primero, siempre.
-- ============================================================================

create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid()
create extension if not exists pg_trgm   with schema extensions;  -- búsqueda con errores de dedo

-- ----------------------------------------------------------------------------
-- updated_at se actualiza solo. Nunca a mano.
-- ----------------------------------------------------------------------------
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tocar_actualizado is
  'Disparador: pone updated_at = now() en cada UPDATE.';

-- ----------------------------------------------------------------------------
-- Atajo para colgarle el disparador a una tabla sin repetir el bloque.
-- ----------------------------------------------------------------------------
create or replace function public.poner_tocar_actualizado(nombre_tabla text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  execute format(
    'drop trigger if exists trg_actualizado on public.%I;
     create trigger trg_actualizado before update on public.%I
     for each row execute function public.tocar_actualizado();',
    nombre_tabla, nombre_tabla);
end;
$$;
