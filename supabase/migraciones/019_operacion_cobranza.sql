-- ============================================================================
-- 019 · Operación de cobranza: abrir el periodo, generar cargos, cobrar
-- ============================================================================
-- Hasta aquí la base sabía *guardar* cobranza. Con esto sabe *hacerla*.
--
-- Cuatro operaciones, y todas viven en la base a propósito:
--
--   abrir_periodo()             crea el mes con sus fechas del 5, 10 y 11
--   generar_cargos_mensuales()  pone la mensualidad a cada servicio activo
--   registrar_pago()            recibe el dinero, saca folio y aplica a lo viejo
--   cancelar_pago()             lo deshace dejando rastro, solo el administrador
--
-- Están en la base y no en el panel porque el SUNMI del cobrador va a llamar
-- exactamente las mismas. Si la regla viviera en el código del panel, el
-- teléfono podría cobrar distinto que la oficina. Aquí no puede.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Abrir el periodo del mes
-- ----------------------------------------------------------------------------
-- Las fechas salen de `settings`, no están escritas aquí. El día que ZUUUM
-- decida cortar el 15 en vez del 11, se cambia el ajuste y ya.
-- ----------------------------------------------------------------------------
create or replace function public.abrir_periodo(p_year int, p_month int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid := public.auth_org_id();
  v_id      uuid;
  v_primero date;
  v_vence   date;
  v_gracia  date;
  v_corte   date;
  v_meses   constant text[] := array['enero','febrero','marzo','abril','mayo','junio',
                                     'julio','agosto','septiembre','octubre','noviembre','diciembre'];
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('charges.create') then
    raise exception 'No tienes permiso para abrir periodos' using errcode = '42501';
  end if;

  v_primero := make_date(p_year, p_month, 1);
  v_vence   := v_primero + (public.ajuste_numero(v_org, 'billing.due_day',    5)::int - 1);
  v_gracia  := v_vence   +  public.ajuste_numero(v_org, 'billing.grace_days', 5)::int;
  v_corte   := v_primero + (public.ajuste_numero(v_org, 'billing.cutoff_day', 11)::int - 1);

  -- Si el corte quedara antes de la gracia, se recorre un día. La restricción
  -- de la tabla lo exigiría de todos modos; mejor un dato correcto que un error.
  if v_corte <= v_gracia then
    v_corte := v_gracia + 1;
  end if;

  insert into public.billing_periods
    (org_id, year, month, label, due_date, grace_end_date, cutoff_date, created_by)
  values
    (v_org, p_year, p_month, v_meses[p_month] || ' ' || p_year,
     v_vence, v_gracia, v_corte, auth.uid())
  on conflict (org_id, year, month) do update set updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.abrir_periodo is
  'Crea el mes de cobranza con sus tres fechas. Si ya existía, lo devuelve tal cual.';

-- ----------------------------------------------------------------------------
-- 2 · Generar la mensualidad de cada servicio activo
-- ----------------------------------------------------------------------------
-- Se puede correr dos veces sin miedo: el índice `charges_mensual_unico` impide
-- el duplicado, y aquí lo esquivamos antes de llegar a él.
-- ----------------------------------------------------------------------------
create or replace function public.generar_cargos_mensuales(p_period uuid)
returns table (generados int, omitidos int, sin_precio int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid := public.auth_org_id();
  v_vence    date;
  v_gen      int := 0;
  v_omit     int := 0;
  v_sin      int := 0;
  r          record;
  v_precio   numeric(12,2);
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('charges.create') then
    raise exception 'No tienes permiso para generar cargos' using errcode = '42501';
  end if;

  select bp.due_date into v_vence
    from public.billing_periods bp
   where bp.id = p_period and bp.org_id = v_org and bp.status = 'open';

  if v_vence is null then
    raise exception 'El periodo no existe, no es de esta empresa, o ya está cerrado';
  end if;

  for r in
    select s.id as service_id, s.customer_id, c.zone_id,
           coalesce(s.custom_price, p.price) as precio
      from public.customer_services s
      join public.customers     c on c.id = s.customer_id
      join public.service_plans p on p.id = s.plan_id
     where s.org_id = v_org
       and s.status = 'active'
       and c.status <> 'cancelled'
       and c.deleted_at is null
  loop
    if exists (select 1 from public.charges ch
                where ch.service_id = r.service_id
                  and ch.period_id  = p_period
                  and ch.type = 'monthly') then
      v_omit := v_omit + 1;
      continue;
    end if;

    v_precio := r.precio;

    -- Los 167 clientes que venían sin precio en el Excel no reciben un cargo
    -- en cero: se cuentan aparte para que alguien los revise. Un cargo de $0
    -- se vería como "ya pagó" y ese cliente se perdería.
    if v_precio is null or v_precio <= 0 then
      v_sin := v_sin + 1;
      continue;
    end if;

    insert into public.charges
      (org_id, customer_id, service_id, period_id, zone_id, type,
       description, amount, balance, due_date, created_by)
    values
      (v_org, r.customer_id, r.service_id, p_period, r.zone_id, 'monthly',
       'Mensualidad', v_precio, v_precio, v_vence, auth.uid());

    v_gen := v_gen + 1;
  end loop;

  update public.billing_periods
     set generated_at = now(), updated_at = now()
   where id = p_period;

  -- Quien ya había pagado por adelantado no debe amanecer como moroso.
  perform public.aplicar_saldos_a_favor();

  generados  := v_gen;
  omitidos   := v_omit;
  sin_precio := v_sin;
  return next;
end;
$$;

comment on function public.generar_cargos_mensuales is
  'Pone la mensualidad del periodo a cada servicio activo, y luego acomoda el '
  'dinero que la gente ya había adelantado. Correrla dos veces no duplica nada.';

-- ----------------------------------------------------------------------------
-- 2b · Acomodar el dinero adelantado
-- ----------------------------------------------------------------------------
-- ZUUUM cobra por adelantado. Alguien que en julio pagó $900 por dos meses
-- tiene $450 flotando: dinero recibido, sin cargo dónde aplicarse todavía.
--
-- Cuando se genera agosto, ese cargo ya existe. Si nadie acomoda el dinero, ese
-- cliente aparece como moroso el día 11 y le llega el corte, habiendo pagado.
-- Esta función lo evita, y se llama sola al generar el mes.
-- ----------------------------------------------------------------------------
create or replace function public.aplicar_saldos_a_favor(p_customer uuid default null)
returns table (clientes int, aplicado numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_cli    int := 0;
  v_total  numeric(12,2) := 0;
  r        record;
  c        record;
  v_resto  numeric(12,2);
  v_toma   numeric(12,2);
  v_hubo   boolean;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('payments.create') then
    raise exception 'No tienes permiso para aplicar pagos' using errcode = '42501';
  end if;

  for r in
    select p.id as payment_id, p.customer_id,
           p.amount - coalesce((select sum(a.amount)
                                  from public.payment_allocations a
                                 where a.payment_id = p.id), 0) as libre
      from public.payments p
     where p.org_id = v_org
       and p.status = 'applied'
       and (p_customer is null or p.customer_id = p_customer)
     order by p.paid_at
  loop
    continue when r.libre <= 0;
    v_resto := r.libre;
    v_hubo  := false;

    for c in
      select ch.id, ch.balance
        from public.charges ch
       where ch.customer_id = r.customer_id
         and ch.status in ('pending','partial')
         and ch.balance > 0
       order by coalesce(ch.due_date, ch.created_at::date), ch.created_at
       for update
    loop
      exit when v_resto <= 0;
      v_toma := least(v_resto, c.balance);

      insert into public.payment_allocations (org_id, payment_id, charge_id, amount)
      values (v_org, r.payment_id, c.id, v_toma);

      v_resto := v_resto - v_toma;
      v_total := v_total + v_toma;
      v_hubo  := true;
    end loop;

    if v_hubo then
      v_cli := v_cli + 1;
      update public.customers
         set status = 'active', updated_at = now()
       where id = r.customer_id
         and status = 'overdue'
         and not exists (select 1 from public.charges ch
                          where ch.customer_id = r.customer_id
                            and ch.status in ('pending','partial')
                            and ch.balance > 0);
    end if;
  end loop;

  clientes := v_cli;
  aplicado := v_total;
  return next;
end;
$$;

comment on function public.aplicar_saldos_a_favor is
  'Toma el dinero que la gente pagó por adelantado y lo aplica a los cargos que '
  'ya existen. Sin esto, quien paga adelantado aparece moroso el día del corte.';

-- ----------------------------------------------------------------------------
-- 3 · Registrar un pago
-- ----------------------------------------------------------------------------
-- Esta es la función que más se va a llamar del sistema entero.
--
-- El dinero se aplica a lo más viejo primero. Si sobra, queda como saldo a
-- favor del cliente: no se inventa un cargo para "acomodarlo", porque el mes
-- que viene ese cargo sí va a existir y entonces se aplica solo.
--
-- `p_client_uuid` lo manda el SUNMI. Es lo que impide que un cobrador con mala
-- señal, al reintentar, cobre dos veces. Si el pago ya entró, se devuelve el
-- mismo folio en lugar de crear otro.
-- ----------------------------------------------------------------------------
create or replace function public.registrar_pago(
  p_customer    uuid,
  p_amount      numeric,
  p_method      text     default 'cash',
  p_reference   text     default null,
  p_notes       text     default null,
  p_client_uuid uuid     default null,
  p_in_field    boolean  default false,
  p_latitude    numeric  default null,
  p_longitude   numeric  default null
)
returns table (
  payment_id     uuid,
  receipt_number text,
  aplicado       numeric,
  saldo_a_favor  numeric,
  cargos_pagados int,
  ya_existia     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid := public.auth_org_id();
  v_yo      uuid := auth.uid();
  v_zona    uuid;
  v_folio   text;
  v_pago    uuid;
  v_resto   numeric(12,2);
  v_aplic   numeric(12,2) := 0;
  v_cuenta  int := 0;
  v_caja    uuid;
  r         record;
  v_toma    numeric(12,2);
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('payments.create') then
    raise exception 'No tienes permiso para registrar pagos' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe tiene que ser mayor que cero';
  end if;
  if p_method not in ('cash','transfer') then
    raise exception 'La forma de pago solo puede ser efectivo o transferencia';
  end if;

  -- ¿Ya había entrado este mismo pago desde el teléfono?
  if p_client_uuid is not null then
    select p.id, p.receipt_number into v_pago, v_folio
      from public.payments p
     where p.client_uuid = p_client_uuid;

    if v_pago is not null then
      payment_id     := v_pago;
      receipt_number := v_folio;
      select coalesce(sum(a.amount), 0) into aplicado
        from public.payment_allocations a where a.payment_id = v_pago;
      saldo_a_favor  := p_amount - aplicado;
      select count(*) into cargos_pagados
        from public.payment_allocations a where a.payment_id = v_pago;
      ya_existia     := true;
      return next;
      return;
    end if;
  end if;

  select c.zone_id into v_zona
    from public.customers c
   where c.id = p_customer and c.org_id = v_org and c.deleted_at is null;

  if v_zona is null then
    raise exception 'El cliente no existe o no es de esta empresa';
  end if;
  if not public.auth_cobra_zona(v_zona) then
    raise exception 'No cobras en la zona de este cliente' using errcode = '42501';
  end if;

  -- La caja abierta de quien está cobrando, si la trae.
  select cs.id into v_caja
    from public.cash_sessions cs
   where cs.collector_id = v_yo and cs.status = 'open'
   order by cs.opened_at desc limit 1;

  v_folio := public.siguiente_folio(v_org, v_zona, 'receipt');

  insert into public.payments
    (org_id, receipt_number, customer_id, zone_id, amount, method, reference,
     received_by, cash_session_id, collected_in_field, latitude, longitude,
     client_uuid, notes)
  values
    (v_org, v_folio, p_customer, v_zona, p_amount, p_method, p_reference,
     v_yo, v_caja, p_in_field, p_latitude, p_longitude,
     p_client_uuid, p_notes)
  returning id into v_pago;

  -- Lo más viejo primero. `for update` evita que dos cobradores apliquen a la
  -- vez sobre el mismo cargo y lo dejen en negativo.
  v_resto := p_amount;

  for r in
    select ch.id, ch.balance
      from public.charges ch
     where ch.customer_id = p_customer
       and ch.status in ('pending','partial')
       and ch.balance > 0
     order by coalesce(ch.due_date, ch.created_at::date), ch.created_at
     for update
  loop
    exit when v_resto <= 0;
    v_toma := least(v_resto, r.balance);

    insert into public.payment_allocations (org_id, payment_id, charge_id, amount)
    values (v_org, v_pago, r.id, v_toma);

    v_resto  := v_resto - v_toma;
    v_aplic  := v_aplic + v_toma;
    v_cuenta := v_cuenta + 1;
  end loop;

  -- Si el cliente quedó al corriente, se le quita lo de moroso.
  if not exists (select 1 from public.charges ch
                  where ch.customer_id = p_customer
                    and ch.status in ('pending','partial')
                    and ch.balance > 0)
  then
    update public.customers
       set status = 'active', updated_at = now()
     where id = p_customer and status = 'overdue';
  end if;

  if v_caja is not null then
    update public.cash_sessions
       set expected_cash     = expected_cash
                             + case when p_method = 'cash'     then p_amount else 0 end,
           expected_transfer = expected_transfer
                             + case when p_method = 'transfer' then p_amount else 0 end,
           payment_count     = payment_count + 1,
           updated_at        = now()
     where id = v_caja;
  end if;

  payment_id     := v_pago;
  receipt_number := v_folio;
  aplicado       := v_aplic;
  saldo_a_favor  := v_resto;
  cargos_pagados := v_cuenta;
  ya_existia     := false;
  return next;
end;
$$;

comment on function public.registrar_pago is
  'Cobra: saca folio de la zona, guarda el pago y lo aplica a los cargos más '
  'viejos. Lo que sobra queda como saldo a favor. A prueba de reintentos del SUNMI.';

-- ----------------------------------------------------------------------------
-- 4 · Cancelar un pago
-- ----------------------------------------------------------------------------
-- No se borra nada. El pago queda marcado, con el motivo y con el nombre de
-- quien lo canceló. Los saldos regresan solos por el disparador del 008.
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_pago(p_payment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_p    record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('payments.cancel') then
    raise exception 'Solo el administrador puede cancelar un pago' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Hay que escribir el motivo de la cancelación';
  end if;

  select * into v_p from public.payments where id = p_payment and org_id = v_org;

  if v_p.id is null then
    raise exception 'El pago no existe';
  end if;
  if v_p.status = 'cancelled' then
    raise exception 'Ese pago ya estaba cancelado';
  end if;

  -- Borrar las aplicaciones dispara el trigger que devuelve el saldo al cargo.
  delete from public.payment_allocations where payment_id = p_payment;

  update public.payments
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by = auth.uid(), cancelled_reason = p_reason, updated_at = now()
   where id = p_payment;

  if v_p.cash_session_id is not null then
    update public.cash_sessions
       set expected_cash     = greatest(0, expected_cash
                             - case when v_p.method = 'cash'     then v_p.amount else 0 end),
           expected_transfer = greatest(0, expected_transfer
                             - case when v_p.method = 'transfer' then v_p.amount else 0 end),
           payment_count     = greatest(0, payment_count - 1),
           updated_at        = now()
     where id = v_p.cash_session_id;
  end if;
end;
$$;

comment on function public.cancelar_pago is
  'Cancela un pago sin borrarlo. Devuelve el saldo a los cargos y deja el motivo escrito.';

-- ----------------------------------------------------------------------------
-- 5 · Saldo a favor
-- ----------------------------------------------------------------------------
-- Dinero que el cliente ya entregó y que todavía no tiene cargo dónde aplicarse.
-- Sin esta vista, ese dinero existiría en la base pero nadie lo vería.
-- ----------------------------------------------------------------------------
create or replace view public.v_saldo_a_favor with (security_invoker = true) as
select p.customer_id,
       c.customer_code,
       c.full_name,
       c.zone_id,
       sum(p.amount) - coalesce(sum(ap.aplicado), 0) as saldo_a_favor
  from public.payments p
  join public.customers c on c.id = p.customer_id
  left join lateral (
       select coalesce(sum(a.amount), 0) as aplicado
         from public.payment_allocations a
        where a.payment_id = p.id
  ) ap on true
 where p.status = 'applied'
 group by p.customer_id, c.customer_code, c.full_name, c.zone_id
having sum(p.amount) - coalesce(sum(ap.aplicado), 0) > 0;

comment on view public.v_saldo_a_favor is
  'Lo que el cliente pagó de más y todavía no se aplica a ningún cargo.';

-- ----------------------------------------------------------------------------
-- 6 · Corte de caja del día
-- ----------------------------------------------------------------------------
create or replace view public.v_corte_caja with (security_invoker = true) as
select cs.id,
       cs.org_id,
       cs.collector_id,
       pr.full_name             as cobrador,
       cs.zone_id,
       z.name                   as zona,
       cs.opened_at,
       cs.closed_at,
       cs.status,
       cs.payment_count         as pagos,
       cs.expected_cash         as efectivo_esperado,
       cs.expected_transfer     as transferencias,
       cs.declared_cash         as efectivo_declarado,
       cs.difference            as diferencia
  from public.cash_sessions cs
  join public.profiles pr on pr.id = cs.collector_id
  left join public.zones z on z.id = cs.zone_id;

comment on view public.v_corte_caja is
  'El corte de cada cobrador, con la diferencia ya calculada.';

-- ----------------------------------------------------------------------------
-- 7 · Quién puede llamar cada función
-- ----------------------------------------------------------------------------
-- Son `security definer`: se saltan las RLS a propósito, porque tienen que
-- escribir en varias tablas a la vez. Por eso cada una revisa el permiso a
-- mano en su primera línea, y aquí se le quita el acceso a los anónimos.
-- ----------------------------------------------------------------------------
revoke all on function public.abrir_periodo(int, int)            from public, anon;
revoke all on function public.generar_cargos_mensuales(uuid)     from public, anon;
revoke all on function public.aplicar_saldos_a_favor(uuid)       from public, anon;
revoke all on function public.cancelar_pago(uuid, text)          from public, anon;
revoke all on function public.registrar_pago(uuid, numeric, text, text, text, uuid, boolean, numeric, numeric)
  from public, anon;

grant execute on function public.abrir_periodo(int, int)         to authenticated;
grant execute on function public.generar_cargos_mensuales(uuid)  to authenticated;
grant execute on function public.aplicar_saldos_a_favor(uuid)    to authenticated;
grant execute on function public.cancelar_pago(uuid, text)       to authenticated;
grant execute on function public.registrar_pago(uuid, numeric, text, text, text, uuid, boolean, numeric, numeric)
  to authenticated;
