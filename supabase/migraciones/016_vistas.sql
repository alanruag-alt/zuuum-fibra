-- ============================================================================
-- 016 · Vistas
-- ============================================================================
-- Todas con security_invoker: la vista respeta el RLS de quien pregunta,
-- no el de quien la creó. Sin esto, una vista sería una puerta trasera.
-- ============================================================================

-- Inventario SIN costo. Es la que consumen técnico y almacén.
create view public.inventario_sin_costo
with (security_invoker = true) as
select id, org_id, sku, name, category, unit, is_serialized,
       min_stock, brand, model, is_active
  from public.inventory_items;

comment on view public.inventario_sin_costo is
  'Igual que inventory_items pero sin la columna cost. El panel se la sirve a '
  'quien no tiene inventory.cost.read.';

-- Expediente del cliente, de un jalón.
--
-- OJO: aquí NO se puede usar join + group by. Si se juntan servicios, cargos y
-- pagos en el mismo FROM, cada cargo multiplica el precio del servicio y la
-- mensualidad sale inflada. Se probó con datos reales: un cliente de $797 con
-- 6 cargos aparecía con $4,782. Por eso van subconsultas, no joins.
create view public.v_clientes
with (security_invoker = true) as
select c.id, c.org_id, c.customer_code, c.full_name, c.phone, c.email,
       c.status, c.price_review_needed, c.created_at,
       z.id as zone_id, z.name as zona, z.code as zona_codigo,
       (select count(*) from public.customer_services s
         where s.customer_id = c.id and s.status = 'active') as servicios_activos,
       (select coalesce(sum(coalesce(s.custom_price, p.price)), 0)
          from public.customer_services s
          join public.service_plans p on p.id = s.plan_id
         where s.customer_id = c.id and s.status = 'active') as mensualidad,
       (select coalesce(sum(ch.balance), 0) from public.charges ch
         where ch.customer_id = c.id and ch.status in ('pending','partial')) as adeudo,
       (select max(pg.paid_at) from public.payments pg
         where pg.customer_id = c.id and pg.status = 'applied') as ultimo_pago
  from public.customers c
  join public.zones z on z.id = c.zone_id
 where c.deleted_at is null;

-- Cobranza por zona y periodo. Es el reporte que más se va a abrir.
-- Aquí sí se puede agrupar: cada cargo es un renglón, no hay multiplicación.
create view public.v_cobranza_zona
with (security_invoker = true) as
select ch.org_id, ch.zone_id, z.name as zona, ch.period_id, bp.label as periodo,
       count(*) as cargos,
       count(*) filter (where ch.status = 'paid') as pagados,
       count(*) filter (where ch.status in ('pending','partial')) as pendientes,
       sum(ch.amount) as esperado,
       sum(ch.amount - ch.balance) as cobrado,
       sum(ch.balance) as por_cobrar
  from public.charges ch
  join public.zones z on z.id = ch.zone_id
  left join public.billing_periods bp on bp.id = ch.period_id
 where ch.status <> 'cancelled'
 group by ch.org_id, ch.zone_id, z.name, ch.period_id, bp.label;

-- Morosos: quién pasó del día de corte sin pagar.
-- Mismo cuidado que en v_clientes: el adeudo va por subconsulta.
create view public.v_morosos
with (security_invoker = true) as
select c.id as customer_id, c.org_id, c.customer_code, c.full_name, c.phone,
       c.zone_id, z.name as zona,
       (select coalesce(sum(ch.balance), 0) from public.charges ch
         where ch.customer_id = c.id and ch.status in ('pending','partial')) as adeudo,
       (select min(ch.due_date) from public.charges ch
         where ch.customer_id = c.id and ch.status in ('pending','partial')) as vence_desde,
       (current_date - (select min(ch.due_date) from public.charges ch
                         where ch.customer_id = c.id
                           and ch.status in ('pending','partial'))) as dias_vencido,
       (select count(*) from public.customer_services s
         where s.customer_id = c.id and s.status = 'active') as servicios_activos
  from public.customers c
  join public.zones z on z.id = c.zone_id
 where c.deleted_at is null
   and c.status <> 'cancelled'
   and exists (select 1 from public.charges ch
                where ch.customer_id = c.id
                  and ch.status in ('pending','partial')
                  and ch.due_date < current_date);

comment on view public.v_morosos is
  'Con la regla de ZUUUM: vencen el día 5, gracia hasta el 10, corte el 11. '
  'Los que aquí traen dias_vencido >= 6 son los que se cortan.';

-- Ocupación de la red: qué NAP y qué puertos PON están por llenarse.
create view public.v_ocupacion_red
with (security_invoker = true) as
select e.id, e.org_id, e.code, e.element_type, e.zone_id, z.name as zona,
       e.capacity, e.used_ports,
       case when coalesce(e.capacity, 0) > 0
            then round(e.used_ports * 100.0 / e.capacity) else null end as porcentaje,
       e.latitude, e.longitude
  from public.network_elements e
  join public.zones z on z.id = e.zone_id
 where e.is_active and e.element_type in ('nap','splitter');
