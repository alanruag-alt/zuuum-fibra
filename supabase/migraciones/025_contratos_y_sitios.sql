-- ============================================================================
-- 025 · Contratos y sitios
-- ============================================================================
-- Faltaban dos piezas para cerrar el sistema:
--
--   · El contrato. Hasta hoy el cliente se daba de alta y el papel se hacía
--     aparte, a mano, en Word. Cuando alguien reclama «yo nunca firmé eso»
--     no hay con qué contestarle. Aquí el contrato nace con folio de zona,
--     se amarra al servicio y queda con fecha.
--
--   · Los sitios. Las torres y los POP ya existían como tabla desde la 010,
--     pero nadie los podía ver ni capturar desde el panel. Sin sitios, la
--     mitad de la red —la que va por antena, que es la mayoría del padrón—
--     era invisible.
--
-- Nada de esto inventa reglas nuevas: usa los folios de la 007, los permisos
-- de la 017 y las políticas de la 015 tal como están.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Contratos
-- ----------------------------------------------------------------------------
-- Un contrato se genera a partir de un servicio que ya existe. Eso importa:
-- no se firma un papel por un internet que todavía no está instalado.
-- ----------------------------------------------------------------------------
create or replace function public.generar_contrato(
  p_servicio uuid,
  p_inicio   date default null,
  p_meses    int  default null,
  p_activar  boolean default true
)
returns table (contrato_id uuid, contract_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_s      record;
  v_zona   uuid;
  v_folio  text;
  v_id     uuid;
  v_inicio date := coalesce(p_inicio, current_date);
  v_fin    date;
  v_intento int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('contracts.write') then
    raise exception 'No tienes permiso para generar contratos' using errcode = '42501';
  end if;

  select s.*, c.zone_id as cliente_zona, c.full_name
    into v_s
    from public.customer_services s
    join public.customers c on c.id = s.customer_id
   where s.id = p_servicio and s.org_id = v_org;

  if v_s.id is null then
    raise exception 'Ese servicio no existe';
  end if;

  -- Un servicio no puede tener dos contratos vivos: si ya tiene uno, se
  -- devuelve ese en vez de duplicar el papel.
  if v_s.contract_id is not null then
    select ct.id, ct.contract_number into contrato_id, contract_number
      from public.contracts ct
     where ct.id = v_s.contract_id and ct.status <> 'cancelled';
    if contrato_id is not null then
      return next;
      return;
    end if;
  end if;

  v_zona := v_s.cliente_zona;
  if v_zona is null then
    raise exception 'Ese cliente no tiene zona, y el folio del contrato sale de la zona';
  end if;

  -- El mismo cuidado que en convertir_prospecto: el contador y la realidad
  -- pueden estar desfasados si alguna vez se cargaron folios a mano.
  for v_intento in 1..50 loop
    v_folio := public.siguiente_folio(v_org, v_zona, 'contract');
    exit when not exists (select 1 from public.contracts ct
                           where ct.org_id = v_org and ct.contract_number = v_folio);
  end loop;

  if p_meses is not null and p_meses > 0 then
    v_fin := v_inicio + (p_meses || ' months')::interval;
  end if;

  insert into public.contracts
    (org_id, customer_id, contract_number, plan_id, start_date, end_date,
     status, created_by)
  values
    (v_org, v_s.customer_id, v_folio, v_s.plan_id, v_inicio, v_fin,
     case when p_activar then 'active' else 'draft' end, auth.uid())
  returning id into v_id;

  update public.customer_services
     set contract_id = v_id, updated_at = now()
   where id = p_servicio;

  contrato_id     := v_id;
  contract_number := v_folio;
  return next;
end;
$$;

comment on function public.generar_contrato is
  'Genera el contrato de un servicio con folio de su zona. Si ya tenía uno '
  'vivo, devuelve ese: nadie necesita dos papeles del mismo internet.';

-- ----------------------------------------------------------------------------
create or replace function public.firmar_contrato(
  p_contrato uuid,
  p_pdf      text default null
)
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
  if not public.auth_has('contracts.write') then
    raise exception 'No tienes permiso para firmar contratos' using errcode = '42501';
  end if;

  update public.contracts
     set status     = 'active',
         signed_at  = coalesce(signed_at, now()),
         pdf_url    = coalesce(p_pdf, pdf_url),
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_contrato and org_id = v_org and status <> 'cancelled';

  if not found then
    raise exception 'Ese contrato no existe o ya estaba cancelado';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
create or replace function public.cancelar_contrato(
  p_contrato uuid,
  p_motivo   text default null
)
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
  if not public.auth_has('contracts.write') then
    raise exception 'No tienes permiso para cancelar contratos' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Un contrato no se cancela sin decir por qué';
  end if;

  update public.contracts
     set status     = 'cancelled',
         end_date   = coalesce(end_date, current_date),
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_contrato and org_id = v_org;

  if not found then
    raise exception 'Ese contrato no existe';
  end if;

  -- El servicio se queda sin contrato amarrado, pero no se toca: cancelar el
  -- papel no es lo mismo que cortarle el internet a alguien.
  update public.customer_services
     set contract_id = null, updated_at = now()
   where contract_id = p_contrato;
end;
$$;

comment on function public.cancelar_contrato is
  'Cancela el papel, no el servicio. Son dos decisiones distintas y se toman '
  'por separado a propósito.';

-- ----------------------------------------------------------------------------
-- 2 · Sitios de red
-- ----------------------------------------------------------------------------
-- guardar_sitio ya existe en la 024. Aquí solo falta poder verlos.
-- ----------------------------------------------------------------------------
drop view if exists public.v_sitios;
create view public.v_sitios with (security_invoker = true) as
select s.id,
       s.org_id,
       s.name,
       s.type,
       s.zone_id,
       z.name          as zona,
       s.latitude,
       s.longitude,
       s.elevation_m,
       s.height_m,
       s.access_notes,
       s.is_active,
       (select count(*) from public.network_devices d
         where d.site_id = s.id and d.is_active)                             as dispositivos,
       -- 'offline' es el único estado que significa «no contesta». 'unknown'
       -- es «todavía no lo hemos sondeado» y 'maintenance' es a propósito;
       -- contarlos como caídos llenaría la pantalla de alarmas falsas.
       (select count(*) from public.network_devices d
         where d.site_id = s.id and d.is_active and d.status = 'offline')    as caidos
  from public.network_sites s
  left join public.zones z on z.id = s.zone_id;

comment on view public.v_sitios is
  'Torres, POP y casetas de OLT, con cuántos equipos viven ahí y cuántos no '
  'están respondiendo.';

-- ----------------------------------------------------------------------------
drop view if exists public.v_contratos;
create view public.v_contratos with (security_invoker = true) as
select ct.id,
       ct.org_id,
       ct.contract_number,
       ct.status,
       ct.start_date,
       ct.end_date,
       ct.signed_at,
       ct.pdf_url,
       ct.created_at,
       ct.customer_id,
       c.full_name     as cliente,
       c.customer_code,
       c.phone         as telefono,
       c.zone_id,
       z.name          as zona,
       p.name          as plan,
       p.price         as precio_plan,
       s.id            as servicio_id,
       s.status        as estado_servicio,
       s.network_type,
       coalesce(s.custom_price, p.price)                                     as mensualidad,
       -- Un contrato sin firma es un contrato que no sirve de nada el día que
       -- hay que cobrarlo en un juzgado. Se marca aparte a propósito.
       (ct.signed_at is null and ct.status = 'active')                       as sin_firmar
  from public.contracts ct
  left join public.customers c on c.id = ct.customer_id
  left join public.zones z on z.id = c.zone_id
  left join public.service_plans p on p.id = ct.plan_id
  left join public.customer_services s on s.contract_id = ct.id;

comment on view public.v_contratos is
  'Los contratos con su cliente, su plan y su servicio. sin_firmar es la '
  'columna que importa: son los que hay que ir a buscar.';

-- ----------------------------------------------------------------------------
-- 3 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.generar_contrato(uuid, date, int, boolean) from public, anon;
revoke all on function public.firmar_contrato(uuid, text) from public, anon;
revoke all on function public.cancelar_contrato(uuid, text) from public, anon;

grant execute on function public.generar_contrato(uuid, date, int, boolean) to authenticated;
grant execute on function public.firmar_contrato(uuid, text) to authenticated;
grant execute on function public.cancelar_contrato(uuid, text) to authenticated;

grant select on public.v_sitios, public.v_contratos to authenticated;
