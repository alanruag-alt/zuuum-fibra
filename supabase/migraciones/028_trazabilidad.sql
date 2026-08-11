-- ============================================================================
-- 028 · Trazabilidad e impacto de un corte
-- ============================================================================
-- Dos preguntas, y son la misma vista desde los dos lados:
--
--   «A este señor no le llega internet. ¿Por dónde viene su fibra?»
--   → trazar_cliente: sube del puerto de su NAP hasta el ODF, pasando por
--     cada fusión, y dice cuánto dB se va perdiendo en el camino.
--
--   «Se quemó la caja de la esquina. ¿A quién le hablo?»
--   → v_impacto_corte: por cada cable y por cada caja, cuántos clientes se
--     quedan sin servicio.
--
-- El recorrido se hace sobre las fusiones, tratándolas como lo que son: una
-- unión entre dos hilos, sin dirección. La luz no sabe para dónde va; el que
-- decide qué es «arriba» y qué es «abajo» es uno, según de dónde parta a
-- buscar. Por eso el mismo recorrido sirve para las dos preguntas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · El recorrido de un hilo
-- ----------------------------------------------------------------------------
create or replace function public.trazar_hilo(p_hilo uuid)
returns table (
  salto      int,
  hilo_id    uuid,
  cable      text,
  cable_id   uuid,
  numero     int,
  tubo       int,
  color      text,
  estado     text,
  caja       text,
  caja_id    uuid,
  tipo_union text,
  perdida_db numeric,
  destino    text,
  destino_id uuid,
  metros     numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.read') then
    raise exception 'No tienes permiso para ver la red' using errcode = '42501';
  end if;

  return query
  with recursive camino as (
    -- El hilo por donde se empieza.
    select 0                        as salto,
           s.id                     as hilo_id,
           null::uuid               as via_caja,
           null::text               as via_tipo,
           null::numeric            as via_perdida,
           array[s.id]              as vistos
      from public.fiber_strands s
     where s.id = p_hilo and s.org_id = v_org

    union all

    -- Se avanza por cualquier fusión activa que toque el hilo actual, en
    -- cualquiera de los dos sentidos. `vistos` evita dar vueltas en redondo
    -- cuando la captura tiene un lazo.
    select c.salto + 1,
           case when f.in_strand_id = c.hilo_id then f.out_strand_id
                else f.in_strand_id end,
           f.closure_id,
           f.splice_type,
           f.loss_db,
           c.vistos || case when f.in_strand_id = c.hilo_id then f.out_strand_id
                           else f.in_strand_id end
      from camino c
      join public.fiber_splices f
        on f.status = 'activa'
       and f.out_strand_id is not null
       and (f.in_strand_id = c.hilo_id or f.out_strand_id = c.hilo_id)
     where c.salto < 40
       and (case when f.in_strand_id = c.hilo_id then f.out_strand_id
                 else f.in_strand_id end) <> all (c.vistos)
  )
  select c.salto,
         c.hilo_id,
         cb.code,
         cb.id,
         s.strand_number,
         s.tube_number,
         s.color,
         s.status,
         ne.code,
         c.via_caja,
         c.via_tipo,
         c.via_perdida,
         -- Dónde muere este hilo: en una NAP, en un splitter, o en nada.
         (select coalesce(d.name, d.code)
            from public.fiber_splices f2
            join public.network_elements d on d.id = f2.to_element_id
           where f2.in_strand_id = c.hilo_id and f2.status = 'activa' limit 1),
         (select f2.to_element_id
            from public.fiber_splices f2
           where f2.in_strand_id = c.hilo_id and f2.status = 'activa'
             and f2.to_element_id is not null limit 1),
         cb.length_m
    from camino c
    join public.fiber_strands s on s.id = c.hilo_id
    join public.fiber_cables  cb on cb.id = s.cable_id
    left join public.network_elements ne on ne.id = c.via_caja
   order by c.salto;
end;
$$;

comment on function public.trazar_hilo is
  'El camino completo de un hilo, saltando de fusión en fusión. Se detiene a '
  'los 40 saltos: una red real no tiene tantos, y así una captura con un lazo '
  'no cuelga el sistema.';

-- ----------------------------------------------------------------------------
-- 2 · Desde el cliente hacia arriba
-- ----------------------------------------------------------------------------
create or replace function public.trazar_cliente(p_cliente uuid)
returns table (
  salto      int,
  hilo_id    uuid,
  cable      text,
  cable_id   uuid,
  numero     int,
  tubo       int,
  color      text,
  estado     text,
  caja       text,
  caja_id    uuid,
  tipo_union text,
  perdida_db numeric,
  destino    text,
  destino_id uuid,
  metros     numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_hilo uuid;
  v_nap  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  -- El puerto sabe más que el servicio: si el cliente está capturado en un
  -- puerto, esa es su NAP aunque el servicio diga otra cosa.
  select p.element_id into v_nap
    from public.nap_ports p
    join public.customer_services s on s.id = p.service_id
   where s.customer_id = p_cliente and p.org_id = v_org
   limit 1;

  if v_nap is null then
    select s.network_element_id into v_nap
      from public.customer_services s
     where s.customer_id = p_cliente and s.network_element_id is not null
     limit 1;
  end if;

  if v_nap is null then
    raise exception 'Ese cliente no tiene NAP capturada. Sin eso no hay por dónde empezar.';
  end if;

  select n.feed_strand_id into v_hilo
    from public.network_elements n where n.id = v_nap;

  -- Si la NAP no trae hilo puesto a mano, se busca el que llega a ella por
  -- una fusión: es lo mismo, capturado en otro lado.
  if v_hilo is null then
    select f.in_strand_id into v_hilo
      from public.fiber_splices f
     where f.to_element_id = v_nap and f.status = 'activa'
     limit 1;
  end if;

  if v_hilo is null then
    raise exception 'La NAP de ese cliente no tiene hilo de alimentación registrado';
  end if;

  return query select * from public.trazar_hilo(v_hilo);
end;
$$;

comment on function public.trazar_cliente is
  'El camino de la fibra de un cliente, de su NAP hacia arriba. Es la consulta '
  'de las once de la noche.';

-- ----------------------------------------------------------------------------
-- 3 · Vistas
-- ----------------------------------------------------------------------------
drop view if exists public.v_cables;
create view public.v_cables with (security_invoker = true) as
select cb.id,
       cb.org_id,
       cb.code,
       cb.cable_type,
       cb.fiber_count,
       cb.zone_id,
       z.name as zona,
       coalesce(cb.from_text, ef.code, ef.name) as de,
       coalesce(cb.to_text,   et.code, et.name) as a,
       cb.length_m,
       cb.plan_color,
       cb.notes,
       cb.is_active,
       (select count(*) from public.fiber_strands s
         where s.cable_id = cb.id)                                     as hilos,
       (select count(*) from public.fiber_strands s
         where s.cable_id = cb.id and s.status = 'disponible')          as libres,
       (select count(*) from public.fiber_strands s
         where s.cable_id = cb.id and s.status = 'en_servicio')         as en_servicio,
       (select count(*) from public.fiber_strands s
         where s.cable_id = cb.id and s.status in ('danado','cortado')) as lastimados
  from public.fiber_cables cb
  left join public.zones z on z.id = cb.zone_id
  left join public.network_elements ef on ef.id = cb.from_id
  left join public.network_elements et on et.id = cb.to_id;

comment on view public.v_cables is
  'Los cables con el conteo de sus hilos por estado. «Libres» es el número que '
  'se necesita para decidir si se puede colgar a alguien más.';

drop view if exists public.v_hilos;
create view public.v_hilos with (security_invoker = true) as
select s.id,
       s.org_id,
       s.cable_id,
       cb.code as cable,
       cb.zone_id,
       s.strand_number,
       s.tube_number,
       s.color,
       s.status,
       s.notes,
       (select count(*) from public.fiber_splices f
         where f.status = 'activa'
           and (f.in_strand_id = s.id or f.out_strand_id = s.id))  as fusiones
  from public.fiber_strands s
  join public.fiber_cables cb on cb.id = s.cable_id;

drop view if exists public.v_fusiones;
create view public.v_fusiones with (security_invoker = true) as
select f.id,
       f.org_id,
       f.closure_id,
       ne.code    as caja,
       ne.name    as caja_nombre,
       z.name     as zona,
       f.splice_type,
       f.loss_db,
       f.status,
       f.notes,
       f.created_at,
       ci.code    as cable_entra,
       si.strand_number as hilo_entra,
       si.color   as color_entra,
       f.in_strand_id,
       co.code    as cable_sale,
       so.strand_number as hilo_sale,
       so.color   as color_sale,
       f.out_strand_id,
       d.code     as destino,
       d.element_type as destino_tipo,
       f.to_element_id
  from public.fiber_splices f
  join public.network_elements ne on ne.id = f.closure_id
  left join public.zones z on z.id = ne.zone_id
  join public.fiber_strands si on si.id = f.in_strand_id
  join public.fiber_cables  ci on ci.id = si.cable_id
  left join public.fiber_strands so on so.id = f.out_strand_id
  left join public.fiber_cables  co on co.id = so.cable_id
  left join public.network_elements d on d.id = f.to_element_id;

drop view if exists public.v_puertos_nap;
create view public.v_puertos_nap with (security_invoker = true) as
select p.id,
       p.org_id,
       p.element_id,
       n.code   as nap,
       n.zone_id,
       z.name   as zona,
       p.port_number,
       p.status,
       p.rx_dbm,
       p.notes,
       p.service_id,
       c.id     as customer_id,
       c.full_name    as cliente,
       c.customer_code,
       -- La ventana de una ONT GPON. Fuera de ahí, el problema es óptico y no
       -- sirve de nada reiniciar el módem.
       case
         when p.rx_dbm is null then null
         when p.rx_dbm between -25 and -8 then 'bien'
         when p.rx_dbm >= -27 then 'al_limite'
         else 'mal'
       end as semaforo_rx
  from public.nap_ports p
  join public.network_elements n on n.id = p.element_id
  left join public.zones z on z.id = n.zone_id
  left join public.customer_services s on s.id = p.service_id
  left join public.customers c on c.id = s.customer_id;

-- ----------------------------------------------------------------------------
-- 4 · Impacto de un corte
-- ----------------------------------------------------------------------------
-- Cuántos clientes cuelgan de cada cable y de cada caja. Es una cuenta que se
-- hace en frío, para poder priorizar cuadrillas antes de que suene el
-- teléfono.
drop view if exists public.v_impacto_corte;
create view public.v_impacto_corte with (security_invoker = true) as
with recursive napes as (
  -- Cada NAP, con el hilo del que cuelga y cuántos clientes tiene puestos.
  select n.id                                     as nap_id,
         n.zone_id,
         coalesce(n.feed_strand_id,
                  (select f.in_strand_id from public.fiber_splices f
                    where f.to_element_id = n.id and f.status = 'activa' limit 1)
         )                                        as hilo,
         (select count(*) from public.nap_ports p
           where p.element_id = n.id and p.status = 'ocupado')::int as clientes
    from public.network_elements n
   where n.element_type = 'nap' and n.is_active
),
-- El camino completo de cada NAP hacia arriba. Sin esto, cortar el troncal
-- aparecería como que no afecta a nadie —porque la NAP cuelga del cable de
-- distribución, no del troncal— y esa es justo la respuesta equivocada.
camino as (
  select na.nap_id, na.clientes, na.hilo as hilo, null::uuid as caja,
         array[na.hilo] as vistos, 0 as salto
    from napes na
   where na.hilo is not null

  union all

  select c.nap_id, c.clientes,
         case when f.in_strand_id = c.hilo then f.out_strand_id else f.in_strand_id end,
         f.closure_id,
         c.vistos || case when f.in_strand_id = c.hilo then f.out_strand_id
                          else f.in_strand_id end,
         c.salto + 1
    from camino c
    join public.fiber_splices f
      on f.status = 'activa'
     and f.out_strand_id is not null
     and (f.in_strand_id = c.hilo or f.out_strand_id = c.hilo)
   where c.salto < 40
     and (case when f.in_strand_id = c.hilo then f.out_strand_id
               else f.in_strand_id end) <> all (c.vistos)
),
-- Una NAP puede tocar el mismo cable o la misma caja por varios lados. Se
-- cuenta UNA vez: si no, un cliente aparece dos veces y el número asusta de
-- más justo cuando hay que tomar decisiones rápido.
nap_cable as (
  select distinct c.nap_id, c.clientes, s.cable_id
    from camino c join public.fiber_strands s on s.id = c.hilo
),
nap_caja as (
  select distinct c.nap_id, c.clientes, c.caja
    from camino c where c.caja is not null
  union
  select distinct na.nap_id, na.clientes, f.closure_id
    from napes na
    join public.fiber_splices f on f.to_element_id = na.nap_id and f.status = 'activa'
),
por_cable as (
  select cable_id, sum(clientes)::int as clientes, count(*)::int as naps
    from nap_cable group by cable_id
),
por_caja as (
  select caja, sum(clientes)::int as clientes, count(*)::int as naps
    from nap_caja group by caja
)
select 'cable'::text          as tipo,
       cb.id                  as id,
       cb.code                as elemento,
       z.name                 as zona,
       coalesce(pc.clientes, 0) as clientes_afectados,
       coalesce(pc.naps, 0)     as naps_afectadas,
       cb.org_id
  from public.fiber_cables cb
  left join por_cable pc on pc.cable_id = cb.id
  left join public.zones z on z.id = cb.zone_id
 where cb.is_active
union all
select 'caja',
       ne.id,
       ne.code,
       z.name,
       coalesce(pj.clientes, 0),
       coalesce(pj.naps, 0),
       ne.org_id
  from public.network_elements ne
  left join por_caja pj on pj.caja = ne.id
  left join public.zones z on z.id = ne.zone_id
 where ne.element_type in ('closure','splitter') and ne.is_active;

comment on view public.v_impacto_corte is
  'Cuánta gente se queda sin internet si se corta cada cable o falla cada '
  'caja. Sigue el camino completo de cada NAP hacia arriba, no solo el cable '
  'del que cuelga: cortar el troncal tumba todo lo que va detrás.';

grant select on public.v_cables, public.v_hilos, public.v_fusiones,
                public.v_puertos_nap, public.v_impacto_corte to authenticated;

revoke all on function public.trazar_hilo(uuid) from public, anon;
revoke all on function public.trazar_cliente(uuid) from public, anon;
grant execute on function public.trazar_hilo(uuid) to authenticated;
grant execute on function public.trazar_cliente(uuid) to authenticated;
