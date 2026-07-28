-- ============================================================================
-- 008 · Periodos, cargos, pagos y aplicaciones
-- ============================================================================
-- Reglas de ZUUUM (todas configurables en `settings`):
--   pago del 1 al 5 · gracia del 6 al 10 · corte el día 11
--   reconexión $30 · equipo no devuelto $550 · se paga por adelantado
-- ============================================================================

create table public.billing_periods (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  year            integer not null check (year between 2000 and 2100),
  month           integer not null check (month between 1 and 12),
  label           text not null,
  due_date        date not null,
  grace_end_date  date not null,
  cutoff_date     date not null,
  status          text not null default 'open' check (status in ('open','closed')),
  generated_at    timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null,
  constraint billing_periods_unico unique (org_id, year, month),
  constraint billing_periods_orden check (due_date <= grace_end_date and grace_end_date < cutoff_date)
);

comment on constraint billing_periods_orden on public.billing_periods is
  'El vencimiento no puede ser después de la gracia, ni la gracia después del corte.';

create table public.charges (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  customer_id   uuid not null references public.customers(id) on delete restrict,
  service_id    uuid references public.customer_services(id) on delete set null,
  period_id     uuid references public.billing_periods(id) on delete restrict,
  zone_id       uuid not null references public.zones(id) on delete restrict,
  type          text not null check (type in
                ('monthly','reconnection','installation','equipment_loss','other')),
  description   text,
  amount        numeric(12,2) not null check (amount > 0),
  balance       numeric(12,2) not null check (balance >= 0),
  due_date      date,
  status        text not null default 'pending'
                check (status in ('pending','partial','paid','cancelled')),
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles(id) on delete set null,
  cancelled_reason  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  constraint charges_saldo check (balance <= amount)
);

-- Impide generar dos veces la mensualidad del mismo servicio en el mismo periodo,
-- aunque alguien corra la generación por error dos veces.
-- Es un índice PARCIAL a propósito: los cargos sueltos (reconexión, equipo no
-- devuelto) no traen servicio ni periodo, y con una restricción normal todos
-- ellos chocarían entre sí.
create unique index charges_mensual_unico
    on public.charges (service_id, period_id)
 where type = 'monthly' and service_id is not null and period_id is not null;

create table public.cash_sessions (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  collector_id       uuid not null references public.profiles(id) on delete restrict,
  zone_id            uuid references public.zones(id) on delete set null,
  opened_at          timestamptz not null default now(),
  closed_at          timestamptz,
  expected_cash      numeric(12,2) not null default 0,
  expected_transfer  numeric(12,2) not null default 0,
  declared_cash      numeric(12,2),
  payment_count      integer not null default 0,
  status             text not null default 'open'
                     check (status in ('open','closed','delivered','verified')),
  delivered_to       uuid references public.profiles(id) on delete set null,
  verified_at        timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  difference         numeric(12,2)
                     generated always as (coalesce(declared_cash, 0) - expected_cash) stored
);

comment on column public.cash_sessions.difference is
  'Se calcula sola: lo declarado menos lo esperado. Si no cuadra, queda registrado y con nombre.';

create table public.payments (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete restrict,
  receipt_number     text not null,
  customer_id        uuid not null references public.customers(id) on delete restrict,
  zone_id            uuid not null references public.zones(id) on delete restrict,
  amount             numeric(12,2) not null check (amount > 0),
  method             text not null check (method in ('cash','transfer')),
  reference          text,
  paid_at            timestamptz not null default now(),
  received_by        uuid not null references public.profiles(id) on delete restrict,
  cash_session_id    uuid references public.cash_sessions(id) on delete set null,
  collected_in_field boolean not null default false,
  latitude           numeric(10,7),
  longitude          numeric(10,7),
  status             text not null default 'applied' check (status in ('applied','cancelled')),
  cancelled_at       timestamptz,
  cancelled_by       uuid references public.profiles(id) on delete set null,
  cancelled_reason   text,
  client_uuid        uuid,
  device_synced_at   timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint payments_folio_unico  unique (org_id, receipt_number),
  constraint payments_cliente_uuid unique (client_uuid)
);

comment on column public.payments.client_uuid is
  'Lo genera el SUNMI antes de sincronizar. Sin esto, un cobrador con mala señal '
  'puede registrar el mismo pago dos veces. Con esto, la base rechaza el duplicado sola.';
comment on column public.payments.received_by is
  'Quién recibió el dinero. Nunca nulo: siempre hay un responsable.';

create table public.payment_allocations (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  payment_id  uuid not null references public.payments(id) on delete cascade,
  charge_id   uuid not null references public.charges(id) on delete restrict,
  amount      numeric(12,2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);

comment on table public.payment_allocations is
  'A qué cargos se aplicó cada pago. Permite pagos parciales y adelantados.';

create table public.receipts (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  payment_id      uuid not null references public.payments(id) on delete cascade,
  receipt_number  text not null,
  pdf_url         text,
  sent_to         text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table public.service_suspensions (
  id                      uuid primary key default extensions.gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete restrict,
  service_id              uuid not null references public.customer_services(id) on delete cascade,
  suspended_at            timestamptz not null default now(),
  reactivated_at          timestamptz,
  reason                  text not null default 'overdue'
                          check (reason in ('overdue','requested','technical','other')),
  method                  text not null default 'manual'
                          check (method in ('manual','agent')),
  suspended_by            uuid references public.profiles(id) on delete set null,
  reactivated_by          uuid references public.profiles(id) on delete set null,
  reconnection_charge_id  uuid references public.charges(id) on delete set null,
  notes                   text,
  created_at              timestamptz not null default now()
);

comment on column public.service_suspensions.method is
  'En el MVP siempre "manual": la oficina corta a mano. "agent" entra en la etapa 12.';

-- ----------------------------------------------------------------------------
-- Aplicar un pago mueve el saldo del cargo. Se hace con disparador para que
-- sea imposible que la aplicación se le olvide.
-- ----------------------------------------------------------------------------
create or replace function public.aplicar_a_cargo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saldo numeric(12,2);
begin
  if tg_op = 'INSERT' then
    select balance into v_saldo from public.charges where id = new.charge_id for update;

    if v_saldo is null then
      raise exception 'El cargo no existe';
    end if;
    if new.amount > v_saldo then
      raise exception 'No se puede aplicar % a un cargo que solo debe %', new.amount, v_saldo
        using errcode = 'check_violation';
    end if;

    update public.charges
       set balance = balance - new.amount,
           status  = case when balance - new.amount = 0 then 'paid' else 'partial' end,
           updated_at = now()
     where id = new.charge_id;

    return new;

  elsif tg_op = 'DELETE' then
    update public.charges
       set balance = least(amount, balance + old.amount),
           status  = case when least(amount, balance + old.amount) = amount then 'pending'
                          else 'partial' end,
           updated_at = now()
     where id = old.charge_id;
    return old;
  end if;

  return null;
end;
$$;

create trigger trg_aplicar_a_cargo
  after insert or delete on public.payment_allocations
  for each row execute function public.aplicar_a_cargo();

create index charges_cliente_idx  on public.charges(customer_id, status);
create index charges_periodo_idx  on public.charges(period_id, status);
create index charges_zona_idx     on public.charges(zone_id, status) where status <> 'paid';
create index payments_cliente_idx on public.payments(customer_id, paid_at desc);
create index payments_zona_idx    on public.payments(zone_id, paid_at desc);
create index payments_caja_idx    on public.payments(cash_session_id);
create index cash_cobrador_idx    on public.cash_sessions(collector_id, opened_at desc);
create index suspensiones_idx     on public.service_suspensions(service_id, suspended_at desc);

select public.poner_tocar_actualizado('billing_periods');
select public.poner_tocar_actualizado('charges');
select public.poner_tocar_actualizado('payments');
select public.poner_tocar_actualizado('cash_sessions');
