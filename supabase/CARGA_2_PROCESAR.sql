-- ============================================================================
--  ZUUUM FIBRA · CARGA DEL PADRÓN  ·  parte 2 de 2: procesar
-- ----------------------------------------------------------------------------
--  Pega TODO este archivo DESPUÉS de CARGA_1_DATOS.sql.
--  Tarda unos 2 segundos.
--
--  QUÉ HACE
--    · Crea los 17 planes heredados (uno por cada precio que había)
--    · Crea los 1,102 clientes con su folio y su zona
--    · Un servicio por cliente, con su precio heredado
--    · Los periodos de cobranza, con las reglas de ZUUUM: vence 5, gracia 10, corte 11
--    · Las 10,705 marcas de pago como cargos pagados o pendientes
--    · Borra la tabla de paso al terminar
--
--  IP CORREGIDAS (errores de dedo evidentes, ya arreglados en los datos):
--    172.168.18.94.   → 172.168.18.94     sobraba un punto
--    172168.15.218    → 172.168.15.218    faltaba un punto
--    1912.168.121.83  → 192.168.121.83    192 escrito como 1912
--
--  IP QUE NO SE TOCARON (quedan en nulo, hay que decidirlas a mano):
--    192.168.150.121.77              cinco números, no se sabe cuál sobra
--    "checar para cortar"            es una nota, no una IP
--    192.168.126.35/192.168.120.110  son dos direcciones en una celda
-- ============================================================================

do $$
begin
  if to_regclass('public.zuuum_carga') is null then
    raise exception using message =
      E'No encuentro la tabla de paso.\n  Corre primero CARGA_1_DATOS.sql.';
  end if;
  if (select count(*) from public.zuuum_carga) <> 1102 then
    raise exception using message =
      E'La tabla de paso no trae 1102 renglones.\n'
      '  Vuelve a correr CARGA_1_DATOS.sql completo.';
  end if;
end $$;

insert into public.import_batches(id, org_id, source_file, kind, row_count, status)
values ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-000000000001'::uuid,'www PAGOS.xlsx','customers',
        (select count(*) from public.zuuum_carga),'running')
on conflict (id) do nothing;

-- Plan para los que no traen precio. Quedan marcados y no se pierden.
insert into public.service_plans(org_id,code,name,price,network_type,is_legacy,visible_for_sale)
values ('00000000-0000-0000-0000-000000000001'::uuid,'LEG-REV','Por revisar (sin precio en el Excel)',0,'both',true,false)
on conflict (org_id,code) do nothing;

-- Un plan heredado por cada precio distinto que existía.
insert into public.service_plans(org_id,code,name,price,network_type,is_legacy,visible_for_sale)
select distinct '00000000-0000-0000-0000-000000000001'::uuid, 'LEG-'||trim(to_char(precio,'FM99999')),
       'Heredado $'||trim(to_char(precio,'FM99999')), precio, 'both', true, false
  from public.zuuum_carga where precio is not null and precio > 0
on conflict (org_id,code) do nothing;

-- Periodos de cobranza que hagan falta.
insert into public.billing_periods(org_id,year,month,label,due_date,grace_end_date,cutoff_date)
select distinct '00000000-0000-0000-0000-000000000001'::uuid,
       substring(t from 1 for 4)::int,
       substring(t from 5 for 2)::int,
       substring(t from 1 for 4)||'-'||substring(t from 5 for 2),
       make_date(substring(t from 1 for 4)::int, substring(t from 5 for 2)::int, 5),
       make_date(substring(t from 1 for 4)::int, substring(t from 5 for 2)::int, 10),
       make_date(substring(t from 1 for 4)::int, substring(t from 5 for 2)::int, 11)
  from public.zuuum_carga,
       lateral unnest(string_to_array(meses, ',')) as t
on conflict (org_id,year,month) do nothing;

-- ----------------------------------------------------------------------------
-- Va renglón por renglón a propósito. Un JOIN por nombre parece más rápido,
-- pero en Las Mercedes hay dos clientes que se llaman igual, y el join los
-- cruza creando servicios de más. Se descubrió probando con los datos reales.
-- ----------------------------------------------------------------------------
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  r record; t text;
  v_anio int; v_mes int; v_pago int;
  v_zona uuid; v_cli uuid; v_srv uuid; v_plan uuid; v_per uuid;
  v_ip inet; v_precio numeric; v_rev boolean;
begin
  for r in select * from public.zuuum_carga order by n loop
    select id into v_zona from public.zones where org_id=v_org and code=r.zc;
    v_precio := r.precio;
    v_rev := (v_precio is null or v_precio <= 0);

    select id into v_plan from public.service_plans
     where org_id=v_org and code = case when v_rev then 'LEG-REV'
                                        else 'LEG-'||trim(to_char(v_precio,'FM99999')) end;

    -- Solo se convierte lo que de verdad es una IP (octetos de 0 a 255).
    -- Lo que no pase queda en nulo: se reporta, no se pierde en silencio.
    v_ip := case when r.ip ~ '^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$'
                 then r.ip::inet else null end;

    insert into public.customers(org_id,customer_code,full_name,zone_id,status,
                                 legacy_id,price_review_needed,import_batch_id)
    values (v_org, public.siguiente_folio(v_org,v_zona,'customer'), r.nombre, v_zona,'active',
            nullif(r.idext,''), v_rev, '00000000-0000-0000-0000-0000000000aa')
    returning id into v_cli;

    insert into public.customer_services(org_id,customer_id,plan_id,custom_price,
                                         network_type,ip_address,status,activated_at)
    values (v_org, v_cli, v_plan, v_precio, 'ftth', v_ip, 'active', now())
    returning id into v_srv;

    if r.meses is not null and r.meses <> '' then
      foreach t in array string_to_array(r.meses, ',') loop
        v_anio := substring(t from 1 for 4)::int;
        v_mes  := substring(t from 5 for 2)::int;
        v_pago := substring(t from 8)::int;

        select id into v_per from public.billing_periods
         where org_id=v_org and year=v_anio and month=v_mes;

        insert into public.charges(org_id,customer_id,service_id,period_id,zone_id,type,
                                   amount,balance,due_date,status)
        values (v_org, v_cli, v_srv, v_per, v_zona, 'monthly',
                greatest(coalesce(v_precio,0),1),
                case when v_pago = 1 then 0 else greatest(coalesce(v_precio,0),1) end,
                make_date(v_anio, v_mes, 5),
                case when v_pago = 1 then 'paid' else 'pending' end);
      end loop;
    end if;
  end loop;
end $$;

update public.import_batches
   set status='completed', completed_at=now(),
       created_count=(select count(*) from public.customers
                       where import_batch_id='00000000-0000-0000-0000-0000000000aa')
 where id='00000000-0000-0000-0000-0000000000aa';

-- La tabla de paso ya no hace falta.
drop table public.zuuum_carga;

-- Resultado
select (select count(*) from public.customers)          as clientes,
       (select count(*) from public.customer_services)  as servicios,
       (select count(*) from public.charges)            as marcas_de_pago,
       '$'||to_char((select sum(custom_price) from public.customer_services),'FM999,999') as ingreso;
