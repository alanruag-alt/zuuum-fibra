-- ============================================================================
-- 021 · No cortar a nadie por centavos
-- ============================================================================
-- Al simular el corte del día 11 sobre el padrón real aparecieron 14 clientes
-- que deben MENOS DE $50. Entre los catorce suman $15 pesos: son residuos de
-- redondeo que vinieron de los Excel, no gente que no pagó.
--
-- Uno de ellos, en Ocuila, debe UN PESO. Con la 020 tal como estaba, el día 11
-- se le corta el internet a esa casa por un peso.
--
-- El costo de cortarlo es una llamada enojada, una visita del técnico y un
-- cargo de reconexión que hay que perdonar. El beneficio es un peso. Por eso
-- ahora hay un mínimo, y vive en `settings` como todo lo demás.
-- ============================================================================

insert into public.settings (org_id, key, value, value_type, category, name, description)
values (
  '00000000-0000-0000-0000-000000000001',
  'billing.cutoff_min_debt', '50', 'number', 'cobranza',
  'Adeudo mínimo para cortar',
  'Debajo de esto no se suspende a nadie. Evita cortar por residuos de redondeo.'
)
on conflict (org_id, key) do nothing;

-- ----------------------------------------------------------------------------
-- Misma función que en la 020, con el mínimo agregado.
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
  v_org    uuid := public.auth_org_id();
  v_corte  date;
  v_minimo numeric(12,2);
  r        record;
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

  v_minimo := public.ajuste_numero(v_org, 'billing.cutoff_min_debt', 50);

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
    having sum(ch.balance) >= v_minimo
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
  'El corte del día 11. No corta por menos del mínimo (settings billing.cutoff_min_debt), '
  'ni a quien tiene dinero adelantado sin aplicar. Con p_simular en true solo enseña la lista.';

-- ----------------------------------------------------------------------------
-- Los que quedan debajo del mínimo no desaparecen: se ven aparte, para que
-- alguien decida si se les perdona el residuo o se les cobra junto al mes.
--
-- OJO: aquí se suma SOLO lo ya vencido, no todo lo pendiente. Si se colgara de
-- `v_morosos`, el adeudo incluiría el mes que apenas viene, y entonces esta
-- vista mediría una cosa distinta de la que mira el corte. La primera versión
-- tenía justo ese error: alguien con $1 vencido y su mensualidad del mes que
-- entra sumaba $451 y no aparecía aquí, pero el corte sí lo perdonaba.
-- ----------------------------------------------------------------------------
-- `create or replace view` no puede cambiarle los nombres a las columnas, y esta
-- vista cambió de forma respecto al primer intento. Por eso se tira y se vuelve
-- a crear, en vez de reemplazarse.
drop view if exists public.v_adeudos_menores;

create view public.v_adeudos_menores with (security_invoker = true) as
select c.id as customer_id,
       c.org_id,
       c.customer_code,
       c.full_name,
       c.phone,
       c.zone_id,
       z.name as zona,
       v.vencido,
       (current_date - v.desde) as dias_vencido
  from public.customers c
  join public.zones z on z.id = c.zone_id
  join lateral (
       select coalesce(sum(ch.balance), 0) as vencido,
              min(ch.due_date)             as desde
         from public.charges ch
        where ch.customer_id = c.id
          and ch.status in ('pending','partial')
          and ch.balance > 0
          and ch.due_date < current_date
  ) v on true
 where c.deleted_at is null
   and c.status <> 'cancelled'
   and v.vencido > 0
   and v.vencido < public.ajuste_numero(c.org_id, 'billing.cutoff_min_debt', 50);

comment on view public.v_adeudos_menores is
  'Adeudos ya vencidos pero tan chicos que no justifican un corte. Casi siempre '
  'son residuos de redondeo del Excel. Conviene limpiarlos una vez y olvidarse.';

revoke all on function public.suspender_vencidos(uuid, boolean) from public, anon;
grant execute on function public.suspender_vencidos(uuid, boolean) to authenticated;
