-- ============================================================================
--  ZUUUM FIBRA · DETALLE DE LA CARGA
--  Para revisar con calma. No cambia nada, solo consulta.
--  Cada bloque va por separado: selecciona uno y dale Run, o córrelos todos.
-- ============================================================================

-- ─────────────────────────  POR ZONA  ─────────────────────────
select z.code, z.name as zona,
       (select count(*) from public.customers c where c.zone_id=z.id) as clientes,
       (select count(*) from public.customers c
         where c.zone_id=z.id and c.price_review_needed) as sin_precio,
       '$'||to_char((select coalesce(sum(s.custom_price),0)
                       from public.customer_services s
                       join public.customers c on c.id=s.customer_id
                      where c.zone_id=z.id),'FM999,999') as ingreso
  from public.zones z order by 3 desc;

-- ───────────────────  COBRANZA MES A MES  ───────────────────
select bp.label as periodo, count(*) as cargos,
       count(*) filter (where ch.status='paid') as pagaron,
       count(*) filter (where ch.status='pending') as no_pagaron,
       round(count(*) filter (where ch.status='paid')*100.0/count(*))||'%' as pct,
       '$'||to_char(sum(ch.amount-ch.balance),'FM999,999') as cobrado
  from public.charges ch join public.billing_periods bp on bp.id=ch.period_id
 group by bp.label order by bp.label;

-- ────────────  LOS 167 SIN PRECIO, PARA REVISARLOS  ────────────
select z.name as zona, count(*) as cuantos
  from public.customers c join public.zones z on z.id=c.zone_id
 where c.price_review_needed group by z.name order by 2 desc;

-- ──────────────  CLIENTES SIN IP CAPTURADA  ──────────────
select z.name as zona, count(*) as sin_ip
  from public.customer_services s
  join public.customers c on c.id=s.customer_id
  join public.zones z on z.id=c.zone_id
 where s.ip_address is null group by z.name order by 2 desc;

-- ──────────  PLANES HEREDADOS QUE SE CREARON  ──────────
select code, name, '$'||to_char(price,'FM999,999') as precio,
       (select count(*) from public.customer_services s where s.plan_id=p.id) as clientes
  from public.service_plans p where is_legacy order by price;
