-- ============================================================================
-- 023 · Operación de campo: prospectos, órdenes y tickets
-- ============================================================================
-- El camino completo de un cliente nuevo:
--
--   prospecto → orden de instalación → técnico en el domicilio →
--   evidencia (foto + potencia + firma) → servicio activo → primer cargo
--
--   guardar_prospecto()     alta y seguimiento
--   convertir_prospecto()   lo vuelve cliente con su servicio y su orden
--   crear_orden()           orden suelta (reparación, cambio de domicilio…)
--   asignar_orden()         a uno o varios técnicos
--   iniciar_orden()         el técnico llegó
--   cerrar_orden()          y si es instalación, activa el servicio
--   abrir_ticket()          reporte de falla
--   atender_ticket()        asignar, comentar, resolver, cerrar
--
-- El disparador de la 012 sigue mandando: una instalación no se cierra sin
-- foto, sin potencia medida y sin firma. Eso no se toca desde aquí.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Prospectos
-- ----------------------------------------------------------------------------
create or replace function public.guardar_prospecto(
  p_id       uuid    default null,
  p_nombre   text    default null,
  p_telefono text    default null,
  p_zona     uuid    default null,
  p_email    text    default null,
  p_domicilio text   default null,
  p_plan     uuid    default null,
  p_cobertura text   default 'unknown',
  p_estado   text    default 'new',
  p_motivo   text    default null,
  p_notas    text    default null,
  p_lat      numeric default null,
  p_lon      numeric default null
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
  if not public.auth_has('prospects.write') then
    raise exception 'No tienes permiso para editar prospectos' using errcode = '42501';
  end if;

  if p_id is null then
    if p_nombre is null or length(btrim(p_nombre)) < 3 then
      raise exception 'Falta el nombre';
    end if;
    if p_telefono is null or length(btrim(p_telefono)) < 7 then
      raise exception 'Falta el teléfono. Sin teléfono un prospecto no sirve de nada.';
    end if;
    if p_zona is null then
      raise exception 'Falta la zona';
    end if;
    if not public.auth_ve_zona(p_zona) then
      raise exception 'Esa zona no es tuya' using errcode = '42501';
    end if;

    insert into public.prospects
      (org_id, full_name, phone, email, zone_id, address_text, interested_plan_id,
       coverage_status, status, notes, latitude, longitude, created_by)
    values
      (v_org, btrim(p_nombre), btrim(p_telefono), lower(nullif(btrim(p_email),'')), p_zona,
       p_domicilio, p_plan, p_cobertura, p_estado, p_notas, p_lat, p_lon, auth.uid())
    returning id into v_id;
  else
    update public.prospects
       set full_name          = coalesce(nullif(btrim(p_nombre),''), full_name),
           phone              = coalesce(nullif(btrim(p_telefono),''), phone),
           email              = coalesce(lower(nullif(btrim(p_email),'')), email),
           address_text       = coalesce(p_domicilio, address_text),
           interested_plan_id = coalesce(p_plan, interested_plan_id),
           coverage_status    = coalesce(p_cobertura, coverage_status),
           status             = coalesce(p_estado, status),
           lost_reason        = case when p_estado = 'lost' then p_motivo else null end,
           notes              = coalesce(p_notas, notes),
           latitude           = coalesce(p_lat, latitude),
           longitude          = coalesce(p_lon, longitude),
           updated_at         = now(),
           updated_by         = auth.uid()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese prospecto no existe';
    end if;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2 · Convertir un prospecto en cliente
-- ----------------------------------------------------------------------------
-- Un solo movimiento: cliente + domicilio + servicio pendiente + orden de
-- instalación. Si algo falla a medias no queda nada — es una transacción.
--
-- El servicio nace en 'pending', NO en 'active': todavía no hay nadie
-- conectado. Se activa cuando el técnico cierra la orden con su evidencia.
-- Así nunca se le cobra a alguien que aún no tiene servicio.
-- ----------------------------------------------------------------------------
create or replace function public.convertir_prospecto(
  p_prospecto uuid,
  p_plan      uuid,
  p_precio    numeric default null,
  p_red       text    default 'ftth',
  p_agendar   timestamptz default null
)
returns table (customer_id uuid, customer_code text, service_id uuid, order_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_p    record;
  v_cli  uuid;
  v_dir  uuid;
  v_srv  uuid;
  v_ord  uuid;
  v_folio text;
  v_fcli  text;
  v_intento int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('customers.write') then
    raise exception 'No tienes permiso para dar de alta clientes' using errcode = '42501';
  end if;

  select * into v_p from public.prospects where id = p_prospecto and org_id = v_org;

  if v_p.id is null then
    raise exception 'Ese prospecto no existe';
  end if;
  if v_p.status = 'converted' then
    raise exception 'Ese prospecto ya se había convertido en cliente';
  end if;
  if not public.auth_ve_zona(v_p.zone_id) then
    raise exception 'Ese prospecto no es de tu zona' using errcode = '42501';
  end if;
  if not exists (select 1 from public.service_plans sp
                  where sp.id = p_plan and sp.org_id = v_org and sp.is_active) then
    raise exception 'Ese plan no existe o está inactivo';
  end if;

  -- El contador de folios y la realidad pueden estar desfasados: el padrón de
  -- 2026 se cargó desde los Excel con sus códigos ya puestos, no pidiéndolos
  -- uno por uno. Si el contador va atrás, se le pide el siguiente hasta dar
  -- con uno libre en vez de reventar con "clave duplicada".
  for v_intento in 1..50 loop
    v_fcli := public.siguiente_folio(v_org, v_p.zone_id, 'customer');
    exit when not exists (select 1 from public.customers c
                           where c.org_id = v_org and c.customer_code = v_fcli);
    if v_intento = 50 then
      raise exception 'No se encontró un folio libre para esa zona. Revisa folio_counters.';
    end if;
  end loop;

  insert into public.customers
    (org_id, customer_code, full_name, phone, email, zone_id, status, notes, created_by)
  values
    (v_org, v_fcli, v_p.full_name, v_p.phone, v_p.email, v_p.zone_id, 'active',
     v_p.notes, auth.uid())
  returning id into v_cli;

  if v_p.address_text is not null or v_p.latitude is not null then
    insert into public.addresses
      (org_id, customer_id, type, reference, latitude, longitude, created_by)
    values
      (v_org, v_cli, 'installation', v_p.address_text, v_p.latitude, v_p.longitude, auth.uid())
    returning id into v_dir;
  end if;

  insert into public.customer_services
    (org_id, customer_id, plan_id, custom_price, address_id, network_type, status, created_by)
  values
    (v_org, v_cli, p_plan, p_precio, v_dir, p_red, 'pending', auth.uid())
  returning id into v_srv;

  v_folio := public.siguiente_folio(v_org, v_p.zone_id, 'order');

  insert into public.work_orders
    (org_id, order_number, type, customer_id, service_id, zone_id, status,
     scheduled_for, description, created_by)
  values
    (v_org, v_folio, 'installation', v_cli, v_srv, v_p.zone_id,
     case when p_agendar is null then 'draft' else 'scheduled' end,
     p_agendar, 'Instalación nueva · viene del prospecto ' || v_p.full_name, auth.uid())
  returning id into v_ord;

  update public.prospects
     set status = 'converted', converted_customer_id = v_cli,
         updated_at = now(), updated_by = auth.uid()
   where id = p_prospecto;

  customer_id   := v_cli;
  customer_code := v_fcli;
  service_id    := v_srv;
  order_number  := v_folio;
  return next;
end;
$$;

comment on function public.convertir_prospecto is
  'Prospecto → cliente + servicio pendiente + orden de instalación, de un solo '
  'movimiento. El servicio nace pendiente: se activa cuando el técnico cierra.';

-- ----------------------------------------------------------------------------
-- 3 · Órdenes de trabajo
-- ----------------------------------------------------------------------------
create or replace function public.crear_orden(
  p_tipo      text,
  p_cliente   uuid,
  p_servicio  uuid    default null,
  p_agendar   timestamptz default null,
  p_prioridad text    default 'normal',
  p_notas     text    default null,
  p_ticket    uuid    default null
)
returns table (id uuid, order_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_zona uuid;
  v_folio text;
  v_id   uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('orders.write') then
    raise exception 'No tienes permiso para crear órdenes' using errcode = '42501';
  end if;
  if p_tipo not in ('installation','relocation','removal','maintenance','repair') then
    raise exception 'Ese tipo de orden no existe';
  end if;

  select c.zone_id into v_zona from public.customers c
   where c.id = p_cliente and c.org_id = v_org and c.deleted_at is null;

  if v_zona is null then
    raise exception 'El cliente no existe';
  end if;
  if not public.auth_ve_zona(v_zona) then
    raise exception 'Ese cliente no es de tu zona' using errcode = '42501';
  end if;

  v_folio := public.siguiente_folio(v_org, v_zona, 'order');

  insert into public.work_orders
    (org_id, order_number, type, customer_id, service_id, ticket_id, zone_id,
     status, priority, scheduled_for, description, created_by)
  values
    (v_org, v_folio, p_tipo, p_cliente, p_servicio, p_ticket, v_zona,
     case when p_agendar is null then 'draft' else 'scheduled' end,
     p_prioridad, p_agendar, p_notas, auth.uid())
  returning work_orders.id into v_id;

  id := v_id;
  order_number := v_folio;
  return next;
end;
$$;

create or replace function public.asignar_orden(
  p_orden    uuid,
  p_tecnicos uuid[],
  p_agendar  timestamptz default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_o   record;
  t     uuid;
  n     int := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('orders.assign') then
    raise exception 'No tienes permiso para asignar órdenes' using errcode = '42501';
  end if;

  select * into v_o from public.work_orders where id = p_orden and org_id = v_org;
  if v_o.id is null then
    raise exception 'Esa orden no existe';
  end if;
  if v_o.status in ('completed','cancelled') then
    raise exception 'Esa orden ya está cerrada';
  end if;

  delete from public.work_order_assignments where work_order_id = p_orden;

  foreach t in array coalesce(p_tecnicos, '{}') loop
    if not exists (select 1 from public.profiles p
                    where p.id = t and p.org_id = v_org and p.is_active) then
      raise exception 'Uno de los técnicos no existe o está desactivado';
    end if;

    insert into public.work_order_assignments (org_id, work_order_id, technician_id, role)
    values (v_org, p_orden, t, case when n = 0 then 'lead' else 'helper' end);
    n := n + 1;
  end loop;

  update public.work_orders
     set scheduled_for = coalesce(p_agendar, scheduled_for),
         status = case
                    when n > 0 and status = 'draft' then 'scheduled'
                    when n = 0 and status = 'scheduled' then 'draft'
                    else status
                  end,
         updated_at = now(), updated_by = auth.uid()
   where id = p_orden;

  return n;
end;
$$;

comment on function public.asignar_orden is
  'Asigna la orden. El primero de la lista queda como responsable; los demás '
  'como ayudantes. Asignar a nadie la regresa a borrador.';

-- ----------------------------------------------------------------------------
-- El técnico llegó.
-- ----------------------------------------------------------------------------
create or replace function public.iniciar_orden(p_orden uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_o   record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  select * into v_o from public.work_orders where id = p_orden and org_id = v_org;
  if v_o.id is null then
    raise exception 'Esa orden no existe';
  end if;
  if v_o.status <> 'scheduled' then
    raise exception 'Esa orden no está agendada';
  end if;

  -- La empieza quien la trae asignada. La oficina también puede, porque a
  -- veces el técnico llega sin señal y alguien la abre por él.
  if not public.auth_orden_propia(p_orden) and not public.auth_has('orders.assign') then
    raise exception 'Esa orden no es tuya' using errcode = '42501';
  end if;

  update public.work_orders
     set status = 'in_progress', started_at = coalesce(started_at, now()),
         updated_at = now(), updated_by = auth.uid()
   where id = p_orden;
end;
$$;

-- ----------------------------------------------------------------------------
-- Cerrar la orden.
-- ----------------------------------------------------------------------------
-- Si es instalación, además activa el servicio. Ése es el momento exacto en
-- que el cliente empieza a existir para la cobranza: ni antes, cuando todavía
-- no tenía nada, ni después, cuando ya llevaría días conectado gratis.
-- ----------------------------------------------------------------------------
create or replace function public.cerrar_orden(
  p_orden uuid,
  p_notas text default null
)
returns table (cerrada boolean, servicio_activado boolean, mensaje text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_o   record;
  v_act boolean := false;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  select * into v_o from public.work_orders where id = p_orden and org_id = v_org;
  if v_o.id is null then
    raise exception 'Esa orden no existe';
  end if;
  if v_o.status = 'completed' then
    raise exception 'Esa orden ya estaba cerrada';
  end if;
  if v_o.status = 'cancelled' then
    raise exception 'Esa orden está cancelada';
  end if;
  if not public.auth_orden_propia(p_orden) and not public.auth_has('orders.assign') then
    raise exception 'Esa orden no es tuya' using errcode = '42501';
  end if;

  -- El disparador de la 012 revisa foto, potencia y firma. Si falta algo,
  -- este update truena solo y con un mensaje que se entiende.
  update public.work_orders
     set status = 'completed',
         resolution_notes = coalesce(p_notas, resolution_notes),
         updated_at = now(), updated_by = auth.uid()
   where id = p_orden;

  if v_o.type = 'installation' and v_o.service_id is not null then
    update public.customer_services
       set status = 'active', activated_at = coalesce(activated_at, now()), updated_at = now()
     where id = v_o.service_id and status = 'pending';

    v_act := found;
  end if;

  cerrada           := true;
  servicio_activado := v_act;
  mensaje := case
    when v_act then 'Orden cerrada y servicio activado. Ya entra en la cobranza del próximo mes.'
    else 'Orden cerrada.'
  end;
  return next;
end;
$$;

comment on function public.cerrar_orden is
  'Cierra la orden y, si es instalación, activa el servicio. El disparador de '
  'la 012 sigue exigiendo foto, potencia y firma antes de dejar cerrar.';

create or replace function public.cancelar_orden(p_orden uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('orders.write') then
    raise exception 'No tienes permiso para cancelar órdenes' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'Hay que escribir por qué se cancela';
  end if;

  update public.work_orders
     set status = 'cancelled',
         resolution_notes = 'Cancelada: ' || btrim(p_motivo),
         updated_at = now(), updated_by = auth.uid()
   where id = p_orden and org_id = v_org and status <> 'completed';

  if not found then
    raise exception 'Esa orden no existe o ya estaba cerrada';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4 · Tickets
-- ----------------------------------------------------------------------------
create or replace function public.abrir_ticket(
  p_cliente    uuid,
  p_categoria  text,
  p_asunto     text,
  p_detalle    text default null,
  p_prioridad  text default 'normal',
  p_servicio   uuid default null
)
returns table (id uuid, ticket_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_zona uuid;
  v_folio text;
  v_id   uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('tickets.write') then
    raise exception 'No tienes permiso para abrir tickets' using errcode = '42501';
  end if;
  if p_categoria not in ('no_service','slow','intermittent','equipment','billing','other') then
    raise exception 'Esa categoría no existe';
  end if;
  if p_asunto is null or length(btrim(p_asunto)) < 4 then
    raise exception 'Falta el asunto';
  end if;

  select c.zone_id into v_zona from public.customers c
   where c.id = p_cliente and c.org_id = v_org and c.deleted_at is null;

  if v_zona is null then
    raise exception 'El cliente no existe';
  end if;

  v_folio := public.siguiente_folio(v_org, v_zona, 'ticket');

  insert into public.tickets
    (org_id, ticket_number, customer_id, service_id, zone_id, category,
     priority, subject, description, created_by)
  values
    (v_org, v_folio, p_cliente, p_servicio, v_zona, p_categoria,
     p_prioridad, btrim(p_asunto), p_detalle, auth.uid())
  returning tickets.id into v_id;

  id := v_id;
  ticket_number := v_folio;
  return next;
end;
$$;

create or replace function public.atender_ticket(
  p_ticket    uuid,
  p_estado    text    default null,
  p_asignar   uuid    default null,
  p_causa     text    default null,
  p_comentario text   default null,
  p_interno   boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_t   record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('tickets.write') then
    raise exception 'No tienes permiso para atender tickets' using errcode = '42501';
  end if;

  select * into v_t from public.tickets where id = p_ticket and org_id = v_org;
  if v_t.id is null then
    raise exception 'Ese ticket no existe';
  end if;
  if v_t.status = 'closed' then
    raise exception 'Ese ticket ya está cerrado';
  end if;

  -- Cerrar sin decir qué pasó deja el historial inservible: al tercer reporte
  -- del mismo poste nadie puede saber que es el mismo poste.
  if p_estado in ('resolved','closed') and coalesce(p_causa, v_t.root_cause) is null then
    raise exception 'Para resolver un ticket hay que decir cuál fue la causa';
  end if;

  update public.tickets
     set status      = coalesce(p_estado, status),
         assigned_to = coalesce(p_asignar, assigned_to),
         root_cause  = coalesce(p_causa, root_cause),
         resolved_at = case when p_estado = 'resolved' then coalesce(resolved_at, now())
                            else resolved_at end,
         closed_at   = case when p_estado = 'closed' then coalesce(closed_at, now())
                            else closed_at end,
         updated_at  = now()
   where id = p_ticket;

  if p_comentario is not null and length(btrim(p_comentario)) > 0 then
    insert into public.ticket_comments (org_id, ticket_id, author_id, body, is_internal)
    values (v_org, p_ticket, auth.uid(), btrim(p_comentario), p_interno);
  end if;
end;
$$;

comment on function public.atender_ticket is
  'Asigna, comenta, resuelve o cierra. Resolver sin decir la causa se rechaza: '
  'sin eso, al tercer reporte del mismo poste nadie sabe que es el mismo poste.';

-- ----------------------------------------------------------------------------
-- 5 · Vistas
-- ----------------------------------------------------------------------------
create or replace view public.v_ordenes with (security_invoker = true) as
select o.id,
       o.org_id,
       o.order_number,
       o.type,
       o.status,
       o.priority,
       o.scheduled_for,
       o.started_at,
       o.completed_at,
       o.description,
       o.zone_id,
       z.name as zona,
       o.customer_id,
       c.full_name    as cliente,
       c.customer_code,
       c.phone        as telefono,
       o.service_id,
       (select string_agg(p.full_name, ', ' order by a.role, p.full_name)
          from public.work_order_assignments a
          join public.profiles p on p.id = a.technician_id
         where a.work_order_id = o.id)                                  as tecnicos,
       (select count(*) from public.work_order_photos f where f.work_order_id = o.id)     as fotos,
       (select count(*) from public.installation_readings r where r.work_order_id = o.id) as lecturas,
       (select count(*) from public.customer_signatures s where s.work_order_id = o.id)   as firmas,
       o.created_at
  from public.work_orders o
  join public.zones z on z.id = o.zone_id
  left join public.customers c on c.id = o.customer_id;

comment on view public.v_ordenes is
  'Las órdenes con su cliente, su zona, sus técnicos y cuánta evidencia llevan.';

create or replace view public.v_tickets with (security_invoker = true) as
select t.id,
       t.org_id,
       t.ticket_number,
       t.category,
       t.priority,
       t.status,
       t.subject,
       t.description,
       t.root_cause,
       t.opened_at,
       t.resolved_at,
       t.closed_at,
       t.zone_id,
       z.name as zona,
       t.customer_id,
       c.full_name    as cliente,
       c.customer_code,
       c.phone        as telefono,
       t.assigned_to,
       p.full_name    as atiende,
       (select count(*) from public.ticket_comments tc where tc.ticket_id = t.id) as comentarios,
       (extract(epoch from (coalesce(t.resolved_at, now()) - t.opened_at)) / 3600)::int as horas_abierto
  from public.tickets t
  join public.zones z on z.id = t.zone_id
  left join public.customers c on c.id = t.customer_id
  left join public.profiles p on p.id = t.assigned_to;

create or replace view public.v_prospectos with (security_invoker = true) as
select pr.id,
       pr.org_id,
       pr.full_name,
       pr.phone,
       pr.email,
       pr.zone_id,
       z.name as zona,
       pr.address_text,
       pr.coverage_status,
       pr.status,
       pr.lost_reason,
       pr.notes,
       pr.converted_customer_id,
       pr.created_at,
       sp.name  as plan_interes,
       sp.price as precio_interes,
       (current_date - pr.created_at::date) as dias_desde_alta
  from public.prospects pr
  join public.zones z on z.id = pr.zone_id
  left join public.service_plans sp on sp.id = pr.interested_plan_id;

-- ----------------------------------------------------------------------------
-- 6 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.guardar_prospecto(uuid, text, text, uuid, text, text, uuid, text, text, text, text, numeric, numeric) from public, anon;
revoke all on function public.convertir_prospecto(uuid, uuid, numeric, text, timestamptz) from public, anon;
revoke all on function public.crear_orden(text, uuid, uuid, timestamptz, text, text, uuid)  from public, anon;
revoke all on function public.asignar_orden(uuid, uuid[], timestamptz)                      from public, anon;
revoke all on function public.iniciar_orden(uuid)                                           from public, anon;
revoke all on function public.cerrar_orden(uuid, text)                                      from public, anon;
revoke all on function public.cancelar_orden(uuid, text)                                    from public, anon;
revoke all on function public.abrir_ticket(uuid, text, text, text, text, uuid)              from public, anon;
revoke all on function public.atender_ticket(uuid, text, uuid, text, text, boolean)         from public, anon;

grant execute on function public.guardar_prospecto(uuid, text, text, uuid, text, text, uuid, text, text, text, text, numeric, numeric) to authenticated;
grant execute on function public.convertir_prospecto(uuid, uuid, numeric, text, timestamptz) to authenticated;
grant execute on function public.crear_orden(text, uuid, uuid, timestamptz, text, text, uuid)  to authenticated;
grant execute on function public.asignar_orden(uuid, uuid[], timestamptz)                      to authenticated;
grant execute on function public.iniciar_orden(uuid)                                           to authenticated;
grant execute on function public.cerrar_orden(uuid, text)                                      to authenticated;
grant execute on function public.cancelar_orden(uuid, text)                                    to authenticated;
grant execute on function public.abrir_ticket(uuid, text, text, text, text, uuid)              to authenticated;
grant execute on function public.atender_ticket(uuid, text, uuid, text, text, boolean)         to authenticated;
