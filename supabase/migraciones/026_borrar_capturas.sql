-- ============================================================================
-- 026 · Poder borrar lo que se capturó mal
-- ============================================================================
-- Faltaba lo obvio: si uno puede dar de alta un sitio, una NAP, un equipo o un
-- artículo, tiene que poder borrarlo cuando lo escribió mal o lo duplicó. Sin
-- eso, cada dedazo se queda para siempre en las listas y la gente deja de
-- confiar en lo que ve.
--
-- La regla, para las cuatro:
--
--   · Si NADIE depende de ese renglón, se borra de verdad. Un sitio mal
--     escrito no merece quedarse de fantasma en la base.
--
--   · Si alguien depende —una NAP con clientes colgados, una OLT con tarjetas,
--     un artículo con existencia— NO se borra y se dice exactamente cuántos y
--     qué hacer primero. Borrar en cascada aquí sería desconectar clientes sin
--     que nadie se entere.
--
-- Para dejar de usar algo que sí tiene historia, existe la casilla «ya no se
-- usa»: eso lo saca de las listas de trabajo sin romper lo que pasó antes.
--
-- Todo borrado queda en la bitácora con quién y cuándo. Por eso, de paso, se
-- ponen bajo auditoría las dos tablas que faltaban.
-- ============================================================================

select public.poner_auditoria(t) from unnest(array[
  'network_sites', 'inventory_items'
]) as t;

-- ----------------------------------------------------------------------------
-- 1 · Sitios
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_sitio(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid := public.auth_org_id();
  v_nombre  text;
  v_equipos int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar sitios' using errcode = '42501';
  end if;

  select s.name into v_nombre
    from public.network_sites s where s.id = p_id and s.org_id = v_org;

  if v_nombre is null then
    raise exception 'Ese sitio no existe';
  end if;

  select count(*) into v_equipos
    from public.network_devices d where d.site_id = p_id;

  if v_equipos > 0 then
    raise exception
      'No se puede borrar %: %. Muévelos a otro sitio o bórralos primero.',
      v_nombre,
      case when v_equipos = 1 then 'tiene un equipo ahí'
           else 'tiene ' || v_equipos || ' equipos ahí' end;
  end if;

  delete from public.network_sites where id = p_id and org_id = v_org;

  return v_nombre;
end;
$$;

comment on function public.eliminar_sitio is
  'Borra un sitio vacío. Si tiene equipos, se niega y dice cuántos: borrar en '
  'cascada dejaría equipos huérfanos sin que nadie se entere.';

-- ----------------------------------------------------------------------------
-- 2 · Equipos de red
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_dispositivo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid := public.auth_org_id();
  v_nombre    text;
  v_tarjetas  int;
  v_servicios int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar equipos de red' using errcode = '42501';
  end if;

  select d.name into v_nombre
    from public.network_devices d where d.id = p_id and d.org_id = v_org;

  if v_nombre is null then
    raise exception 'Ese equipo no existe';
  end if;

  select count(*) into v_tarjetas
    from public.olt_cards c where c.device_id = p_id;

  -- Los clientes inalámbricos cuelgan del sector. Si se borra el sector, se
  -- pierde de qué antena vive cada quien, y eso es justo lo que se necesita
  -- saber el día que esa antena falla.
  select count(*) into v_servicios
    from public.customer_services s where s.parent_device_id = p_id;

  if v_tarjetas > 0 then
    raise exception
      'No se puede borrar %: tiene % tarjetas capturadas con sus puertos. '
      'Si ya no está en servicio, márcalo como «ya no se usa».',
      v_nombre, v_tarjetas;
  end if;

  if v_servicios > 0 then
    raise exception
      'No se puede borrar %: %. Pásalos a otro equipo primero.',
      v_nombre,
      case when v_servicios = 1 then 'hay un servicio colgado de ahí'
           else 'hay ' || v_servicios || ' servicios colgados de ahí' end;
  end if;

  delete from public.network_devices where id = p_id and org_id = v_org;

  return v_nombre;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3 · Elementos de red (NAP, mangas, splitters)
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_elemento(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid := public.auth_org_id();
  v_codigo    text;
  v_servicios int;
  v_hijos     int;
  v_tramos    int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar elementos de red' using errcode = '42501';
  end if;

  select n.code into v_codigo
    from public.network_elements n where n.id = p_id and n.org_id = v_org;

  if v_codigo is null then
    raise exception 'Ese elemento no existe';
  end if;

  select count(*) into v_servicios
    from public.customer_services s where s.network_element_id = p_id;

  select count(*) into v_hijos
    from public.network_elements n where n.parent_element_id = p_id;

  select count(*) into v_tramos
    from public.fiber_links f
   where f.from_element_id = p_id or f.to_element_id = p_id;

  if v_servicios > 0 then
    raise exception
      'No se puede borrar %: %. Pásalos a otra caja primero.',
      v_codigo,
      case when v_servicios = 1 then 'hay un cliente conectado ahí'
           else 'hay ' || v_servicios || ' clientes conectados ahí' end;
  end if;

  if v_hijos > 0 then
    raise exception
      'No se puede borrar %: hay % elementos que cuelgan de ahí.',
      v_codigo, v_hijos;
  end if;

  if v_tramos > 0 then
    raise exception
      'No se puede borrar %: hay % tramos de fibra que llegan o salen de ahí.',
      v_codigo, v_tramos;
  end if;

  delete from public.network_elements where id = p_id and org_id = v_org;

  return v_codigo;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4 · Artículos de almacén
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_articulo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org         uuid := public.auth_org_id();
  v_nombre      text;
  v_existencia  numeric;
  v_equipos     int;
  v_movimientos int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('inventory.write') then
    raise exception 'No tienes permiso para borrar artículos' using errcode = '42501';
  end if;

  select i.name into v_nombre
    from public.inventory_items i where i.id = p_id and i.org_id = v_org;

  if v_nombre is null then
    raise exception 'Ese artículo no existe';
  end if;

  select coalesce(sum(s.quantity), 0) into v_existencia
    from public.inventory_stock s where s.item_id = p_id;

  select count(*) into v_equipos
    from public.equipment_units e where e.item_id = p_id;

  -- Un artículo con movimientos es historia del almacén. Borrarlo dejaría
  -- renglones sin nombre en la bitácora, y esa bitácora es lo que se revisa
  -- cuando falta material.
  select count(*) into v_movimientos
    from public.inventory_movements m where m.item_id = p_id;

  if v_existencia <> 0 then
    raise exception
      'No se puede borrar %: todavía hay % en existencia. Sácalo con un ajuste primero.',
      v_nombre, v_existencia;
  end if;

  if v_equipos > 0 then
    raise exception
      'No se puede borrar %: hay % equipos con serie de ese tipo.',
      v_nombre, v_equipos;
  end if;

  if v_movimientos > 0 then
    raise exception
      'No se puede borrar %: ya tiene % movimientos de almacén y esa historia no '
      'se tira. Márcalo como «ya no se usa» y deja de aparecer en las listas.',
      v_nombre, v_movimientos;
  end if;

  delete from public.inventory_items where id = p_id and org_id = v_org;

  return v_nombre;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.eliminar_sitio(uuid) from public, anon;
revoke all on function public.eliminar_dispositivo(uuid) from public, anon;
revoke all on function public.eliminar_elemento(uuid) from public, anon;
revoke all on function public.eliminar_articulo(uuid) from public, anon;

grant execute on function public.eliminar_sitio(uuid) to authenticated;
grant execute on function public.eliminar_dispositivo(uuid) to authenticated;
grant execute on function public.eliminar_elemento(uuid) to authenticated;
grant execute on function public.eliminar_articulo(uuid) to authenticated;
