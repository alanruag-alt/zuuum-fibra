-- ============================================================================
--  ZUUUM FIBRA · CUADRE DE LA CARGA
--  Se corre después de CARGA_PADRON.sql. Compara contra tu Excel.
--  Todo debe decir "CUADRA".
-- ============================================================================

select 'Clientes' as concepto, count(*)::text as en_la_base, '1102' as en_el_excel,
       case when count(*)=1102 then 'CUADRA' else '>>> REVISAR <<<' end as resultado
  from public.customers
union all
select 'Servicios', count(*)::text, '1102',
       case when count(*)=1102 then 'CUADRA' else '>>> REVISAR <<<' end
  from public.customer_services
union all
select 'Con precio', count(*)::text, '935',
       case when count(*)=935 then 'CUADRA' else '>>> REVISAR <<<' end
  from public.customer_services where custom_price > 0
union all
select 'Sin precio (a revisar)', count(*)::text, '167',
       case when count(*)=167 then 'CUADRA' else '>>> REVISAR <<<' end
  from public.customers where price_review_needed
union all
select 'Ingreso mensual', '$'||to_char(sum(custom_price),'FM999,999'), '$398,588',
       case when sum(custom_price)=398588 then 'CUADRA' else '>>> REVISAR <<<' end
  from public.customer_services
union all
select 'Marcas de pago', count(*)::text, '10705',
       case when count(*)=10705 then 'CUADRA' else '>>> REVISAR <<<' end
  from public.charges
union all
select 'Clientes con 2 servicios', count(*)::text, '0',
       case when count(*)=0 then 'CUADRA' else '>>> REVISAR <<<' end
  from (select customer_id from public.customer_services
         group by customer_id having count(*)>1) x
union all
select 'IP capturadas', count(*)::text, '891',
       case when count(*)=891 then 'CUADRA' else '>>> REVISAR <<<' end
  from public.customer_services where ip_address is not null;
