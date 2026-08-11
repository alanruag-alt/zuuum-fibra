-- ============================================================================
-- 044 · Las dos puertas que el recado prometía
--
-- Al querer borrar la OLT «huawei ma 5800» la base contestó:
--
--   «tiene 1 tarjetas capturadas con sus puertos. Si ya no está en servicio,
--    márcalo como "ya no se usa".»
--
-- Ese botón nunca existió. Y tampoco había forma de quitarle la tarjeta. O
-- sea: el recado mandaba a dos salidas y ninguna de las dos estaba abierta.
--
-- Es exactamente el mismo error que se lleva arreglando desde la 042 —el
-- sistema decide con cosas que quien lo usa no puede tocar— nada más que
-- ahora del lado del recado: si un mensaje dice «haz esto», ese «esto» tiene
-- que existir y hay que decir dónde está.
--
-- Se abren las dos:
--   1. Marcar un equipo o un elemento como que ya no se usa, sin borrarlo.
--   2. Quitarle una tarjeta a la OLT, con sus puertos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Ya no se usa
-- ----------------------------------------------------------------------------
/*
 * Dar de baja no es borrar, y esa es la gracia: la OLT que se cambió el año
 * pasado tiene que seguir existiendo para que la historia de los clientes que
 * colgaban de ella siga teniendo sentido. Lo que cambia es que deja de
 * aparecer en las listas de todos los días.
 *
 * Se niega si todavía hay gente colgando: dar de baja algo que está dando
 * servicio no arregla nada, nada más lo esconde.
 */
create or replace function public.ya_no_se_usa(
  p_id     uuid,
  p_que    text default 'equipo',
  p_activo boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_nom text;
  v_n   int := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  if p_que = 'equipo' then
    select d.name into v_nom from public.network_devices d
     where d.id = p_id and d.org_id = v_org;
    if v_nom is null then
      raise exception 'Ese equipo no existe';
    end if;

    if not p_activo then
      select count(*) into v_n
        from public.customer_services s where s.parent_device_id = p_id
         and s.status not in ('cancelled', 'cancelado');
      if v_n > 0 then
        raise exception
          'No se puede dar de baja %: todavía hay % servicios colgando de ahí. Pásalos a otro equipo primero; darlo de baja no los desconecta, solo los esconde.',
          v_nom, v_n;
      end if;

      select count(*) into v_n
        from public.odf_ports op
        join public.pon_ports pp on pp.id = op.pon_port_id
        join public.olt_cards c on c.id = pp.card_id
       where c.device_id = p_id;
      if v_n > 0 then
        raise exception
          'No se puede dar de baja %: tiene % puertos PON todavía patcheados al ODF. Quita esos latiguillos primero.',
          v_nom, v_n;
      end if;
    end if;

    update public.network_devices
       set is_active = p_activo, updated_at = now()
     where id = p_id and org_id = v_org;
  else
    select e.code into v_nom from public.network_elements e
     where e.id = p_id and e.org_id = v_org;
    if v_nom is null then
      raise exception 'Ese elemento no existe';
    end if;

    if not p_activo then
      select count(*) into v_n
        from public.nap_ports np where np.element_id = p_id and np.service_id is not null;
      if v_n > 0 then
        raise exception
          'No se puede dar de baja %: todavía hay % clientes conectados ahí.',
          v_nom, v_n;
      end if;
    end if;

    update public.network_elements
       set is_active = p_activo, updated_at = now()
     where id = p_id and org_id = v_org;
  end if;

  return case when p_activo
    then format('%s vuelve a estar en servicio.', v_nom)
    else format('%s quedó marcado como que ya no se usa. Sigue existiendo, con toda su historia; nada más deja de salir en las listas del día a día.', v_nom)
  end;
end;
$$;

comment on function public.ya_no_se_usa is
  'Da de baja un equipo o un elemento sin borrarlo. La historia de los clientes '
  'que colgaban de ahí sigue teniendo sentido.';

-- ----------------------------------------------------------------------------
-- 2 · Quitarle una tarjeta a la OLT
-- ----------------------------------------------------------------------------
/*
 * La otra puerta. Una tarjeta se cambia, se quema, o se capturó de más; hasta
 * ahora se podía abrir pero nunca quitar, así que una OLT capturada por error
 * se quedaba para siempre.
 *
 * Se niega si alguno de sus puertos PON sigue patcheado al ODF, y los nombra:
 * quitar la tarjeta con el latiguillo puesto deja el puerto del ODF apuntando
 * a algo que ya no existe.
 */
create or replace function public.eliminar_tarjeta(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_t   record;
  v_n   int;
  v_q   text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select c.id, c.slot_number, d.name as olt into v_t
    from public.olt_cards c
    join public.network_devices d on d.id = c.device_id
   where c.id = p_id and c.org_id = v_org;

  if v_t.id is null then
    raise exception 'Esa tarjeta no existe';
  end if;

  select count(*) into v_n
    from public.pon_ports pp
    join public.odf_ports op on op.pon_port_id = pp.id
   where pp.card_id = p_id;

  if v_n > 0 then
    select string_agg(
             format('el PON %s/%s va a %s bandeja %s puerto %s',
                    v_t.slot_number, pp.port_number, e.code, op.tray_number, op.port_number),
             ', ' order by pp.port_number)
      into v_q
      from public.pon_ports pp
      join public.odf_ports op on op.pon_port_id = pp.id
      join public.network_elements e on e.id = op.odf_id
     where pp.card_id = p_id;

    raise exception
      'No se puede quitar la tarjeta del slot % de %: todavía %. Quita esos latiguillos primero, con el botón «vaciar» del renglón de ese puerto.',
      v_t.slot_number, v_t.olt, v_q;
  end if;

  select count(*) into v_n
    from public.customer_services s
    join public.pon_ports pp on pp.id = s.pon_port_id
   where pp.card_id = p_id;

  if v_n > 0 then
    raise exception
      'No se puede quitar la tarjeta del slot % de %: hay % servicios colgados de sus puertos PON.',
      v_t.slot_number, v_t.olt, v_n;
  end if;

  delete from public.pon_ports where card_id = p_id;
  delete from public.olt_cards where id = p_id and org_id = v_org;

  return format('Se quitó la tarjeta del slot %s de %s, con sus puertos.',
                v_t.slot_number, v_t.olt);
end;
$$;

comment on function public.eliminar_tarjeta is
  'Quita una tarjeta de la OLT con sus puertos PON. Se niega si alguno sigue patcheado.';

-- ----------------------------------------------------------------------------
-- 3 · Y que el recado diga dónde están esas puertas
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
  v_slots     text;
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

  select count(*) into v_servicios
    from public.customer_services s where s.parent_device_id = p_id;

  if v_tarjetas > 0 then
    select string_agg('slot ' || c.slot_number::text, ', ' order by c.slot_number)
      into v_slots
      from public.olt_cards c where c.device_id = p_id;

    raise exception
      'No se puede borrar %: todavía tiene su tarjeta de %. Tienes dos salidas, las dos en la pestaña de la caseta: quítale la tarjeta con el botón «quitar» que trae al lado, o —si el equipo existió de verdad y ya se retiró— márcalo como «ya no se usa» para no perder la historia de los clientes que colgaban de ahí.',
      v_nombre, v_slots;
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

comment on function public.eliminar_dispositivo is
  'Borra un equipo sin nada colgando. Si algo lo detiene, dice cuál es la salida '
  'y dónde está el botón: un recado que manda a una puerta cerrada no sirve.';

-- ----------------------------------------------------------------------------
-- 4 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.ya_no_se_usa(uuid, text, boolean) from public, anon;
revoke all on function public.eliminar_tarjeta(uuid)            from public, anon;

grant execute on function public.ya_no_se_usa(uuid, text, boolean) to authenticated;
grant execute on function public.eliminar_tarjeta(uuid)            to authenticated;
