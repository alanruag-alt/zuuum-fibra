-- ============================================================================
-- 034 · El sitio como principio de la red: OLT, tarjetas, PON y ODF
--
-- Hasta aquí la red empezaba en el aire: había cables con hilos, pero nada
-- decía de qué puerto de qué OLT salía la luz. Por eso «¿qué clientes se caen
-- si truena el PON 0/1/3?» no se podía contestar.
--
-- La cadena que se cierra en este archivo es la de adentro de la caseta:
--
--   Sitio → OLT → tarjeta → puerto PON → (patch) → puerto del ODF → hilo
--
-- De ahí para afuera ya existía. Lo que faltaba era el amarre.
--
--   abrir_tarjeta()        la tarjeta con sus puertos PON, de un jalón
--   abrir_puertos_odf()    las bandejas del ODF con sus puertos
--   patchear()             el latiguillo del PON al puerto del ODF
--   despatchear()          quitarlo, diciendo qué se queda sin luz
--   arrancar_cable()       de qué puerto del ODF sale el hilo del troncal
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Lo que le faltaba a cada cosa para tener ficha
-- ----------------------------------------------------------------------------
/*
 * Sitio, GPS, estado, fecha, responsable, potencia y observaciones. Van como
 * columnas y no como una tabla aparte de «atributos» a propósito: un campo
 * suelto en una tabla genérica no se puede validar ni indexar, y a los seis
 * meses nadie sabe qué claves existen.
 */
alter table public.network_elements
  add column if not exists site_id      uuid references public.network_sites(id) on delete set null,
  add column if not exists installed_by uuid references public.profiles(id) on delete set null,
  add column if not exists status       text not null default 'en_servicio',
  add column if not exists power_dbm    numeric(6,2);

alter table public.network_elements drop constraint if exists network_elements_status_check;
alter table public.network_elements add constraint network_elements_status_check
  check (status in ('en_servicio','planeado','instalado','reservado','danado','retirado'));

comment on column public.network_elements.site_id is
  'De qué sitio depende. Un ODF vive dentro de su caseta; una NAP cuelga del sitio que la alimenta.';
comment on column public.network_elements.power_dbm is
  'Potencia óptica medida en este punto. La de la NAP es la que decide si el cliente va a tener señal.';

alter table public.fiber_cables
  add column if not exists site_id      uuid references public.network_sites(id) on delete set null,
  add column if not exists installed_at date,
  add column if not exists installed_by uuid references public.profiles(id) on delete set null,
  add column if not exists status       text not null default 'en_servicio';

alter table public.fiber_cables drop constraint if exists fiber_cables_status_check;
alter table public.fiber_cables add constraint fiber_cables_status_check
  check (status in ('en_servicio','planeado','instalado','reservado','danado','retirado'));

alter table public.network_devices
  add column if not exists installed_at date,
  add column if not exists installed_by uuid references public.profiles(id) on delete set null;

alter table public.network_sites
  add column if not exists installed_at date,
  add column if not exists installed_by uuid references public.profiles(id) on delete set null,
  add column if not exists notes        text;

-- ----------------------------------------------------------------------------
-- 2 · Los puertos del ODF
-- ----------------------------------------------------------------------------
/*
 * El ODF es el mostrador de la caseta: por un lado llegan los latiguillos de
 * la OLT, por el otro salen los cables a la calle. Cada puerto es un renglón
 * porque cada puerto es una decisión física: alguien enchufó algo ahí.
 *
 * Un puerto tiene a lo mucho DOS amarres:
 *   · de dónde le llega la luz  → pon_port_id
 *   · a dónde la manda          → out_strand_id (el hilo del cable)
 *
 * Y ninguno de los dos se puede repetir. Ahí viven las dos primeras
 * validaciones, escritas como índices para que no dependan de que alguien se
 * acuerde de revisarlas.
 */
create table if not exists public.odf_ports (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  odf_id        uuid not null references public.network_elements(id) on delete cascade,
  tray_number   integer not null default 1 check (tray_number > 0),
  port_number   integer not null check (port_number > 0),
  pon_port_id   uuid references public.pon_ports(id) on delete set null,
  out_strand_id uuid references public.fiber_strands(id) on delete set null,
  connector     text,
  power_dbm     numeric(6,2),
  status        text not null default 'libre'
                check (status in ('libre','ocupado','reservado','danado')),
  installed_at  date,
  installed_by  uuid references public.profiles(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint odf_ports_unico unique (odf_id, tray_number, port_number)
);

comment on table public.odf_ports is
  'Cada puerto del distribuidor, con qué PON le entra y qué hilo sale.';
comment on column public.odf_ports.connector is
  'SC/APC, SC/UPC, LC… Importa: mezclarlos cuesta 0.5 dB y una visita.';

/*
 * Validación 1 · Un puerto PON no se conecta dos veces DIRECTAMENTE.
 *
 * El índice dice exactamente eso: un PON aparece en un solo puerto del ODF.
 * El «salvo que exista un divisor» de la regla no es una excepción a esto: es
 * lo que pasa después. El PON llega a UN puerto, ese puerto alimenta un
 * splitter, y el splitter reparte. Así el reparto queda registrado como
 * splitter y no como dos latiguillos que nadie sabe explicar.
 */
create unique index if not exists odf_ports_pon_unico
  on public.odf_ports(pon_port_id) where pon_port_id is not null;

/*
 * Validación 2 · Un puerto del ODF no puede tener más de una conexión.
 *
 * Es el unique de arriba por el lado del PON, y este por el lado del hilo: un
 * hilo sale de un solo puerto. Dos puertos apuntando al mismo hilo significa
 * que alguien capturó dos veces el mismo latiguillo.
 */
create unique index if not exists odf_ports_hilo_unico
  on public.odf_ports(out_strand_id) where out_strand_id is not null;

create index if not exists odf_ports_odf_idx on public.odf_ports(odf_id, tray_number, port_number);

select public.poner_tocar_actualizado('odf_ports');

alter table public.odf_ports enable row level security;

create policy odf_puertos_lectura on public.odf_ports for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy odf_puertos_escritura on public.odf_ports for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

grant select, insert, update, delete on public.odf_ports to authenticated;
select public.poner_auditoria('odf_ports');

-- ----------------------------------------------------------------------------
-- 3 · La tarjeta de la OLT, con sus puertos PON de un jalón
-- ----------------------------------------------------------------------------
/*
 * Nadie captura 16 puertos a mano. Se dice cuántos trae la tarjeta y salen
 * solos, numerados como los numera la marca: Huawei empieza en 0, VSOL en 1.
 * Guardarlos como los dice el equipo evita el error de campo más caro que hay,
 * que es irse al puerto de junto.
 */
create or replace function public.abrir_tarjeta(
  p_olt      uuid,
  p_slot     int,
  p_tipo     text default null,
  p_puertos  int  default 16,
  p_desde_cero boolean default false,
  p_max_onus int  default 128
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_dev  record;
  v_id   uuid;
  v_ini  int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select id, device_type, name into v_dev
    from public.network_devices where id = p_olt and org_id = v_org;

  if v_dev.id is null then
    raise exception 'Esa OLT no existe';
  end if;
  if v_dev.device_type <> 'olt' then
    raise exception 'Las tarjetas van en una OLT, y % está dado de alta como otro tipo de equipo.',
      v_dev.name;
  end if;
  if p_puertos < 1 or p_puertos > 64 then
    raise exception 'Una tarjeta trae entre 1 y 64 puertos, no %.', p_puertos;
  end if;

  insert into public.olt_cards (org_id, device_id, slot_number, card_type, port_count)
  values (v_org, p_olt, p_slot, p_tipo, p_puertos)
  on conflict (device_id, slot_number) do update
     set card_type = coalesce(excluded.card_type, public.olt_cards.card_type),
         port_count = excluded.port_count
  returning id into v_id;

  v_ini := case when p_desde_cero then 0 else 1 end;

  insert into public.pon_ports (org_id, card_id, port_number, max_onus)
  select v_org, v_id, n, p_max_onus
    from generate_series(v_ini, v_ini + p_puertos - 1) as n
  on conflict (card_id, port_number) do nothing;

  return v_id;
end;
$$;

comment on function public.abrir_tarjeta is
  'Da de alta una tarjeta de la OLT y le crea sus puertos PON numerados como la marca.';

-- ----------------------------------------------------------------------------
-- 4 · Las bandejas del ODF
-- ----------------------------------------------------------------------------
create or replace function public.abrir_puertos_odf(
  p_odf         uuid,
  p_bandejas    int default 1,
  p_por_bandeja int default 12,
  p_conector    text default 'SC/APC'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_el  record;
  v_n   int := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select id, element_type, code into v_el
    from public.network_elements where id = p_odf and org_id = v_org;

  if v_el.id is null then
    raise exception 'Ese ODF no existe';
  end if;
  if v_el.element_type <> 'odf' then
    raise exception 'Las bandejas van en un ODF, y % está capturado como otra cosa.', v_el.code;
  end if;

  insert into public.odf_ports (org_id, odf_id, tray_number, port_number, connector)
  select v_org, p_odf, b, p, p_conector
    from generate_series(1, greatest(p_bandejas, 1)) as b,
         generate_series(1, greatest(p_por_bandeja, 1)) as p
  on conflict (odf_id, tray_number, port_number) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.abrir_puertos_odf is
  'Crea las bandejas del ODF con sus puertos. No pisa los que ya existían.';

-- ----------------------------------------------------------------------------
-- 5 · El latiguillo: PON → puerto del ODF
-- ----------------------------------------------------------------------------
/*
 * Este es el amarre que le faltaba a todo. Sin él, la fibra de la calle no
 * tiene de dónde venir, y la pregunta que importa —«¿a quién dejo sin
 * internet si desconecto este puerto?»— no tiene respuesta.
 *
 * Se niega a hacer lo que en la caseta tampoco se puede hacer: enchufar un
 * PON que ya está enchufado en otro lado, u ocupar un puerto que ya tiene
 * algo. Y cuando se niega dice DÓNDE está lo que estorba, porque «ocupado» sin
 * decir dónde obliga a revisar bandeja por bandeja.
 */
create or replace function public.patchear(
  p_pon      uuid,
  p_odf_port uuid,
  p_potencia numeric default null,
  p_notas    text    default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_pon   record;
  v_pto   record;
  v_donde record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select pp.id, pp.port_number, ca.slot_number, d.name as olt
    into v_pon
    from public.pon_ports pp
    join public.olt_cards ca on ca.id = pp.card_id
    join public.network_devices d on d.id = ca.device_id
   where pp.id = p_pon and pp.org_id = v_org;

  if v_pon.id is null then
    raise exception 'Ese puerto PON no existe';
  end if;

  select op.id, op.tray_number, op.port_number, op.pon_port_id, e.code as odf
    into v_pto
    from public.odf_ports op
    join public.network_elements e on e.id = op.odf_id
   where op.id = p_odf_port and op.org_id = v_org;

  if v_pto.id is null then
    raise exception 'Ese puerto del ODF no existe';
  end if;

  -- Validación 1, con el recado completo.
  select e.code as odf, op.tray_number, op.port_number into v_donde
    from public.odf_ports op
    join public.network_elements e on e.id = op.odf_id
   where op.pon_port_id = p_pon and op.id <> p_odf_port;

  if v_donde.odf is not null then
    raise exception
      'El PON %/% de % ya está patcheado en % bandeja % puerto %. Un PON va a un solo lugar; si necesitas repartirlo, se hace con un splitter, no con dos latiguillos.',
      v_pon.slot_number, v_pon.port_number, v_pon.olt,
      v_donde.odf, v_donde.tray_number, v_donde.port_number;
  end if;

  -- Validación 2.
  if v_pto.pon_port_id is not null and v_pto.pon_port_id <> p_pon then
    raise exception
      'La bandeja % puerto % de % ya tiene otro PON conectado. Quítalo primero.',
      v_pto.tray_number, v_pto.port_number, v_pto.odf;
  end if;

  update public.odf_ports
     set pon_port_id = p_pon,
         status = 'ocupado',
         power_dbm = coalesce(p_potencia, power_dbm),
         notes = coalesce(p_notas, notes),
         installed_at = coalesce(installed_at, current_date),
         installed_by = coalesce(installed_by, auth.uid()),
         updated_at = now()
   where id = p_odf_port;

  return format('PON %s/%s de %s conectado a %s bandeja %s puerto %s.',
                v_pon.slot_number, v_pon.port_number, v_pon.olt,
                v_pto.odf, v_pto.tray_number, v_pto.port_number);
end;
$$;

comment on function public.patchear is
  'Conecta un puerto PON de la OLT a un puerto del ODF. Un PON, un puerto.';

-- ----------------------------------------------------------------------------
create or replace function public.despatchear(p_odf_port uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_pto record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select op.id, op.out_strand_id, e.code as odf, op.tray_number, op.port_number
    into v_pto
    from public.odf_ports op
    join public.network_elements e on e.id = op.odf_id
   where op.id = p_odf_port and op.org_id = v_org;

  if v_pto.id is null then
    raise exception 'Ese puerto del ODF no existe';
  end if;

  update public.odf_ports
     set pon_port_id = null,
         status = case when out_strand_id is null then 'libre' else status end,
         updated_at = now()
   where id = p_odf_port;

  -- Si el puerto sigue teniendo cable, se avisa: ese cable acaba de quedarse
  -- sin luz aunque la fibra siga físicamente ahí.
  if v_pto.out_strand_id is not null then
    return format(
      'Latiguillo quitado de %s bandeja %s puerto %s. Ojo: el cable que sale de ahí se queda sin señal hasta que le conectes otro PON.',
      v_pto.odf, v_pto.tray_number, v_pto.port_number);
  end if;

  return format('Latiguillo quitado de %s bandeja %s puerto %s.',
                v_pto.odf, v_pto.tray_number, v_pto.port_number);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6 · De qué puerto del ODF arranca el cable
-- ----------------------------------------------------------------------------
/*
 * El principio del recorrido de afuera. Se amarra un HILO —no el cable— porque
 * un cable de 24 hilos sale del ODF por 24 puertos distintos, o por uno solo
 * si nada más se usó un hilo. Amarrar el cable completo sería mentir.
 */
create or replace function public.arrancar_cable(
  p_odf_port uuid,
  p_hilo     uuid,
  p_potencia numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_pto   record;
  v_hilo  record;
  v_otro  record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select op.id, op.tray_number, op.port_number, op.out_strand_id, op.pon_port_id, e.code as odf
    into v_pto
    from public.odf_ports op
    join public.network_elements e on e.id = op.odf_id
   where op.id = p_odf_port and op.org_id = v_org;

  if v_pto.id is null then
    raise exception 'Ese puerto del ODF no existe';
  end if;

  select s.id, s.strand_number, s.color, s.status, c.code as cable
    into v_hilo
    from public.fiber_strands s
    join public.fiber_cables c on c.id = s.cable_id
   where s.id = p_hilo and s.org_id = v_org;

  if v_hilo.id is null then
    raise exception 'Ese hilo no existe';
  end if;

  -- Validación 3 · el hilo no puede estar arrancando en dos puertos.
  select e.code as odf, op.tray_number, op.port_number into v_otro
    from public.odf_ports op
    join public.network_elements e on e.id = op.odf_id
   where op.out_strand_id = p_hilo and op.id <> p_odf_port;

  if v_otro.odf is not null then
    raise exception
      'El hilo % (%) de % ya sale de % bandeja % puerto %. Un hilo tiene un solo origen.',
      v_hilo.strand_number, v_hilo.color, v_hilo.cable,
      v_otro.odf, v_otro.tray_number, v_otro.port_number;
  end if;

  if v_pto.out_strand_id is not null and v_pto.out_strand_id <> p_hilo then
    raise exception
      'De % bandeja % puerto % ya sale otro hilo. Un puerto, un hilo.',
      v_pto.odf, v_pto.tray_number, v_pto.port_number;
  end if;

  update public.odf_ports
     set out_strand_id = p_hilo,
         status = 'ocupado',
         power_dbm = coalesce(p_potencia, power_dbm),
         installed_at = coalesce(installed_at, current_date),
         installed_by = coalesce(installed_by, auth.uid()),
         updated_at = now()
   where id = p_odf_port;

  update public.fiber_strands
     set status = case when status = 'disponible' then 'en_servicio' else status end,
         updated_at = now()
   where id = p_hilo;

  return format('El hilo %s (%s) de %s arranca en %s bandeja %s puerto %s.',
                v_hilo.strand_number, v_hilo.color, v_hilo.cable,
                v_pto.odf, v_pto.tray_number, v_pto.port_number);
end;
$$;

-- ----------------------------------------------------------------------------
create or replace function public.soltar_cable(p_odf_port uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_h   uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select out_strand_id into v_h from public.odf_ports
   where id = p_odf_port and org_id = v_org;

  update public.odf_ports
     set out_strand_id = null,
         status = case when pon_port_id is null then 'libre' else status end,
         updated_at = now()
   where id = p_odf_port and org_id = v_org;

  if not found then
    raise exception 'Ese puerto del ODF no existe';
  end if;

  return 'El cable ya no sale de ese puerto.';
end;
$$;

-- ----------------------------------------------------------------------------
-- 7 · Vistas
-- ----------------------------------------------------------------------------
create or replace view public.v_tarjetas with (security_invoker = true) as
select ca.id,
       ca.org_id,
       ca.device_id,
       d.name                                                            as olt,
       d.vendor,
       d.model,
       s.name                                                            as sitio,
       ca.slot_number,
       ca.card_type,
       ca.port_count,
       ca.status,
       (select count(*) from public.pon_ports p where p.card_id = ca.id) as puertos,
       (select count(*) from public.pon_ports p
          join public.odf_ports o on o.pon_port_id = p.id
         where p.card_id = ca.id)                                        as patcheados
  from public.olt_cards ca
  join public.network_devices d on d.id = ca.device_id
  left join public.network_sites s on s.id = d.site_id;

comment on view public.v_tarjetas is
  'Las tarjetas de cada OLT y cuántos de sus puertos ya están patcheados al ODF.';

create or replace view public.v_puertos_pon with (security_invoker = true) as
select pp.id,
       pp.org_id,
       pp.card_id,
       ca.device_id,
       d.name                     as olt,
       s.id                       as site_id,
       s.name                     as sitio,
       ca.slot_number,
       pp.port_number,
       -- Como se dice en el equipo y en la boca de todos: 0/1/3.
       concat_ws('/', '0', ca.slot_number::text, pp.port_number::text) as etiqueta,
       pp.max_onus,
       pp.used_onus,
       pp.status,
       op.id                      as odf_port_id,
       e.code                     as odf,
       op.tray_number,
       op.port_number             as odf_port_number,
       op.out_strand_id,
       c.code                     as cable,
       st.strand_number,
       st.color                   as color_hilo
  from public.pon_ports pp
  join public.olt_cards ca on ca.id = pp.card_id
  join public.network_devices d on d.id = ca.device_id
  left join public.network_sites s on s.id = d.site_id
  left join public.odf_ports op on op.pon_port_id = pp.id
  left join public.network_elements e on e.id = op.odf_id
  left join public.fiber_strands st on st.id = op.out_strand_id
  left join public.fiber_cables c on c.id = st.cable_id;

comment on view public.v_puertos_pon is
  'Cada puerto PON con a qué puerto del ODF llega y qué hilo sale de ahí. '
  'Es el renglón que contesta «de dónde sale la luz de este cable».';

create or replace view public.v_puertos_odf with (security_invoker = true) as
select op.id,
       op.org_id,
       op.odf_id,
       e.code                     as odf,
       e.site_id,
       s.name                     as sitio,
       op.tray_number,
       op.port_number,
       op.connector,
       op.status,
       op.power_dbm,
       op.notes,
       op.installed_at,
       pp.id                      as pon_port_id,
       d.name                     as olt,
       ca.slot_number,
       pp.port_number             as pon_number,
       concat_ws('/', '0', ca.slot_number::text, pp.port_number::text) as pon,
       op.out_strand_id,
       c.code                     as cable,
       st.strand_number,
       st.color                   as color_hilo
  from public.odf_ports op
  join public.network_elements e on e.id = op.odf_id
  left join public.network_sites s on s.id = e.site_id
  left join public.pon_ports pp on pp.id = op.pon_port_id
  left join public.olt_cards ca on ca.id = pp.card_id
  left join public.network_devices d on d.id = ca.device_id
  left join public.fiber_strands st on st.id = op.out_strand_id
  left join public.fiber_cables c on c.id = st.cable_id;

comment on view public.v_puertos_odf is
  'La bandeja completa: qué PON entra y qué hilo sale de cada puerto.';

/*
 * El sitio de un vistazo. Es la pantalla que un dueño de ISP abre para saber
 * cuánto le queda de capacidad antes de tener que comprar otra tarjeta.
 */
create or replace view public.v_sitio_red with (security_invoker = true) as
select s.id,
       s.org_id,
       s.name,
       s.type,
       s.zone_id,
       z.name as zona,
       s.latitude,
       s.longitude,
       s.is_active,
       (select count(*) from public.network_devices d
         where d.site_id = s.id and d.device_type = 'olt' and d.is_active)      as olts,
       (select count(*) from public.olt_cards ca
          join public.network_devices d on d.id = ca.device_id
         where d.site_id = s.id)                                                as tarjetas,
       (select count(*) from public.pon_ports pp
          join public.olt_cards ca on ca.id = pp.card_id
          join public.network_devices d on d.id = ca.device_id
         where d.site_id = s.id)                                                as puertos_pon,
       (select count(*) from public.pon_ports pp
          join public.olt_cards ca on ca.id = pp.card_id
          join public.network_devices d on d.id = ca.device_id
          join public.odf_ports op on op.pon_port_id = pp.id
         where d.site_id = s.id)                                                as pon_patcheados,
       (select count(*) from public.network_elements e
         where e.site_id = s.id and e.element_type = 'odf' and e.is_active)      as odfs,
       (select count(*) from public.odf_ports op
          join public.network_elements e on e.id = op.odf_id
         where e.site_id = s.id)                                                as puertos_odf,
       (select count(*) from public.odf_ports op
          join public.network_elements e on e.id = op.odf_id
         where e.site_id = s.id and op.status = 'libre')                        as odf_libres
  from public.network_sites s
  left join public.zones z on z.id = s.zone_id;

comment on view public.v_sitio_red is
  'El sitio con lo que tiene adentro: OLT, tarjetas, PON, ODF y cuánto le queda libre.';

-- ----------------------------------------------------------------------------
-- 8 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.abrir_tarjeta(uuid, int, text, int, boolean, int) from public, anon;
revoke all on function public.abrir_puertos_odf(uuid, int, int, text)           from public, anon;
revoke all on function public.patchear(uuid, uuid, numeric, text)               from public, anon;
revoke all on function public.despatchear(uuid)                                 from public, anon;
revoke all on function public.arrancar_cable(uuid, uuid, numeric)               from public, anon;
revoke all on function public.soltar_cable(uuid)                                from public, anon;

grant execute on function public.abrir_tarjeta(uuid, int, text, int, boolean, int) to authenticated;
grant execute on function public.abrir_puertos_odf(uuid, int, int, text)           to authenticated;
grant execute on function public.patchear(uuid, uuid, numeric, text)               to authenticated;
grant execute on function public.despatchear(uuid)                                 to authenticated;
grant execute on function public.arrancar_cable(uuid, uuid, numeric)               to authenticated;
grant execute on function public.soltar_cable(uuid)                                to authenticated;
