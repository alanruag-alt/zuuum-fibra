-- ============================================================================
--  ⚠  REINICIAR LA BASE — BORRA TODO
-- ----------------------------------------------------------------------------
--  Esto elimina TODAS las tablas, datos, políticas y funciones de ZUUUM FIBRA.
--  No hay deshacer.
--
--  Úsalo solo si:
--    · algo salió mal a media instalación y quieres empezar limpio, o
--    · estás en una base de pruebas.
--
--  NUNCA lo corras en la base que ya trae los clientes de verdad.
--
--  Las cuentas de Authentication NO se tocan: viven en el esquema `auth`,
--  que este archivo no toca. Tus usuarios siguen ahí.
-- ============================================================================

-- Descomenta la línea de abajo para confirmar que sabes lo que haces.
-- Mientras esté comentada, este archivo no hace nada.

-- \set BORRAR_DE_VERDAD 1

do $$
begin
  if current_setting('is_superuser') is null then null; end if;
  raise notice 'Si ves esto y no descomentaste la línea, no pasó nada. Bien.';
end $$;

-- ----------------------------------------------------------------------------
-- Para borrar de verdad, quita los guiones de las tres líneas siguientes:
-- ----------------------------------------------------------------------------

-- drop schema public cascade;
-- create schema public;
-- grant usage on schema public to anon, authenticated, service_role;
