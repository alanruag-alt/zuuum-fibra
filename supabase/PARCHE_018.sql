-- ============================================================================
--  PARCHE PARA UNA BASE QUE YA TIENE EL ESQUEMA INSTALADO
-- ----------------------------------------------------------------------------
--  Si ya corriste ESQUEMA_COMPLETO.sql ANTES del 28 de julio por la tarde,
--  tu base tiene las cuatro particiones del historial de señal sin protección.
--
--  Pega este archivo en el SQL Editor y dale Run. Tarda un segundo.
--  Al final debe decir: "Todas las tablas de public tienen RLS activo."
--
--  Si vas a instalar desde cero, NO necesitas esto: ya viene incluido
--  en ESQUEMA_COMPLETO.sql.
-- ============================================================================

-- ============================================================================
-- 018 · RLS en las particiones del historial de señal
-- ============================================================================
-- HUECO QUE ESTO CIERRA
--
-- `device_readings` está particionada por mes. Al prender RLS en la tabla padre,
-- las consultas que pasan por ella quedan protegidas. Pero PostgreSQL NO aplica
-- las políticas del padre cuando alguien consulta una partición POR SU NOMBRE:
--
--     select * from device_readings              -> 0 filas   (protegido)
--     select * from device_readings_2026_07      -> 1 fila    (¡se cuela!)
--
-- Y como las particiones viven en el esquema `public`, la API de Supabase las
-- expone igual que cualquier otra tabla. Cualquiera con la llave pública podría
-- leer el historial de señal de toda la red entrando por ahí.
--
-- Se descubrió corriendo la consulta de verificación de COMO_APLICAR.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cerrar las particiones que ya existen
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_inherits i on i.inhrelid = c.oid
      join pg_class p on p.oid = i.inhparent
     where n.nspname = 'public' and p.relname = 'device_readings'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists lecturas_particion on public.%I;', t);
    execute format(
      'create policy lecturas_particion on public.%I for select
         using (org_id = public.auth_org_id() and public.auth_has(''network.read''));', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Que las particiones futuras nazcan cerradas
--    (se redefine la función para que no haya que acordarse)
-- ----------------------------------------------------------------------------
create or replace function public.crear_particion_lecturas(p_anio int, p_mes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ini date := make_date(p_anio, p_mes, 1);
  v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month')::date;
  v_nom text := format('device_readings_%s_%s', p_anio, lpad(p_mes::text, 2, '0'));
begin
  if to_regclass('public.' || v_nom) is not null then
    return;
  end if;

  execute format(
    'create table public.%I partition of public.device_readings for values from (%L) to (%L);',
    v_nom, v_ini, v_fin);
  execute format(
    'create index %I on public.%I (equipment_unit_id, read_at desc);',
    v_nom || '_equipo_idx', v_nom);
  execute format(
    'create index %I on public.%I (device_id, read_at desc);',
    v_nom || '_equipored_idx', v_nom);

  -- Sin esto, la partición nueva quedaría abierta aunque el padre esté cerrado.
  execute format('alter table public.%I enable row level security;', v_nom);
  execute format(
    'create policy lecturas_particion on public.%I for select
       using (org_id = public.auth_org_id() and public.auth_has(''network.read''));', v_nom);
end;
$$;

comment on function public.crear_particion_lecturas is
  'Crea la partición del mes indicado, con sus índices Y con RLS. '
  'Las particiones no heredan las políticas del padre cuando se consultan directo.';

-- ----------------------------------------------------------------------------
-- 3. Comprobación: esto no debe devolver ni un renglón
-- ----------------------------------------------------------------------------
do $$
declare v_abiertas int;
begin
  select count(*) into v_abiertas
    from pg_tables t
   where t.schemaname = 'public'
     and not exists (select 1 from pg_class c
                       join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname = t.tablename
                        and c.relrowsecurity);
  if v_abiertas > 0 then
    raise exception 'Quedaron % tablas sin RLS. Revisar antes de seguir.', v_abiertas;
  end if;
  raise notice 'Todas las tablas de public tienen RLS activo.';
end $$;
