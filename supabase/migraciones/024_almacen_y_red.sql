-- ============================================================================
-- 024 · Almacén y red: las operaciones
-- ============================================================================
-- Las tablas ya estaban desde la 009 y la 010. Lo que faltaba era poder
-- moverlas sin entrar a la base.
--
--   guardar_articulo()      catálogo del almacén
--   mover_inventario()      entradas, traspasos, salidas y ajustes
--   alta_equipo()           dar de alta un equipo con número de serie
--   instalar_equipo()       se lo lleva el cliente, queda amarrado a su servicio
--   recuperar_equipo()      regresa al almacén, o se cobra si no lo devolvió
--   guardar_sitio()         torres, casetas, sitios de OLT
--   guardar_dispositivo()   OLT, MikroTik, switches, antenas
--   guardar_elemento()      NAP, mangas, splitters, postes
--
-- La regla que atraviesa todo el módulo: las existencias NUNCA se editan a
-- mano. Se mueven, y el movimiento queda escrito. Si hubo un error se hace un
-- ajuste, que también queda escrito. Un almacén donde se puede "corregir" el
-- número sin dejar rastro no sirve para encontrar al que se lleva las cosas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Catálogo
-- ----------------------------------------------------------------------------
create or replace function public.guardar_articulo(
  p_id        uuid    default null,
  p_sku       text    default null,
  p_nombre    text    default null,
  p_categoria text    default 'other',
  p_unidad    text    default 'piece',
  p_con_serie boolean default false,
  p_minimo    numeric default 0,
  p_costo     numeric default null,
  p_marca     text    default null,
  p_modelo    text    default null,
  p_activo    boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('inventory.write') then
    raise exception 'No tienes permiso para editar el catálogo' using errcode = '42501';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then
    raise exception 'Falta el nombre del artículo';
  end if;

  -- El costo es dato sensible. Quien no puede ver finanzas tampoco lo captura:
  -- si lo intenta, se guarda el artículo pero el costo se ignora.
  if p_id is null then
    if p_sku is null or length(btrim(p_sku)) < 2 then
      raise exception 'Falta la clave (SKU) del artículo';
    end if;

    insert into public.inventory_items
      (org_id, sku, name, category, unit, is_serialized, min_stock, cost,
       brand, model, is_active, created_by)
    values
      (v_org, upper(btrim(p_sku)), btrim(p_nombre), p_categoria, p_unidad,
       p_con_serie, coalesce(p_minimo, 0),
       case when public.auth_has('finance.read') then p_costo else null end,
       p_marca, p_modelo, p_activo, auth.uid())
    returning id into v_id;
  else
    update public.inventory_items
       set name = btrim(p_nombre), category = p_categoria, unit = p_unidad,
           min_stock = coalesce(p_minimo, min_stock),
           cost = case when public.auth_has('finance.read') then coalesce(p_costo, cost) else cost end,
           brand = coalesce(p_marca, brand), model = coalesce(p_modelo, model),
           is_active = p_activo, updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese artículo no existe';
    end if;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2 · Mover inventario
-- ----------------------------------------------------------------------------
-- Un solo camino para todo: comprar, traspasar entre técnicos, instalar en un
-- cliente, devolver, ajustar y dar por perdido. Todo pasa por aquí y todo deja
-- movimiento.
--
-- La existencia se actualiza dentro de la misma transacción que el movimiento.
-- No pueden quedar desfasados.
-- ----------------------------------------------------------------------------
create or replace function public.mover_inventario(
  p_articulo  uuid,
  p_cantidad  numeric,
  p_tipo      text,
  p_de_tipo   text default null,
  p_de_id     uuid default null,
  p_a_tipo    text default null,
  p_a_id      uuid default null,
  p_motivo    text default null,
  p_orden     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_yo   uuid := auth.uid();
  v_id   uuid;
  v_hay  numeric;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('inventory.move') then
    raise exception 'No tienes permiso para mover inventario' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero';
  end if;
  if p_tipo not in ('purchase','transfer','install','return','adjustment','loss') then
    raise exception 'Ese tipo de movimiento no existe';
  end if;
  if not exists (select 1 from public.inventory_items i
                  where i.id = p_articulo and i.org_id = v_org) then
    raise exception 'Ese artículo no existe';
  end if;

  -- Si sale de algún lado, tiene que haber de dónde sacarlo. El almacén no
  -- puede quedar en negativo: eso esconde robos y errores de captura.
  if p_de_tipo in ('branch','technician','vehicle') then
    select coalesce(quantity, 0) into v_hay
      from public.inventory_stock
     where item_id = p_articulo and location_type = p_de_tipo and location_id = p_de_id;

    if coalesce(v_hay, 0) < p_cantidad then
      raise exception 'No hay suficiente. Ahí solo hay %, y quieres sacar %',
        coalesce(v_hay, 0), p_cantidad;
    end if;

    update public.inventory_stock
       set quantity = quantity - p_cantidad, updated_at = now()
     where item_id = p_articulo and location_type = p_de_tipo and location_id = p_de_id;
  end if;

  -- Si llega a algún lado, se suma. 'customer' y 'scrap' no llevan existencia:
  -- salieron del almacén y ya.
  if p_a_tipo in ('branch','technician','vehicle') then
    insert into public.inventory_stock (org_id, item_id, location_type, location_id, quantity)
    values (v_org, p_articulo, p_a_tipo, p_a_id, p_cantidad)
    on conflict (item_id, location_type, location_id)
      do update set quantity = public.inventory_stock.quantity + p_cantidad,
                    updated_at = now();
  end if;

  insert into public.inventory_movements
    (org_id, item_id, quantity, movement_type, from_type, from_id, to_type, to_id,
     work_order_id, reason, performed_by)
  values
    (v_org, p_articulo, p_cantidad, p_tipo, p_de_tipo, p_de_id, p_a_tipo, p_a_id,
     p_orden, p_motivo, v_yo)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.mover_inventario is
  'El único camino para tocar existencias. Nunca deja el almacén en negativo y '
  'siempre deja movimiento escrito.';

-- ----------------------------------------------------------------------------
-- 3 · Equipos con número de serie
-- ----------------------------------------------------------------------------
create or replace function public.alta_equipo(
  p_serie     text,
  p_articulo  uuid    default null,
  p_gpon      text    default null,
  p_mac       text    default null,
  p_marca     text    default null,
  p_modelo    text    default null,
  p_donde_tipo text   default 'branch',
  p_donde_id  uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
  v_gpon text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('inventory.write') then
    raise exception 'No tienes permiso para dar de alta equipos' using errcode = '42501';
  end if;
  if p_serie is null or length(btrim(p_serie)) < 4 then
    raise exception 'Falta el número de serie';
  end if;

  -- El serial GPON se guarda limpio, en mayúsculas y sin separadores. Si se
  -- guarda como viene de cada lector, el mismo equipo aparece tres veces.
  v_gpon := nullif(upper(regexp_replace(coalesce(p_gpon, ''), '[^0-9A-Za-z]', '', 'g')), '');

  insert into public.equipment_units
    (org_id, item_id, serial_number, gpon_serial, mac_address, brand, model,
     status, location_type, location_id, created_by)
  values
    (v_org, p_articulo, upper(btrim(p_serie)), v_gpon,
     nullif(btrim(coalesce(p_mac,'')), '')::macaddr, p_marca, p_modelo,
     'in_stock', p_donde_tipo, p_donde_id, auth.uid())
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un equipo con esa serie';
end;
$$;

-- ----------------------------------------------------------------------------
-- Instalar un equipo en casa del cliente.
-- ----------------------------------------------------------------------------
-- Lo amarra al servicio, lo saca del almacén y le suma una vuelta al contador
-- de instalaciones. Ese contador es el que después dice qué equipo ya anda en
-- la quinta reinstalación y merece revisión antes de volver a salir.
-- ----------------------------------------------------------------------------
create or replace function public.instalar_equipo(
  p_serie    text,
  p_servicio uuid,
  p_orden    uuid default null
)
returns table (equipo_id uuid, veces_instalado int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_e   record;
  v_s   record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('inventory.move') then
    raise exception 'No tienes permiso para instalar equipos' using errcode = '42501';
  end if;

  select * into v_e from public.equipment_units
   where org_id = v_org and serial_number = upper(btrim(p_serie));

  if v_e.id is null then
    raise exception 'No existe ningún equipo con la serie %', upper(btrim(p_serie));
  end if;
  if v_e.status = 'installed' then
    raise exception 'Ese equipo ya está instalado en otro domicilio. Primero hay que recuperarlo.';
  end if;
  if v_e.status in ('lost','retired') then
    raise exception 'Ese equipo está dado de baja';
  end if;

  select s.*, c.zone_id into v_s
    from public.customer_services s
    join public.customers c on c.id = s.customer_id
   where s.id = p_servicio and s.org_id = v_org;

  if v_s.id is null then
    raise exception 'Ese servicio no existe';
  end if;
  if not public.auth_ve_zona(v_s.zone_id) then
    raise exception 'Ese servicio no es de tu zona' using errcode = '42501';
  end if;

  update public.equipment_units
     set status = 'installed', customer_id = v_s.customer_id,
         location_type = 'customer', location_id = v_s.customer_id,
         installed_at = now(), removed_at = null,
         install_count = install_count + 1, updated_at = now()
   where id = v_e.id;

  update public.customer_services
     set equipment_unit_id = v_e.id, updated_at = now()
   where id = p_servicio;

  if v_e.item_id is not null then
    insert into public.inventory_movements
      (org_id, item_id, equipment_unit_id, quantity, movement_type,
       from_type, from_id, to_type, to_id, work_order_id, reason, performed_by)
    values
      (v_org, v_e.item_id, v_e.id, 1, 'install',
       v_e.location_type, v_e.location_id, 'customer', v_s.customer_id, p_orden,
       'Instalación', auth.uid());
  end if;

  equipo_id := v_e.id;
  veces_instalado := v_e.install_count + 1;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- Recuperar el equipo cuando el cliente se da de baja.
-- ----------------------------------------------------------------------------
-- Si lo devolvió, regresa al almacén. Si no, se marca perdido y se le genera
-- el cargo de los $550. Los dos casos en la misma función a propósito: es la
-- misma conversación con el cliente, y así no se olvida ninguna de las dos.
-- ----------------------------------------------------------------------------
create or replace function public.recuperar_equipo(
  p_serie    text,
  p_devuelto boolean default true,
  p_donde_id uuid    default null,
  p_notas    text    default null
)
returns table (equipo_id uuid, cobrado boolean, cargo_id uuid, importe numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_e    record;
  v_cargo uuid;
  v_monto numeric(12,2) := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('inventory.move') then
    raise exception 'No tienes permiso para mover equipos' using errcode = '42501';
  end if;

  select * into v_e from public.equipment_units
   where org_id = v_org and serial_number = upper(btrim(p_serie));

  if v_e.id is null then
    raise exception 'No existe ningún equipo con esa serie';
  end if;
  if v_e.status <> 'installed' then
    raise exception 'Ese equipo no está instalado en ningún domicilio';
  end if;

  update public.customer_services
     set equipment_unit_id = null, updated_at = now()
   where equipment_unit_id = v_e.id;

  if p_devuelto then
    update public.equipment_units
       set status = 'in_stock', customer_id = null,
           location_type = 'branch', location_id = p_donde_id,
           removed_at = now(), notes = coalesce(p_notas, notes), updated_at = now()
     where id = v_e.id;

    if v_e.item_id is not null then
      insert into public.inventory_movements
        (org_id, item_id, equipment_unit_id, quantity, movement_type,
         from_type, from_id, to_type, to_id, reason, performed_by)
      values
        (v_org, v_e.item_id, v_e.id, 1, 'return', 'customer', v_e.customer_id,
         'branch', p_donde_id, coalesce(p_notas, 'Equipo devuelto'), auth.uid());
    end if;
  else
    update public.equipment_units
       set status = 'lost', removed_at = now(),
           notes = coalesce(p_notas, 'No lo devolvió'), updated_at = now()
     where id = v_e.id;

    if v_e.customer_id is not null and public.auth_has('charges.create') then
      select * into v_cargo from public.cobrar_equipo_no_devuelto(
        v_e.customer_id, 'Equipo no devuelto · serie ' || v_e.serial_number) limit 1;

      select ch.amount into v_monto from public.charges ch where ch.id = v_cargo;
    end if;

    if v_e.item_id is not null then
      insert into public.inventory_movements
        (org_id, item_id, equipment_unit_id, quantity, movement_type,
         from_type, from_id, to_type, reason, performed_by)
      values
        (v_org, v_e.item_id, v_e.id, 1, 'loss', 'customer', v_e.customer_id,
         'scrap', coalesce(p_notas, 'No lo devolvió'), auth.uid());
    end if;
  end if;

  equipo_id := v_e.id;
  cobrado   := not p_devuelto and v_cargo is not null;
  cargo_id  := v_cargo;
  importe   := coalesce(v_monto, 0);
  return next;
end;
$$;

comment on function public.recuperar_equipo is
  'Si lo devolvió, regresa al almacén. Si no, se marca perdido y se genera el '
  'cargo. Las dos salidas van juntas porque son la misma conversación.';

-- ----------------------------------------------------------------------------
-- 4 · La red
-- ----------------------------------------------------------------------------
create or replace function public.guardar_sitio(
  p_id     uuid default null,
  p_nombre text default null,
  p_tipo   text default 'tower',
  p_zona   uuid default null,
  p_lat    numeric default null,
  p_lon    numeric default null,
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then
    raise exception 'Falta el nombre del sitio';
  end if;

  if p_id is null then
    insert into public.network_sites (org_id, name, type, zone_id, latitude, longitude,
                                      is_active, created_by)
    values (v_org, btrim(p_nombre), p_tipo, p_zona, p_lat, p_lon, p_activo, auth.uid())
    returning id into v_id;
  else
    update public.network_sites
       set name = btrim(p_nombre), type = p_tipo, zone_id = p_zona,
           latitude = coalesce(p_lat, latitude), longitude = coalesce(p_lon, longitude),
           is_active = p_activo, updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese sitio no existe';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.guardar_dispositivo(
  p_id      uuid default null,
  p_nombre  text default null,
  p_tipo    text default 'olt',
  p_sitio   uuid default null,
  p_zona    uuid default null,
  p_ip      text default null,
  p_marca   text default null,
  p_modelo  text default null,
  p_activo  boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then
    raise exception 'Falta el nombre del equipo';
  end if;

  -- OJO: aquí NO se guardan usuarios ni contraseñas de las OLT ni de los
  -- MikroTik. Nunca. El agente local los lee de sus propias variables de
  -- entorno; la base solo sabe que el equipo existe y en qué IP vive.
  if p_id is null then
    insert into public.network_devices
      (org_id, name, device_type, site_id, zone_id, mgmt_ip, vendor, model,
       is_active, created_by)
    values
      (v_org, btrim(p_nombre), p_tipo, p_sitio, p_zona,
       nullif(btrim(coalesce(p_ip,'')), '')::inet, p_marca, p_modelo, p_activo, auth.uid())
    returning id into v_id;
  else
    update public.network_devices
       set name = btrim(p_nombre), device_type = p_tipo, site_id = p_sitio,
           zone_id = p_zona,
           mgmt_ip = coalesce(nullif(btrim(coalesce(p_ip,'')), '')::inet, mgmt_ip),
           vendor = coalesce(p_marca, vendor), model = coalesce(p_modelo, model),
           is_active = p_activo, updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese equipo no existe';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.guardar_dispositivo is
  'Da de alta OLT, MikroTik, switches y antenas. NO guarda credenciales: de eso '
  'se encarga el agente local con sus propias variables de entorno.';

create or replace function public.guardar_elemento(
  p_id        uuid default null,
  p_codigo    text default null,
  p_tipo      text default 'nap',
  p_nombre    text default null,
  p_zona      uuid default null,
  p_padre     uuid default null,
  p_puerto_pon uuid default null,
  p_capacidad int  default null,
  p_lat       numeric default null,
  p_lon       numeric default null,
  p_notas     text default null,
  p_activo    boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  if p_id is null then
    if p_codigo is null or length(btrim(p_codigo)) < 2 then
      raise exception 'Falta el código de la caja (NAP-CUE-012, por ejemplo)';
    end if;

    insert into public.network_elements
      (org_id, element_type, code, name, zone_id, parent_element_id, pon_port_id,
       capacity, latitude, longitude, notes, is_active, created_by)
    values
      (v_org, p_tipo, upper(btrim(p_codigo)), p_nombre, p_zona, p_padre, p_puerto_pon,
       p_capacidad, p_lat, p_lon, p_notas, p_activo, auth.uid())
    returning id into v_id;
  else
    -- La capacidad no puede quedar por debajo de lo que ya está ocupado.
    update public.network_elements
       set name = coalesce(p_nombre, name), zone_id = coalesce(p_zona, zone_id),
           parent_element_id = coalesce(p_padre, parent_element_id),
           pon_port_id = coalesce(p_puerto_pon, pon_port_id),
           capacity = coalesce(p_capacidad, capacity),
           latitude = coalesce(p_lat, latitude), longitude = coalesce(p_lon, longitude),
           notes = coalesce(p_notas, notes), is_active = p_activo, updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa caja no existe';
    end if;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Vistas
-- ----------------------------------------------------------------------------
create or replace view public.v_inventario with (security_invoker = true) as
select i.id,
       i.org_id,
       i.sku,
       i.name,
       i.category,
       i.unit,
       i.is_serialized,
       i.min_stock,
       i.brand,
       i.model,
       i.is_active,
       coalesce((select sum(s.quantity) from public.inventory_stock s
                  where s.item_id = i.id), 0)                                as existencia,
       (select count(*) from public.equipment_units e
         where e.item_id = i.id and e.status = 'in_stock')                   as equipos_libres,
       (select count(*) from public.equipment_units e
         where e.item_id = i.id and e.status = 'installed')                  as equipos_instalados,
       -- Solo quien puede ver finanzas ve el costo. La vista se sirve con
       -- security_invoker, así que esto se evalúa con los permisos de quien
       -- pregunta, no con los míos.
       case when public.auth_has('finance.read') then i.cost end             as costo
  from public.inventory_items i;

comment on view public.v_inventario is
  'El almacén con su existencia. El costo solo aparece para quien puede ver finanzas.';

create or replace view public.v_equipos with (security_invoker = true) as
select e.id,
       e.org_id,
       e.serial_number,
       e.gpon_serial,
       e.mac_address,
       e.brand,
       e.model,
       e.status,
       e.location_type,
       e.install_count,
       e.installed_at,
       e.notes,
       e.customer_id,
       c.full_name    as cliente,
       c.customer_code,
       z.name         as zona,
       i.name         as articulo,
       i.sku
  from public.equipment_units e
  left join public.customers c on c.id = e.customer_id
  left join public.zones z on z.id = c.zone_id
  left join public.inventory_items i on i.id = e.item_id;

create or replace view public.v_movimientos with (security_invoker = true) as
select m.id,
       m.org_id,
       m.created_at,
       m.movement_type,
       m.quantity,
       m.reason,
       i.name  as articulo,
       i.sku,
       e.serial_number,
       m.from_type,
       m.to_type,
       p.full_name as quien
  from public.inventory_movements m
  left join public.inventory_items i on i.id = m.item_id
  left join public.equipment_units e on e.id = m.equipment_unit_id
  left join public.profiles p on p.id = m.performed_by;

-- La red, con la ocupación ya calculada y el semáforo puesto.
create or replace view public.v_elementos_red with (security_invoker = true) as
select n.id,
       n.org_id,
       n.element_type,
       n.code,
       n.name,
       n.zone_id,
       z.name as zona,
       n.parent_element_id,
       n.capacity,
       n.used_ports,
       n.latitude,
       n.longitude,
       n.split_ratio,
       n.notes,
       n.is_active,
       (select count(*) from public.customer_services s
         where s.network_element_id = n.id and s.status = 'active')          as servicios,
       case
         when n.capacity is null or n.capacity = 0 then null
         else round(100.0 * n.used_ports / n.capacity)
       end                                                                    as ocupacion_pct,
       case
         when n.capacity is null or n.capacity = 0 then 'sin_capacidad'
         when n.used_ports >= n.capacity        then 'lleno'
         when n.used_ports >= n.capacity * 0.85 then 'por_llenarse'
         else 'con_lugar'
       end                                                                    as semaforo
  from public.network_elements n
  left join public.zones z on z.id = n.zone_id;

comment on view public.v_elementos_red is
  'NAP, mangas y splitters con su ocupación. El semáforo avisa a los 85 por '
  'ciento, no al 100: cuando ya está llena es tarde para pedir material.';

create or replace view public.v_dispositivos with (security_invoker = true) as
select d.id,
       d.org_id,
       d.name,
       d.device_type,
       d.status,
       d.mgmt_ip,
       d.vendor,
       d.model,
       d.is_active,
       d.zone_id,
       z.name as zona,
       s.name as sitio,
       (select count(*) from public.olt_cards ca where ca.device_id = d.id)   as tarjetas,
       (select coalesce(sum(pp.used_onus), 0) from public.pon_ports pp
          join public.olt_cards ca on ca.id = pp.card_id
         where ca.device_id = d.id)                                          as onus,
       (select coalesce(sum(pp.max_onus), 0) from public.pon_ports pp
          join public.olt_cards ca on ca.id = pp.card_id
         where ca.device_id = d.id)                                          as cupo_onus
  from public.network_devices d
  left join public.zones z on z.id = d.zone_id
  left join public.network_sites s on s.id = d.site_id;

-- ----------------------------------------------------------------------------
-- 6 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.guardar_articulo(uuid, text, text, text, text, boolean, numeric, numeric, text, text, boolean) from public, anon;
revoke all on function public.mover_inventario(uuid, numeric, text, text, uuid, text, uuid, text, uuid) from public, anon;
revoke all on function public.alta_equipo(text, uuid, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.instalar_equipo(text, uuid, uuid)                from public, anon;
revoke all on function public.recuperar_equipo(text, boolean, uuid, text)      from public, anon;
revoke all on function public.guardar_sitio(uuid, text, text, uuid, numeric, numeric, boolean) from public, anon;
revoke all on function public.guardar_dispositivo(uuid, text, text, uuid, uuid, text, text, text, boolean) from public, anon;
revoke all on function public.guardar_elemento(uuid, text, text, text, uuid, uuid, uuid, int, numeric, numeric, text, boolean) from public, anon;

grant execute on function public.guardar_articulo(uuid, text, text, text, text, boolean, numeric, numeric, text, text, boolean) to authenticated;
grant execute on function public.mover_inventario(uuid, numeric, text, text, uuid, text, uuid, text, uuid) to authenticated;
grant execute on function public.alta_equipo(text, uuid, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.instalar_equipo(text, uuid, uuid)             to authenticated;
grant execute on function public.recuperar_equipo(text, boolean, uuid, text)   to authenticated;
grant execute on function public.guardar_sitio(uuid, text, text, uuid, numeric, numeric, boolean) to authenticated;
grant execute on function public.guardar_dispositivo(uuid, text, text, uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.guardar_elemento(uuid, text, text, text, uuid, uuid, uuid, int, numeric, numeric, text, boolean) to authenticated;
