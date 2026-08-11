-- ============================================================================
-- 039 · Racks: el sitio por dentro, unidad por unidad
--
-- Un sitio deja de ser una lista de equipos y pasa a ser lo que de verdad es:
-- uno o varios gabinetes con sus unidades, y cada equipo ocupando las U que
-- ocupa. Eso sirve para tres cosas concretas:
--
--   · Saber si cabe otra tarjeta antes de comprarla.
--   · Encontrar el equipo a las dos de la mañana: «OLT-01, rack A, U36».
--   · Que el patcheo PON → ODF se vea, en vez de imaginárselo.
--
-- La regla de que dos equipos no se encimen NO va como código: va como
-- restricción de exclusión de PostgreSQL. Un rango de unidades y un rack; si
-- se traslapan, la base se niega. No hay forma de brincarla ni desde la
-- pantalla, ni desde una consulta a mano, ni desde una importación.
-- ============================================================================

create extension if not exists btree_gist with schema extensions;

-- ----------------------------------------------------------------------------
-- 1 · El gabinete
-- ----------------------------------------------------------------------------
create table if not exists public.racks (
  id         uuid primary key default extensions.gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete restrict,
  site_id    uuid not null references public.network_sites(id) on delete cascade,
  name       text not null,
  units      int  not null default 42 check (units between 1 and 60),
  location   text,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint racks_nombre_unico unique (site_id, name)
);

comment on table public.racks is
  'Un gabinete dentro de un sitio. Las unidades se cuentan de abajo hacia arriba, como en la etiqueta.';
comment on column public.racks.units is
  'Altura útil. Las de catálogo son 6, 12, 24, 42 y 48, pero se acepta cualquiera: hay gabinetes raros.';

-- ----------------------------------------------------------------------------
-- 2 · Lo que va montado
-- ----------------------------------------------------------------------------
/*
 * Un renglón por equipo montado. Puede apuntar a una OLT —que ya vive en
 * network_devices con sus tarjetas y puertos— o a un ODF —que vive en
 * network_elements con sus bandejas—, o a nada: un organizador de cables no
 * necesita existir en otro lado, pero sí ocupa 1U y hay que dibujarlo.
 */
create table if not exists public.rack_items (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  rack_id     uuid not null references public.racks(id) on delete cascade,
  device_id   uuid references public.network_devices(id) on delete cascade,
  element_id  uuid references public.network_elements(id) on delete cascade,
  kind        text not null default 'otro'
              check (kind in ('olt','odf','switch','router','servidor',
                              'organizador','ups','patch','otro')),
  label       text not null,
  vendor      text,
  model       text,
  serial      text,
  -- La U de abajo del equipo. Se cuenta desde el piso, como está impreso en
  -- el gabinete: la 1 abajo. Un equipo en la 36 de 2U ocupa la 36 y la 37.
  position    int  not null check (position >= 1),
  height      int  not null default 1 check (height between 1 and 20),
  status      text not null default 'en_linea'
              check (status in ('en_linea','reservado','alarma',
                                'fuera_de_servicio','sin_documentar')),
  mgmt_ip     inet,
  installed_at date,
  installed_by uuid references public.profiles(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Apunta a una cosa o a ninguna, nunca a dos.
  constraint rack_items_una_referencia check (
    (device_id is null) or (element_id is null)
  )
);

comment on table public.rack_items is
  'Cada equipo montado con la U donde empieza y cuántas ocupa.';

/*
 * Validación · dos equipos no se encimen.
 *
 * Va como restricción de exclusión y no como revisión en la aplicación,
 * porque una revisión en la aplicación se brinca desde cualquier otra puerta:
 * una importación, una consulta a mano, un botón que alguien agregue mañana.
 * Esto se cumple siempre, y si dos personas guardan al mismo tiempo, una de
 * las dos rebota — que es exactamente lo que debe pasar.
 */
alter table public.rack_items drop constraint if exists rack_items_sin_encimar;
alter table public.rack_items add constraint rack_items_sin_encimar
  exclude using gist (
    rack_id with =,
    int4range(position, position + height) with &&
  );

create unique index if not exists rack_items_serie_unica
  on public.rack_items(org_id, upper(serial)) where serial is not null and serial <> '';

create index if not exists rack_items_rack_idx on public.rack_items(rack_id, position);

select public.poner_tocar_actualizado('racks');
select public.poner_tocar_actualizado('rack_items');

alter table public.racks      enable row level security;
alter table public.rack_items enable row level security;

drop policy if exists racks_lectura   on public.racks;
drop policy if exists racks_escritura on public.racks;
drop policy if exists items_lectura   on public.rack_items;
drop policy if exists items_escritura on public.rack_items;

create policy racks_lectura on public.racks for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy racks_escritura on public.racks for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy items_lectura on public.rack_items for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy items_escritura on public.rack_items for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

grant select, insert, update, delete on public.racks, public.rack_items to authenticated;
select public.poner_auditoria(t) from unnest(array['racks','rack_items']) as t;

-- ----------------------------------------------------------------------------
-- 3 · Que quepa dentro del gabinete
-- ----------------------------------------------------------------------------
/*
 * posición + altura - 1 ≤ capacidad del rack.
 *
 * Va en un disparador porque necesita mirar la altura del rack, y eso una
 * restricción de columna no lo puede hacer. El recado dice el número exacto,
 * no un «no cabe»: quien captura necesita saber hasta dónde llega.
 */
create or replace function public.revisar_cabe_en_rack()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_u int; v_nom text;
begin
  select units, name into v_u, v_nom from public.racks where id = new.rack_id;

  if v_u is null then
    raise exception 'Ese rack no existe';
  end if;

  if new.position + new.height - 1 > v_u then
    raise exception
      'No cabe: % es de %U y estás poniendo % de %U empezando en la U%, que llegaría hasta la U%. Empieza en la U% o más abajo.',
      v_nom, v_u, new.label, new.height, new.position,
      new.position + new.height - 1,
      greatest(v_u - new.height + 1, 1)
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cabe_en_rack on public.rack_items;
create trigger trg_cabe_en_rack
  before insert or update of position, height, rack_id on public.rack_items
  for each row execute function public.revisar_cabe_en_rack();

/*
 * Y al revés: bajarle la altura al rack no puede dejar equipos colgando en el
 * aire. Se dice cuáles estorban, con su U, para poder bajarlos primero.
 */
create or replace function public.revisar_altura_rack()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_fuera text;
begin
  if new.units >= old.units then return new; end if;

  select string_agg(format('%s (U%s-U%s)', label, position, position + height - 1), ', ')
    into v_fuera
    from public.rack_items
   where rack_id = new.id and position + height - 1 > new.units;

  if v_fuera is not null then
    raise exception
      'No se puede bajar % a %U: quedarían fuera %. Bájalos de lugar primero.',
      new.name, new.units, v_fuera
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_altura_rack on public.racks;
create trigger trg_altura_rack
  before update of units on public.racks
  for each row execute function public.revisar_altura_rack();

-- ----------------------------------------------------------------------------
-- 4 · Guardar y mover
-- ----------------------------------------------------------------------------
create or replace function public.guardar_rack(
  p_id      uuid default null,
  p_sitio   uuid default null,
  p_nombre  text default null,
  p_units   int  default 42,
  p_lugar   text default null,
  p_notas   text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  if p_id is null then
    if p_sitio is null then
      raise exception 'Un rack vive dentro de un sitio. Elige cuál.';
    end if;
    insert into public.racks (org_id, site_id, name, units, location, notes, created_by)
    values (v_org, p_sitio, coalesce(nullif(btrim(p_nombre), ''), 'Rack'),
            coalesce(p_units, 42), p_lugar, p_notas, auth.uid())
    returning id into v_id;
  else
    update public.racks
       set name = coalesce(nullif(btrim(p_nombre), ''), name),
           units = coalesce(p_units, units),
           location = coalesce(p_lugar, location),
           notes = coalesce(p_notas, notes),
           updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese rack no existe';
    end if;
  end if;

  return v_id;
end;
$$;

/*
 * Montar un equipo.
 *
 * Si es OLT o ODF, se amarra al equipo que ya existe: la OLT con sus tarjetas
 * y puertos PON, el ODF con sus bandejas. El rack no duplica esa información,
 * la ubica. Si se capturara aparte, en un mes el rack diría una cosa y la
 * pestaña de la OLT otra.
 */
create or replace function public.montar_en_rack(
  p_rack     uuid,
  p_label    text,
  p_kind     text    default 'otro',
  p_position int     default 1,
  p_height   int     default 1,
  p_device   uuid    default null,
  p_element  uuid    default null,
  p_vendor   text    default null,
  p_model    text    default null,
  p_serial   text    default null,
  p_ip       text    default null,
  p_estado   text    default 'en_linea',
  p_notas    text    default null,
  p_id       uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id  uuid;
  v_ya  text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  if p_label is null or length(btrim(p_label)) < 1 then
    raise exception 'Ponle nombre al equipo: sin nombre no se encuentra en el rack.';
  end if;

  -- La serie repetida casi siempre es un copiar y pegar, y cuesta caro: dos
  -- equipos con la misma serie hacen imposible reclamar una garantía.
  if p_serial is not null and btrim(p_serial) <> '' then
    select label into v_ya from public.rack_items
     where org_id = v_org and upper(serial) = upper(btrim(p_serial))
       and (p_id is null or id <> p_id);
    if v_ya is not null then
      raise exception 'Esa serie ya la tiene %. Revisa la etiqueta.', v_ya;
    end if;
  end if;

  if p_id is null then
    insert into public.rack_items
      (org_id, rack_id, device_id, element_id, kind, label, vendor, model, serial,
       position, height, status, mgmt_ip, installed_at, installed_by, notes)
    values
      (v_org, p_rack, p_device, p_element, coalesce(p_kind, 'otro'), btrim(p_label),
       p_vendor, p_model, nullif(btrim(p_serial), ''),
       p_position, p_height, coalesce(p_estado, 'en_linea'),
       nullif(btrim(coalesce(p_ip, '')), '')::inet, current_date, auth.uid(), p_notas)
    returning id into v_id;
  else
    update public.rack_items
       set rack_id = coalesce(p_rack, rack_id),
           device_id = p_device, element_id = p_element,
           kind = coalesce(p_kind, kind), label = btrim(p_label),
           vendor = p_vendor, model = p_model, serial = nullif(btrim(p_serial), ''),
           position = p_position, height = p_height,
           status = coalesce(p_estado, status),
           mgmt_ip = nullif(btrim(coalesce(p_ip, '')), '')::inet,
           notes = p_notas, updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese equipo no está montado en ningún rack';
    end if;
  end if;

  return v_id;
exception
  -- La restricción de exclusión habla en jerga; aquí se traduce a algo que
  -- se pueda leer parado frente al gabinete con el equipo en la mano.
  when exclusion_violation then
    select string_agg(format('%s (U%s-U%s)', label, position, position + height - 1), ', ')
      into v_ya
      from public.rack_items
     where rack_id = p_rack
       and (p_id is null or id <> p_id)
       and int4range(position, position + height) && int4range(p_position, p_position + p_height);
    raise exception
      'Esas unidades ya están ocupadas por %. Elige otras U, o baja ese equipo primero.',
      coalesce(v_ya, 'otro equipo');
end;
$$;

/*
 * Moverlo de lugar. Se separa de montar porque arrastrar en la pantalla manda
 * una sola cosa —la U nueva— y hacerlo pasar por el formulario completo
 * obligaría a reenviar todo lo demás y a arriesgarse a pisarlo.
 */
create or replace function public.mover_en_rack(p_id uuid, p_position int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_it  record;
  v_ya  text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select label, height, rack_id into v_it from public.rack_items
   where id = p_id and org_id = v_org;

  if v_it.label is null then
    raise exception 'Ese equipo no existe';
  end if;

  update public.rack_items set position = p_position, updated_at = now()
   where id = p_id and org_id = v_org;

  return format('%s quedó en la U%s%s.', v_it.label, p_position,
    case when v_it.height > 1 then format('-U%s', p_position + v_it.height - 1) else '' end);
exception
  when exclusion_violation then
    select string_agg(format('%s (U%s-U%s)', label, position, position + height - 1), ', ')
      into v_ya
      from public.rack_items
     where rack_id = v_it.rack_id and id <> p_id
       and int4range(position, position + height) && int4range(p_position, p_position + v_it.height);
    raise exception
      'Ahí ya está %. Elige unas unidades libres, o baja ese equipo de lugar primero.',
      coalesce(v_ya, 'otro equipo');
end;
$$;

/*
 * Bajarlo del rack.
 *
 * Una OLT con puertos patcheados y un ODF con puertos ocupados NO se bajan
 * sin más: en la vida real desmontarlos deja gente sin servicio, y aquí lo
 * mínimo es avisarlo con nombre y número. Se puede forzar, pero a propósito.
 */
create or replace function public.desmontar_del_rack(p_id uuid, p_forzar boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_it  record;
  v_n   int := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select label, kind, device_id, element_id into v_it
    from public.rack_items where id = p_id and org_id = v_org;

  if v_it.label is null then
    raise exception 'Ese equipo no está montado';
  end if;

  if v_it.kind = 'olt' and v_it.device_id is not null then
    select count(*) into v_n
      from public.pon_ports pp
      join public.olt_cards ca on ca.id = pp.card_id
      join public.odf_ports op on op.pon_port_id = pp.id
     where ca.device_id = v_it.device_id;
  elsif v_it.kind = 'odf' and v_it.element_id is not null then
    select count(*) into v_n
      from public.odf_ports where odf_id = v_it.element_id and status = 'ocupado';
  end if;

  if v_n > 0 and not p_forzar then
    raise exception
      'Ojo: % tiene % % conectados. Si de verdad lo vas a bajar, vuelve a intentarlo confirmando; el equipo sale del rack pero sus puertos y su patcheo se quedan como están.',
      v_it.label, v_n,
      case when v_it.kind = 'olt' then 'puertos PON patcheados' else 'puertos con fibra' end;
  end if;

  delete from public.rack_items where id = p_id and org_id = v_org;

  return format('%s salió del rack.%s', v_it.label,
    case when v_n > 0 then format(' Traía %s puertos conectados: revisa que sigan documentados.', v_n)
         else '' end);
end;
$$;

create or replace function public.eliminar_rack(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_nom text;
  v_n   int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar racks' using errcode = '42501';
  end if;

  select name into v_nom from public.racks where id = p_id and org_id = v_org;
  if v_nom is null then
    raise exception 'Ese rack no existe';
  end if;

  select count(*) into v_n from public.rack_items where rack_id = p_id;
  if v_n > 0 then
    raise exception
      'No se puede borrar %: todavía tiene % equipos montados. Bájalos primero.', v_nom, v_n;
  end if;

  delete from public.racks where id = p_id and org_id = v_org;
  return v_nom;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · El jumper de la OLT al ODF
-- ----------------------------------------------------------------------------
/*
 * El patcheo ya existía; lo que faltaba era el papelito del latiguillo:
 * cuál se usó y de qué conector es. Va sobre odf_ports y no en una tabla
 * aparte para que no haya dos verdades sobre qué PON está en qué puerto.
 */
alter table public.odf_ports
  add column if not exists jumper_code text;

comment on column public.odf_ports.jumper_code is
  'Etiqueta del latiguillo. Sirve cuando hay que seguirlo con la mano dentro del organizador.';

/*
 * Y se le agregan al patcheo los dos datos que faltaban: cuál latiguillo y de
 * qué conector. Se cambia la firma, así que primero se tira la vieja: dejar
 * las dos conviviendo haría ambigua la llamada de cuatro argumentos.
 *
 * El conector importa más de lo que parece. Mezclar APC con UPC cuesta medio
 * decibel y una visita, y es de los errores que no se ven: el enlace levanta,
 * nada más viene flojo, y seis meses después nadie se acuerda de por qué.
 */
drop function if exists public.patchear(uuid, uuid, numeric, text);

create or replace function public.patchear(
  p_pon      uuid,
  p_odf_port uuid,
  p_potencia numeric default null,
  p_notas    text    default null,
  p_jumper   text    default null,
  p_conector text    default null
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
         jumper_code = coalesce(nullif(btrim(p_jumper), ''), jumper_code),
         connector = coalesce(nullif(btrim(p_conector), ''), connector),
         installed_at = coalesce(installed_at, current_date),
         installed_by = coalesce(installed_by, auth.uid()),
         updated_at = now()
   where id = p_odf_port;

  return format('PON %s/%s de %s conectado a %s bandeja %s puerto %s%s.',
                v_pon.slot_number, v_pon.port_number, v_pon.olt,
                v_pto.odf, v_pto.tray_number, v_pto.port_number,
                case when nullif(btrim(coalesce(p_jumper, '')), '') is not null
                     then format(' con el latiguillo %s', btrim(p_jumper)) else '' end);
end;
$$;

comment on function public.patchear is
  'Conecta un puerto PON de la OLT a un puerto del ODF. Un PON, un puerto.';

revoke all  on function public.patchear(uuid, uuid, numeric, text, text, text) from public, anon;
grant execute on function public.patchear(uuid, uuid, numeric, text, text, text) to authenticated;

-- La etiqueta del latiguillo y quién lo puso, en la vista de puertos. Van al
-- final: «create or replace view» solo deja agregar columnas, nunca moverlas.
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
       st.color                   as color_hilo,
       op.jumper_code,
       pr.full_name               as responsable
  from public.odf_ports op
  join public.network_elements e on e.id = op.odf_id
  left join public.network_sites s on s.id = e.site_id
  left join public.pon_ports pp on pp.id = op.pon_port_id
  left join public.olt_cards ca on ca.id = pp.card_id
  left join public.network_devices d on d.id = ca.device_id
  left join public.fiber_strands st on st.id = op.out_strand_id
  left join public.fiber_cables c on c.id = st.cable_id
  left join public.profiles pr on pr.id = op.installed_by;

-- ----------------------------------------------------------------------------
-- 6 · Vistas
-- ----------------------------------------------------------------------------
create or replace view public.v_racks with (security_invoker = true) as
select r.id,
       r.org_id,
       r.site_id,
       s.name                       as sitio,
       s.zone_id,
       z.name                       as zona,
       r.name,
       r.units,
       r.location,
       r.notes,
       r.is_active,
       (select count(*) from public.rack_items i where i.rack_id = r.id)              as equipos,
       coalesce((select sum(i.height) from public.rack_items i where i.rack_id = r.id), 0) as ocupadas,
       r.units - coalesce((select sum(i.height) from public.rack_items i
                            where i.rack_id = r.id), 0)                                as libres
  from public.racks r
  join public.network_sites s on s.id = r.site_id
  left join public.zones z on z.id = s.zone_id;

comment on view public.v_racks is
  'Los gabinetes con cuántas U traen ocupadas y cuántas quedan.';

create or replace view public.v_rack_items with (security_invoker = true) as
select i.id,
       i.org_id,
       i.rack_id,
       r.name                       as rack,
       r.units                      as rack_units,
       r.site_id,
       i.device_id,
       i.element_id,
       i.kind,
       i.label,
       coalesce(i.vendor, d.vendor) as vendor,
       coalesce(i.model, d.model)   as model,
       i.serial,
       i.position,
       i.height,
       i.position + i.height - 1    as hasta,
       i.status,
       i.mgmt_ip::text              as mgmt_ip,
       i.installed_at,
       p.full_name                  as responsable,
       i.notes,
       -- Lo que trae adentro, para poder pintarlo sin ir a otra consulta.
       (select count(*) from public.olt_cards ca where ca.device_id = i.device_id)     as tarjetas,
       (select count(*) from public.pon_ports pp
          join public.olt_cards ca on ca.id = pp.card_id
         where ca.device_id = i.device_id)                                             as puertos_pon,
       (select count(*) from public.pon_ports pp
          join public.olt_cards ca on ca.id = pp.card_id
          join public.odf_ports op on op.pon_port_id = pp.id
         where ca.device_id = i.device_id)                                             as pon_patcheados,
       (select count(*) from public.odf_ports op where op.odf_id = i.element_id)       as puertos_odf,
       (select count(*) from public.odf_ports op
         where op.odf_id = i.element_id and op.status = 'libre')                       as odf_libres
  from public.rack_items i
  join public.racks r on r.id = i.rack_id
  left join public.network_devices d on d.id = i.device_id
  left join public.profiles p on p.id = i.installed_by;

comment on view public.v_rack_items is
  'Cada equipo montado con su rango de unidades y lo que trae adentro.';

-- ----------------------------------------------------------------------------
-- 7 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.guardar_rack(uuid, uuid, text, int, text, text) from public, anon;
revoke all on function public.montar_en_rack(uuid, text, text, int, int, uuid, uuid, text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.mover_en_rack(uuid, int) from public, anon;
revoke all on function public.desmontar_del_rack(uuid, boolean) from public, anon;
revoke all on function public.eliminar_rack(uuid) from public, anon;

grant execute on function public.guardar_rack(uuid, uuid, text, int, text, text) to authenticated;
grant execute on function public.montar_en_rack(uuid, text, text, int, int, uuid, uuid, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.mover_en_rack(uuid, int) to authenticated;
grant execute on function public.desmontar_del_rack(uuid, boolean) to authenticated;
grant execute on function public.eliminar_rack(uuid) to authenticated;
