-- ============================================================================
-- 020 · Corte de caja, corte del día 11 y reconexión
-- ============================================================================
-- La 019 enseñó a la base a recibir dinero. Ésta le enseña las dos cosas que
-- pasan alrededor: entregar lo cobrado, y qué hacer con quien no pagó.
--
--   abrir_caja()           el cobrador arranca su día
--   cerrar_caja()          cuenta el efectivo y declara cuánto trae
--   entregar_caja()        se lo pasa a la oficina
--   verificar_caja()       la oficina lo cuenta y lo da por bueno
--
--   suspender_vencidos()   el corte del día 11
--   reconectar()           lo reactiva y le cobra los $30
--   cobrar_equipo()        los $550 cuando no devuelven el equipo
--
-- Igual que en la 019: viven en la base porque el SUNMI va a llamar las mismas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Abrir la caja del día
-- ----------------------------------------------------------------------------
-- Un cobrador solo puede tener una caja abierta a la vez. Si ya trae una, se
-- le devuelve esa misma en vez de abrirle otra: dos cajas abiertas al mismo
-- tiempo significan que al final del día el dinero no se sabe en cuál va.
-- ----------------------------------------------------------------------------
create or replace function public.abrir_caja(p_zone uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_yo   uuid := auth.uid();
  v_id   uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('payments.create') then
    raise exception 'No tienes permiso para abrir caja' using errcode = '42501';
  end if;

  select cs.id into v_id
    from public.cash_sessions cs
   where cs.collector_id = v_yo and cs.status = 'open'
   order by cs.opened_at desc limit 1;

  if v_id is not null then
    return v_id;
  end if;

  if p_zone is not null and not public.auth_cobra_zona(p_zone) then
    raise exception 'No cobras en esa zona' using errcode = '42501';
  end if;

  insert into public.cash_sessions (org_id, collector_id, zone_id)
  values (v_org, v_yo, p_zone)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.abrir_caja is
  'Arranca la caja del día. Si ya había una abierta, devuelve esa: nunca dos a la vez.';

-- ----------------------------------------------------------------------------
-- 2 · Cerrar la caja
-- ----------------------------------------------------------------------------
-- El cobrador cuenta el efectivo que trae y lo declara. La diferencia contra
-- lo esperado la calcula la base sola (columna generada en la 008), así que
-- no hay manera de "ajustarla" desde afuera.
--
-- Cerrar con diferencia NO se impide. Se registra. Un faltante honesto es
-- información; un sistema que no deja cerrar hasta que cuadre solo enseña a
-- la gente a mentir en el número.
-- ----------------------------------------------------------------------------
create or replace function public.cerrar_caja(
  p_session   uuid,
  p_declarado numeric,
  p_notas     text default null
)
returns table (
  esperado_efectivo numeric,
  declarado         numeric,
  diferencia        numeric,
  transferencias    numeric,
  pagos             int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_yo  uuid := auth.uid();
  v_c   record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if p_declarado is null or p_declarado < 0 then
    raise exception 'Hay que declarar cuánto efectivo traes, aunque sea cero';
  end if;

  select * into v_c from public.cash_sessions
   where id = p_session and org_id = v_org for update;

  if v_c.id is null then
    raise exception 'Esa caja no existe';
  end if;
  if v_c.status <> 'open' then
    raise exception 'Esa caja ya estaba cerrada';
  end if;
  -- El cobrador cierra la suya. El administrador puede cerrar la de cualquiera,
  -- porque a veces el cobrador se va sin cerrar y alguien tiene que hacerlo.
  if v_c.collector_id <> v_yo and not public.auth_has('cash.verify') then
    raise exception 'Esa caja no es tuya' using errcode = '42501';
  end if;

  update public.cash_sessions
     set declared_cash = p_declarado,
         closed_at     = now(),
         status        = 'closed',
         notes         = coalesce(p_notas, notes),
         updated_at    = now()
   where id = p_session;

  select cs.expected_cash, cs.declared_cash, cs.difference,
         cs.expected_transfer, cs.payment_count
    into esperado_efectivo, declarado, diferencia, transferencias, pagos
    from public.cash_sessions cs where cs.id = p_session;

  return next;
end;
$$;

comment on function public.cerrar_caja is
  'El cobrador declara el efectivo que trae. La diferencia la saca la base sola. '
  'Cerrar con faltante se permite y se registra: es información, no una falta que ocultar.';

-- ----------------------------------------------------------------------------
-- 3 · Entregar y verificar
-- ----------------------------------------------------------------------------
create or replace function public.entregar_caja(p_session uuid, p_a uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_yo  uuid := auth.uid();
  v_c   record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  select * into v_c from public.cash_sessions
   where id = p_session and org_id = v_org for update;

  if v_c.id is null then raise exception 'Esa caja no existe'; end if;
  if v_c.status <> 'closed' then
    raise exception 'Primero hay que cerrar la caja, luego entregarla';
  end if;
  if v_c.collector_id <> v_yo and not public.auth_has('cash.verify') then
    raise exception 'Esa caja no es tuya' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_a and p.org_id = v_org) then
    raise exception 'La persona a la que entregas no existe';
  end if;

  update public.cash_sessions
     set status = 'delivered', delivered_to = p_a, updated_at = now()
   where id = p_session;
end;
$$;

create or replace function public.verificar_caja(p_session uuid, p_notas text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_c   record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('cash.verify') then
    raise exception 'No tienes permiso para verificar entregas de caja' using errcode = '42501';
  end if;

  select * into v_c from public.cash_sessions
   where id = p_session and org_id = v_org for update;

  if v_c.id is null then raise exception 'Esa caja no existe'; end if;
  if v_c.status <> 'delivered' then
    raise exception 'Esa caja todavía no te la han entregado';
  end if;

  -- Quien entrega no puede ser quien verifica. Si lo fuera, el corte no
  -- comprobaría nada: sería la misma persona diciendo que su propio dinero
  -- está bien contado.
  if v_c.collector_id = auth.uid() then
    raise exception 'No puedes verificar tu propia caja' using errcode = '42501';
  end if;

  update public.cash_sessions
     set status = 'verified', verified_at = now(),
         notes = coalesce(p_notas, notes), updated_at = now()
   where id = p_session;
end;
$$;

comment on function public.verificar_caja is
  'La oficina da por buena la entrega. Nadie puede verificar su propia caja.';

-- ----------------------------------------------------------------------------
-- 4 · El corte del día 11
-- ----------------------------------------------------------------------------
-- Suspende a quien pasó la fecha de corte del periodo y sigue debiendo.
--
-- No corta a quien tiene saldo a favor sin aplicar: ése ya entregó su dinero
-- y cortarlo sería un error de la empresa, no del cliente.
--
-- `p_simular` en true no toca nada y solo dice a cuántos les tocaría. Antes de
-- cortarle la luz a 200 casas conviene ver la lista.
-- ----------------------------------------------------------------------------
create or replace function public.suspender_vencidos(
  p_period   uuid,
  p_simular  boolean default true
)
returns table (
  service_id     uuid,
  customer_code  text,
  cliente        text,
  zona           text,
  adeudo         numeric,
  suspendido     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_corte date;
  r       record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('services.suspend') then
    raise exception 'No tienes permiso para suspender servicios' using errcode = '42501';
  end if;

  select bp.cutoff_date into v_corte
    from public.billing_periods bp where bp.id = p_period and bp.org_id = v_org;

  if v_corte is null then
    raise exception 'El periodo no existe o no es de esta empresa';
  end if;
  if current_date < v_corte then
    raise exception 'Todavía no llega el día de corte de ese periodo (%). No se suspende antes.', v_corte;
  end if;

  for r in
    select s.id, c.customer_code, c.full_name, z.name as zona, c.id as cliente_id,
           sum(ch.balance) as debe
      from public.customer_services s
      join public.customers c on c.id = s.customer_id
      join public.zones     z on z.id = c.zone_id
      join public.charges  ch on ch.customer_id = c.id
     where s.org_id = v_org
       and s.status = 'active'
       and ch.status in ('pending','partial')
       and ch.balance > 0
       and ch.due_date < v_corte
       and public.auth_ve_zona(c.zone_id)
     group by s.id, c.customer_code, c.full_name, z.name, c.id
  loop
    -- ¿Trae dinero adelantado sin acomodar? Entonces no se corta.
    if exists (select 1 from public.v_saldo_a_favor v where v.customer_id = r.cliente_id) then
      continue;
    end if;

    service_id    := r.id;
    customer_code := r.customer_code;
    cliente       := r.full_name;
    zona          := r.zona;
    adeudo        := r.debe;
    suspendido    := not p_simular;

    if not p_simular then
      update public.customer_services
         set status = 'suspended', suspended_at = now(), updated_at = now()
       where id = r.id;

      update public.customers
         set status = 'suspended', updated_at = now()
       where id = r.cliente_id;

      insert into public.service_suspensions (org_id, service_id, reason, method, suspended_by)
      values (v_org, r.id, 'overdue', 'manual', auth.uid());
    end if;

    return next;
  end loop;
end;
$$;

comment on function public.suspender_vencidos is
  'El corte del día 11. Con p_simular en true solo enseña la lista, no corta. '
  'Nunca corta a quien tiene dinero adelantado sin aplicar.';

-- ----------------------------------------------------------------------------
-- 5 · Reconectar
-- ----------------------------------------------------------------------------
-- Reactiva el servicio y, si se pide, deja el cargo de reconexión. El monto
-- sale de `settings`, no está escrito aquí: hoy son $30, mañana los que sean.
-- ----------------------------------------------------------------------------
create or replace function public.reconectar(
  p_service uuid,
  p_cobrar  boolean default true
)
returns table (reconectado boolean, cargo_id uuid, importe numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_s      record;
  v_monto  numeric(12,2);
  v_cargo  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('services.suspend') then
    raise exception 'No tienes permiso para reactivar servicios' using errcode = '42501';
  end if;

  select s.*, c.zone_id, c.id as cliente_id
    into v_s
    from public.customer_services s
    join public.customers c on c.id = s.customer_id
   where s.id = p_service and s.org_id = v_org;

  if v_s.id is null then
    raise exception 'Ese servicio no existe';
  end if;
  if not public.auth_ve_zona(v_s.zone_id) then
    raise exception 'Ese servicio no es de tu zona' using errcode = '42501';
  end if;
  if v_s.status <> 'suspended' then
    raise exception 'Ese servicio no está suspendido';
  end if;

  if p_cobrar then
    if not public.auth_has('charges.create') then
      raise exception 'No tienes permiso para generar el cargo de reconexión' using errcode = '42501';
    end if;
    v_monto := public.ajuste_numero(v_org, 'billing.reconnection_fee', 30);

    if v_monto > 0 then
      insert into public.charges
        (org_id, customer_id, service_id, zone_id, type, description,
         amount, balance, due_date, created_by)
      values
        (v_org, v_s.cliente_id, p_service, v_s.zone_id, 'reconnection', 'Reconexión',
         v_monto, v_monto, current_date, auth.uid())
      returning id into v_cargo;
    end if;
  end if;

  update public.customer_services
     set status = 'active', suspended_at = null, updated_at = now()
   where id = p_service;

  update public.service_suspensions
     set reactivated_at = now(), reactivated_by = auth.uid(),
         reconnection_charge_id = v_cargo
   where service_id = p_service and reactivated_at is null;

  -- El cliente vuelve a activo solo si ya no le queda ningún servicio cortado.
  update public.customers
     set status = case
                    when exists (select 1 from public.charges ch
                                  where ch.customer_id = v_s.cliente_id
                                    and ch.status in ('pending','partial')
                                    and ch.balance > 0)
                    then 'overdue' else 'active'
                  end,
         updated_at = now()
   where id = v_s.cliente_id
     and not exists (select 1 from public.customer_services s2
                      where s2.customer_id = v_s.cliente_id
                        and s2.status = 'suspended');

  reconectado := true;
  cargo_id    := v_cargo;
  importe     := coalesce(v_monto, 0);
  return next;
end;
$$;

comment on function public.reconectar is
  'Reactiva el servicio y deja el cargo de reconexión. El monto sale de settings.';

-- ----------------------------------------------------------------------------
-- 6 · Equipo no devuelto
-- ----------------------------------------------------------------------------
-- Los $550 solo se cobran si el cliente NO regresó el equipo. No hay depósito
-- en garantía: es un cargo que aparece cuando pasa, no algo que se retiene.
-- ----------------------------------------------------------------------------
create or replace function public.cobrar_equipo_no_devuelto(
  p_customer uuid,
  p_nota     text default null
)
returns table (cargo_id uuid, importe numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_zona  uuid;
  v_monto numeric(12,2);
  v_id    uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('charges.create') then
    raise exception 'No tienes permiso para generar cargos' using errcode = '42501';
  end if;

  select c.zone_id into v_zona
    from public.customers c
   where c.id = p_customer and c.org_id = v_org and c.deleted_at is null;

  if v_zona is null then
    raise exception 'El cliente no existe o no es de esta empresa';
  end if;
  if not public.auth_ve_zona(v_zona) then
    raise exception 'Ese cliente no es de tu zona' using errcode = '42501';
  end if;

  v_monto := public.ajuste_numero(v_org, 'billing.equipment_loss_fee', 550);

  insert into public.charges
    (org_id, customer_id, zone_id, type, description, amount, balance, due_date, created_by)
  values
    (v_org, p_customer, v_zona, 'equipment_loss',
     coalesce(p_nota, 'Equipo no devuelto'), v_monto, v_monto, current_date, auth.uid())
  returning id into v_id;

  cargo_id := v_id;
  importe  := v_monto;
  return next;
end;
$$;

comment on function public.cobrar_equipo_no_devuelto is
  'Los $550 del equipo que no regresó. No hay depósito: es un cargo cuando pasa.';

-- ----------------------------------------------------------------------------
-- 7 · Quién puede llamar cada una
-- ----------------------------------------------------------------------------
revoke all on function public.abrir_caja(uuid)                        from public, anon;
revoke all on function public.cerrar_caja(uuid, numeric, text)        from public, anon;
revoke all on function public.entregar_caja(uuid, uuid)               from public, anon;
revoke all on function public.verificar_caja(uuid, text)              from public, anon;
revoke all on function public.suspender_vencidos(uuid, boolean)       from public, anon;
revoke all on function public.reconectar(uuid, boolean)               from public, anon;
revoke all on function public.cobrar_equipo_no_devuelto(uuid, text)   from public, anon;

grant execute on function public.abrir_caja(uuid)                      to authenticated;
grant execute on function public.cerrar_caja(uuid, numeric, text)      to authenticated;
grant execute on function public.entregar_caja(uuid, uuid)             to authenticated;
grant execute on function public.verificar_caja(uuid, text)            to authenticated;
grant execute on function public.suspender_vencidos(uuid, boolean)     to authenticated;
grant execute on function public.reconectar(uuid, boolean)             to authenticated;
grant execute on function public.cobrar_equipo_no_devuelto(uuid, text) to authenticated;
