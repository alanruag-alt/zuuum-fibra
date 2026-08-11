-- ============================================================================
-- 031 · Los extremos salen del trazo, y todo se puede borrar
-- ============================================================================
-- Dos cosas que salieron al usarlo:
--
-- 1. Al dar de alta un cable se pedía escribir de dónde sale y a dónde llega.
--    Es captura doble: en cuanto se dibuja la ruta en el mapa, el primer punto
--    ES de dónde sale y el último ES a dónde llega, con coordenadas exactas.
--    Escribirlo aparte solo abre la puerta a que digan cosas distintas, y
--    entonces ¿cuál de las dos es la buena? Ahora los extremos se leen del
--    trazo, y el texto queda como apodo opcional para el que prefiera «la
--    esquina de la primaria».
--
-- 2. Faltaba poder borrar cables, equipos con serie y hojas de plano. Si uno
--    puede crear algo, tiene que poder deshacerlo: si no, cada dedazo se queda
--    para siempre y la gente deja de confiar en lo que ve.
--
-- La regla de borrado es la de siempre: si nadie depende, se borra de verdad;
-- si alguien depende, se niega y se dice qué hay que hacer primero.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Los extremos del cable, leídos del trazo
-- ----------------------------------------------------------------------------
drop view if exists public.v_cables;
create view public.v_cables with (security_invoker = true) as
select cb.id,
       cb.org_id,
       cb.code,
       cb.cable_type,
       cb.fiber_count,
       cb.zone_id,
       z.name as zona,
       cb.from_text,
       cb.to_text,
       -- El apodo si lo hay; si no, el elemento amarrado; si no, nada. El
       -- lugar de verdad son las coordenadas de abajo.
       coalesce(cb.from_text, ef.code, ef.name) as de,
       coalesce(cb.to_text,   et.code, et.name) as a,
       (cb.path -> 0 ->> 0)::numeric                                     as desde_lat,
       (cb.path -> 0 ->> 1)::numeric                                     as desde_lon,
       (cb.path -> (jsonb_array_length(cb.path) - 1) ->> 0)::numeric     as hasta_lat,
       (cb.path -> (jsonb_array_length(cb.path) - 1) ->> 1)::numeric     as hasta_lon,
       jsonb_array_length(coalesce(cb.path, '[]'::jsonb))                as puntos_trazo,
       cb.length_m,
       cb.plan_color,
       cb.notes,
       cb.is_active,
       (select count(*) from public.fiber_strands s
         where s.cable_id = cb.id)                                     as hilos,
       (select count(*) from public.fiber_strands s
         where s.cable_id = cb.id and s.status = 'disponible')          as libres,
       (select count(*) from public.fiber_strands s
         where s.cable_id = cb.id and s.status = 'en_servicio')         as en_servicio,
       (select count(*) from public.fiber_strands s
         where s.cable_id = cb.id and s.status in ('danado','cortado')) as lastimados,
       (select count(*) from public.poles p
         where p.cable_id = cb.id and p.is_active)                      as postes
  from public.fiber_cables cb
  left join public.zones z on z.id = cb.zone_id
  left join public.network_elements ef on ef.id = cb.from_id
  left join public.network_elements et on et.id = cb.to_id;

comment on view public.v_cables is
  'Los cables con sus hilos por estado y los extremos leídos del trazo. Si hay '
  'ruta dibujada, el primer punto es de dónde sale y el último a dónde llega: '
  'no hace falta escribirlo aparte.';

grant select on public.v_cables to authenticated;

-- ----------------------------------------------------------------------------
-- 2 · Borrar un cable
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_cable(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid := public.auth_org_id();
  v_codigo    text;
  v_fusiones  int;
  v_servicio  int;
  v_postes    int;
  v_napes     int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar cables' using errcode = '42501';
  end if;

  select cb.code into v_codigo
    from public.fiber_cables cb where cb.id = p_id and cb.org_id = v_org;

  if v_codigo is null then
    raise exception 'Ese cable no existe';
  end if;

  -- Borrar el cable se lleva sus hilos por cascada, y con ellos las fusiones.
  -- Eso puede desconectar clientes sin que nadie se entere, así que se revisa
  -- antes y se dice exactamente qué estorba.
  select count(*) into v_fusiones
    from public.fiber_splices f
    join public.fiber_strands s on s.id = f.in_strand_id or s.id = f.out_strand_id
   where s.cable_id = p_id and f.status = 'activa';

  select count(*) into v_servicio
    from public.fiber_strands s
   where s.cable_id = p_id and s.status = 'en_servicio';

  select count(*) into v_napes
    from public.network_elements n
    join public.fiber_strands s on s.id = n.feed_strand_id
   where s.cable_id = p_id;

  select count(*) into v_postes
    from public.poles p where p.cable_id = p_id and p.is_active;

  if v_fusiones > 0 then
    raise exception
      'No se puede borrar %: sus hilos tienen % fusiones activas. Bórralas primero.',
      v_codigo, v_fusiones;
  end if;

  if v_napes > 0 then
    raise exception
      'No se puede borrar %: hay % NAP colgadas de sus hilos.',
      v_codigo, v_napes;
  end if;

  if v_servicio > 0 then
    raise exception
      'No se puede borrar %: tiene % hilos en servicio.',
      v_codigo, v_servicio;
  end if;

  -- Los postes no impiden borrar: se sueltan y quedan para reacomodar. Un
  -- poste sigue existiendo en la calle aunque el cable se haya capturado mal.
  update public.poles
     set cable_id = null, sort_order = null, span_from_id = null, span_m = null
   where cable_id = p_id;

  delete from public.fiber_cables where id = p_id and org_id = v_org;

  return v_codigo || case when v_postes > 0
         then ' · ' || v_postes || ' postes quedaron sueltos, vuelve a renumerar'
         else '' end;
end;
$$;

comment on function public.eliminar_cable is
  'Borra el cable y sus hilos. Se niega si hay fusiones, NAP colgadas o hilos '
  'en servicio: eso desconectaría clientes sin avisar. Los postes solo se '
  'sueltan, porque siguen existiendo en la calle.';

-- ----------------------------------------------------------------------------
-- 3 · Borrar un equipo con serie
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_equipo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_e    record;
  v_movs int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('inventory.write') then
    raise exception 'No tienes permiso para borrar equipos' using errcode = '42501';
  end if;

  select * into v_e from public.equipment_units
   where id = p_id and org_id = v_org;

  if v_e.id is null then
    raise exception 'Ese equipo no existe';
  end if;

  if v_e.status = 'installed' then
    raise exception
      'No se puede borrar %: está instalado en un domicilio. Retíralo primero.',
      v_e.serial_number;
  end if;

  select count(*) into v_movs
    from public.inventory_movements m where m.equipment_unit_id = p_id;

  if v_movs > 0 then
    raise exception
      'No se puede borrar %: ya tiene % movimientos de almacén y esa historia '
      'no se tira. Márcalo como dado de baja.',
      v_e.serial_number, v_movs;
  end if;

  delete from public.equipment_units where id = p_id and org_id = v_org;

  return v_e.serial_number;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4 · Borrar una hoja de plano
-- ----------------------------------------------------------------------------
-- Una hoja de plano no tiene nada colgando: es papelería. Se borra y ya.
create or replace function public.eliminar_plano(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_nombre text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar planos' using errcode = '42501';
  end if;

  delete from public.cfe_plans where id = p_id and org_id = v_org
  returning name into v_nombre;

  if v_nombre is null then
    raise exception 'Ese plano no existe';
  end if;

  return v_nombre;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Quitarle el trazo a un cable
-- ----------------------------------------------------------------------------
create or replace function public.borrar_trazo(p_cable uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := public.auth_org_id();
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar trazos' using errcode = '42501';
  end if;

  update public.fiber_cables set path = null, updated_at = now()
   where id = p_cable and org_id = v_org;

  if not found then
    raise exception 'Ese cable no existe';
  end if;

  -- Los postes que se habían acomodado con ese trazo quedan sueltos: sin
  -- ruta no hay contra qué ordenarlos.
  update public.poles
     set sort_order = null, span_from_id = null, span_m = null
   where cable_id = p_cable;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.eliminar_cable(uuid) from public, anon;
revoke all on function public.eliminar_equipo(uuid) from public, anon;
revoke all on function public.eliminar_plano(uuid) from public, anon;
revoke all on function public.borrar_trazo(uuid) from public, anon;

grant execute on function public.eliminar_cable(uuid) to authenticated;
grant execute on function public.eliminar_equipo(uuid) to authenticated;
grant execute on function public.eliminar_plano(uuid) to authenticated;
grant execute on function public.borrar_trazo(uuid) to authenticated;
