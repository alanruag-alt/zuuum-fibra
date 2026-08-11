-- ============================================================================
-- 027 · Hilos, cajas de empalme y fusiones
-- ============================================================================
-- Hasta aquí el sistema sabía que existía un cable entre dos puntos. Eso
-- alcanza para un dibujo, no para trabajar.
--
-- Cuando a las 11 de la noche un cliente reporta que no tiene internet, lo que
-- hace falta saber es OTRA cosa: por cuál hilo, de cuál cable, entrando a cuál
-- caja, fusionado con cuál otro hilo, hasta cuál NAP y cuál puerto. Y al revés:
-- si esta caja se quema, ¿a quiénes tengo que hablarles antes de que me
-- hablen ellos?
--
-- Esta migración baja a ese nivel, que es el que ya existía en el sistema de
-- trazabilidad que Alan venía usando:
--
--   fiber_cables    el cable, con cuántos hilos trae
--   fiber_strands   cada hilo, con su color de norma y su estado
--   fiber_splices   la fusión: este hilo se pega con este otro, dentro de
--                   esta caja, y cuesta tantos dB
--   nap_ports       el puerto de la NAP donde entra cada cliente
--
-- El color no se captura: se calcula. La norma TIA-598 dice que los hilos van
-- azul, naranja, verde, café, gris, blanco, rojo, negro, amarillo, violeta,
-- rosa y aqua, y que a partir del 13 se repite la serie cambiando de tubo. Un
-- técnico abre la caja, ve un hilo verde en el tubo 2 y quiere saber cuál es;
-- si el color se capturara a mano, la mitad estarían mal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Los colores de la norma
-- ----------------------------------------------------------------------------
create or replace function public.color_hilo(p_numero int)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['Azul','Naranja','Verde','Café','Gris','Blanco',
                'Rojo','Negro','Amarillo','Violeta','Rosa','Aqua'])
         [ ((greatest(p_numero, 1) - 1) % 12) + 1 ];
$$;

comment on function public.color_hilo is
  'Color TIA-598 del hilo N. Se calcula, no se captura: un color escrito a '
  'mano es un color equivocado la mitad de las veces.';

create or replace function public.tubo_hilo(p_numero int)
returns int
language sql
immutable
set search_path = ''
as $$
  select ((greatest(p_numero, 1) - 1) / 12) + 1;
$$;

-- ----------------------------------------------------------------------------
-- 2 · Tablas
-- ----------------------------------------------------------------------------
create table if not exists public.fiber_cables (
  id           uuid primary key default extensions.gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  zone_id      uuid references public.zones(id) on delete set null,
  code         text not null,
  cable_type   text not null default 'adss'
               check (cable_type in ('adss','armado','canalizado','drop','otro')),
  fiber_count  integer not null check (fiber_count between 1 and 288),
  -- De dónde a dónde va. Se guarda como texto además del elemento, porque en
  -- campo la gente dice «de la caseta a la esquina de la primaria», no un uuid.
  from_kind    text check (from_kind in ('odf','closure','nap','splitter','site','otro')),
  from_id      uuid,
  from_text    text,
  to_kind      text check (to_kind in ('odf','closure','nap','splitter','site','otro')),
  to_id        uuid,
  to_text      text,
  length_m     numeric(10,2),
  path         jsonb,
  plan_color   text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,
  constraint fiber_cables_codigo_unico unique (org_id, code)
);

comment on table public.fiber_cables is
  'El cable físico. Sus hilos se crean solos al darlo de alta.';
comment on column public.fiber_cables.path is
  'Los puntos por donde pasa, para dibujarlo en el mapa.';

create table if not exists public.fiber_strands (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  cable_id      uuid not null references public.fiber_cables(id) on delete cascade,
  strand_number integer not null check (strand_number > 0),
  tube_number   integer not null,
  color         text not null,
  status        text not null default 'disponible'
                check (status in ('disponible','fusionado','en_servicio','reservado',
                                  'danado','cortado','sin_identificar')),
  notes         text,
  updated_at    timestamptz not null default now(),
  constraint fiber_strands_unico unique (cable_id, strand_number)
);

comment on table public.fiber_strands is
  'Cada hilo, uno por renglón. Es el nivel donde de verdad se trabaja.';

-- La fusión. Un hilo entra y sale hacia otro hilo, o termina en una NAP o en
-- un splitter. Las dos formas conviven porque las dos existen en la calle.
create table if not exists public.fiber_splices (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  closure_id    uuid not null references public.network_elements(id) on delete cascade,
  in_strand_id  uuid not null references public.fiber_strands(id) on delete cascade,
  out_strand_id uuid references public.fiber_strands(id) on delete cascade,
  to_element_id uuid references public.network_elements(id) on delete cascade,
  splice_type   text not null default 'fusion'
                check (splice_type in ('fusion','mecanico','conector','paso')),
  loss_db       numeric(5,2) check (loss_db is null or loss_db >= 0),
  status        text not null default 'activa'
                check (status in ('activa','inactiva','pendiente')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  -- O va a otro hilo, o va a un elemento. Las dos cosas a la vez no significan
  -- nada, y ninguna de las dos tampoco.
  constraint fiber_splices_un_destino check (
    (out_strand_id is not null and to_element_id is null) or
    (out_strand_id is null     and to_element_id is not null)
  ),
  constraint fiber_splices_no_a_si_mismo check (out_strand_id is null or out_strand_id <> in_strand_id)
);

comment on table public.fiber_splices is
  'La fusión dentro de una caja. Es la que permite seguir el camino de la luz '
  'de un extremo al otro de la red.';

create table if not exists public.nap_ports (
  id           uuid primary key default extensions.gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  element_id   uuid not null references public.network_elements(id) on delete cascade,
  port_number  integer not null check (port_number > 0),
  service_id   uuid references public.customer_services(id) on delete set null,
  rx_dbm       numeric(5,2),
  status       text not null default 'libre'
               check (status in ('libre','ocupado','reservado','danado')),
  notes        text,
  updated_at   timestamptz not null default now(),
  constraint nap_ports_unico unique (element_id, port_number),
  -- Un puerto con cliente está ocupado. Si no, la ocupación de la NAP miente.
  constraint nap_ports_coherente check (service_id is null or status = 'ocupado')
);

comment on table public.nap_ports is
  'El puerto exacto de la NAP donde entra cada cliente. Sin esto, «está en la '
  'NAP 12» obliga a abrirla y probar puerto por puerto.';

-- Lo que le faltaba a la NAP para poder trazarla.
alter table public.network_elements
  add column if not exists feed_strand_id uuid references public.fiber_strands(id) on delete set null,
  add column if not exists input_dbm      numeric(5,2);

comment on column public.network_elements.feed_strand_id is
  'El hilo que alimenta esta NAP. Es el hilo del que cuelga todo lo de abajo.';

-- El ODF necesita existir como elemento para poder ser el principio del camino.
alter table public.network_elements drop constraint if exists network_elements_element_type_check;
alter table public.network_elements add constraint network_elements_element_type_check
  check (element_type in ('nap','closure','splitter','pole','hand_hole','odf','other'));

create index if not exists hilos_cable_idx   on public.fiber_strands(cable_id, strand_number);
create index if not exists hilos_estado_idx  on public.fiber_strands(org_id, status);
create index if not exists fusiones_caja_idx on public.fiber_splices(closure_id);
create index if not exists fusiones_ent_idx  on public.fiber_splices(in_strand_id);
create index if not exists fusiones_sal_idx  on public.fiber_splices(out_strand_id);
create index if not exists fusiones_dest_idx on public.fiber_splices(to_element_id);
create index if not exists puertos_nap_idx   on public.nap_ports(element_id, port_number);
create index if not exists puertos_srv_idx   on public.nap_ports(service_id);
create index if not exists cables_zona_idx   on public.fiber_cables(org_id, zone_id) where is_active;

select public.poner_tocar_actualizado('fiber_cables');
select public.poner_tocar_actualizado('fiber_splices');

-- ----------------------------------------------------------------------------
-- 3 · Seguridad
-- ----------------------------------------------------------------------------
alter table public.fiber_cables  enable row level security;
alter table public.fiber_strands enable row level security;
alter table public.fiber_splices enable row level security;
alter table public.nap_ports     enable row level security;

create policy cables_lectura on public.fiber_cables for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy cables_escritura on public.fiber_cables for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy hilos_lectura on public.fiber_strands for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy hilos_escritura on public.fiber_strands for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy fusiones_lectura on public.fiber_splices for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy fusiones_escritura on public.fiber_splices for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy puertos_lectura on public.nap_ports for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy puertos_escritura on public.nap_ports for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

grant select, insert, update, delete on
  public.fiber_cables, public.fiber_strands, public.fiber_splices, public.nap_ports
  to authenticated;

select public.poner_auditoria(t) from unnest(array[
  'fiber_cables', 'fiber_splices', 'nap_ports'
]) as t;

-- ----------------------------------------------------------------------------
-- 4 · Alta de cable: los hilos se crean solos
-- ----------------------------------------------------------------------------
create or replace function public.guardar_cable(
  p_id      uuid    default null,
  p_codigo  text    default null,
  p_tipo    text    default 'adss',
  p_hilos   int     default null,
  p_zona    uuid    default null,
  p_de_texto text   default null,
  p_de_tipo text    default null,
  p_de_id   uuid    default null,
  p_a_texto text    default null,
  p_a_tipo  text    default null,
  p_a_id    uuid    default null,
  p_metros  numeric default null,
  p_color   text    default null,
  p_notas   text    default null,
  p_activo  boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.auth_org_id();
  v_id    uuid;
  v_hoy   int;
  v_i     int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para capturar la red' using errcode = '42501';
  end if;

  if p_id is null then
    if coalesce(btrim(p_codigo), '') = '' then
      raise exception 'El cable necesita un código';
    end if;
    if p_hilos is null or p_hilos < 1 then
      raise exception 'Hay que decir cuántos hilos trae el cable';
    end if;

    insert into public.fiber_cables
      (org_id, zone_id, code, cable_type, fiber_count,
       from_kind, from_id, from_text, to_kind, to_id, to_text,
       length_m, plan_color, notes, is_active, created_by)
    values
      (v_org, p_zona, upper(btrim(p_codigo)), coalesce(p_tipo, 'adss'), p_hilos,
       p_de_tipo, p_de_id, p_de_texto, p_a_tipo, p_a_id, p_a_texto,
       p_metros, p_color, p_notas, coalesce(p_activo, true), auth.uid())
    returning id into v_id;
  else
    update public.fiber_cables
       set code       = coalesce(upper(btrim(p_codigo)), code),
           cable_type = coalesce(p_tipo, cable_type),
           zone_id    = p_zona,
           fiber_count = coalesce(p_hilos, fiber_count),
           from_kind  = p_de_tipo, from_id = p_de_id, from_text = p_de_texto,
           to_kind    = p_a_tipo,  to_id   = p_a_id,  to_text   = p_a_texto,
           length_m   = p_metros,
           plan_color = p_color,
           notes      = p_notas,
           is_active  = coalesce(p_activo, is_active),
           updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese cable no existe';
    end if;
  end if;

  -- Los hilos que falten se crean. Los que sobran NO se borran solos: si
  -- alguien capturó 24 y eran 12, borrar los otros 12 se llevaría fusiones
  -- que quizá ya están bien hechas.
  select coalesce(max(strand_number), 0) into v_hoy
    from public.fiber_strands where cable_id = v_id;

  select fiber_count into v_i from public.fiber_cables where id = v_id;

  if v_i > v_hoy then
    insert into public.fiber_strands (org_id, cable_id, strand_number, tube_number, color)
    select v_org, v_id, n, public.tubo_hilo(n), public.color_hilo(n)
      from generate_series(v_hoy + 1, v_i) as n;
  end if;

  return v_id;
end;
$$;

comment on function public.guardar_cable is
  'Da de alta o corrige un cable. Los hilos que falten se crean con su color '
  'de norma; los que sobran no se tocan, porque podrían tener fusiones vivas.';

-- ----------------------------------------------------------------------------
create or replace function public.guardar_hilo(
  p_id     uuid,
  p_estado text default null,
  p_notas  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := public.auth_org_id();
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para tocar la red' using errcode = '42501';
  end if;

  update public.fiber_strands
     set status = coalesce(p_estado, status),
         notes  = coalesce(p_notas, notes),
         updated_at = now()
   where id = p_id and org_id = v_org;

  if not found then
    raise exception 'Ese hilo no existe';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Fusiones
-- ----------------------------------------------------------------------------
create or replace function public.guardar_fusion(
  p_id       uuid    default null,
  p_caja     uuid    default null,
  p_entrada  uuid    default null,
  p_salida   uuid    default null,
  p_destino  uuid    default null,
  p_tipo     text    default 'fusion',
  p_perdida  numeric default null,
  p_estado   text    default 'activa',
  p_notas    text    default null
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
    raise exception 'No tienes permiso para capturar fusiones' using errcode = '42501';
  end if;

  if p_id is null then
    if p_caja is null or p_entrada is null then
      raise exception 'Una fusión necesita su caja y el hilo que entra';
    end if;
    if (p_salida is null) = (p_destino is null) then
      raise exception 'Di a dónde va: a otro hilo, o a una NAP o splitter. Una sola cosa.';
    end if;

    -- Un hilo no se puede fusionar dos veces en la misma caja: o está mal
    -- capturado, o alguien está a punto de cortar el servicio de otro.
    if exists (select 1 from public.fiber_splices f
                where f.closure_id = p_caja
                  and f.in_strand_id = p_entrada
                  and f.status = 'activa') then
      raise exception 'Ese hilo ya tiene una fusión activa en esa caja';
    end if;

    insert into public.fiber_splices
      (org_id, closure_id, in_strand_id, out_strand_id, to_element_id,
       splice_type, loss_db, status, notes, created_by)
    values
      (v_org, p_caja, p_entrada, p_salida, p_destino,
       coalesce(p_tipo, 'fusion'), p_perdida, coalesce(p_estado, 'activa'),
       p_notas, auth.uid())
    returning id into v_id;
  else
    update public.fiber_splices
       set splice_type = coalesce(p_tipo, splice_type),
           loss_db     = p_perdida,
           status      = coalesce(p_estado, status),
           notes       = p_notas,
           updated_at  = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa fusión no existe';
    end if;
  end if;

  -- Un hilo fusionado deja de estar disponible. Si no se marca, mañana
  -- alguien lo vuelve a usar y corta a un cliente que ya estaba trabajando.
  update public.fiber_strands
     set status = 'fusionado', updated_at = now()
   where id in (select in_strand_id from public.fiber_splices where id = v_id
                union all
                select out_strand_id from public.fiber_splices where id = v_id)
     and status = 'disponible';

  return v_id;
end;
$$;

comment on function public.guardar_fusion is
  'Registra la fusión y marca los hilos como ocupados. Se niega a fusionar dos '
  'veces el mismo hilo en la misma caja: eso o es un error de captura, o es '
  'cortarle el servicio a alguien.';

-- ----------------------------------------------------------------------------
create or replace function public.eliminar_fusion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_ent uuid;
  v_sal uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar fusiones' using errcode = '42501';
  end if;

  select in_strand_id, out_strand_id into v_ent, v_sal
    from public.fiber_splices where id = p_id and org_id = v_org;

  if v_ent is null then
    raise exception 'Esa fusión no existe';
  end if;

  delete from public.fiber_splices where id = p_id and org_id = v_org;

  -- Los hilos vuelven a estar libres, salvo que sigan fusionados en otro lado.
  update public.fiber_strands s
     set status = 'disponible', updated_at = now()
   where s.id in (v_ent, v_sal)
     and s.status = 'fusionado'
     and not exists (select 1 from public.fiber_splices f
                      where f.status = 'activa'
                        and (f.in_strand_id = s.id or f.out_strand_id = s.id));
end;
$$;

-- ----------------------------------------------------------------------------
-- 6 · Puertos de NAP
-- ----------------------------------------------------------------------------
-- Los puertos se crean solos cuando se le pone capacidad a la NAP.
create or replace function public.abrir_puertos_nap(p_nap uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_cap  int;
  v_hoy  int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  select capacity into v_cap from public.network_elements
   where id = p_nap and org_id = v_org;

  if v_cap is null or v_cap < 1 then
    return 0;
  end if;

  select coalesce(max(port_number), 0) into v_hoy
    from public.nap_ports where element_id = p_nap;

  if v_cap > v_hoy then
    insert into public.nap_ports (org_id, element_id, port_number)
    select v_org, p_nap, n from generate_series(v_hoy + 1, v_cap) as n;
    return v_cap - v_hoy;
  end if;

  return 0;
end;
$$;

-- ----------------------------------------------------------------------------
create or replace function public.asignar_puerto_nap(
  p_nap      uuid,
  p_puerto   int,
  p_servicio uuid    default null,
  p_rx       numeric default null,
  p_estado   text    default null,
  p_notas    text    default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_p   record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para asignar puertos' using errcode = '42501';
  end if;

  perform public.abrir_puertos_nap(p_nap);

  select * into v_p from public.nap_ports
   where element_id = p_nap and port_number = p_puerto and org_id = v_org;

  if v_p.id is null then
    raise exception 'Esa NAP no tiene puerto %. Revisa su capacidad.', p_puerto;
  end if;

  if p_servicio is not null then
    -- Dos clientes en el mismo puerto no existe. Y el mismo cliente en dos
    -- puertos tampoco: alguien lo movió y no borró el anterior.
    if v_p.service_id is not null and v_p.service_id <> p_servicio then
      raise exception 'Ese puerto ya tiene otro cliente. Libéralo primero.';
    end if;

    update public.nap_ports
       set service_id = null, status = 'libre', rx_dbm = null, updated_at = now()
     where org_id = v_org and service_id = p_servicio and id <> v_p.id;

    update public.nap_ports
       set service_id = p_servicio, status = 'ocupado',
           rx_dbm = coalesce(p_rx, rx_dbm), notes = coalesce(p_notas, notes),
           updated_at = now()
     where id = v_p.id;

    -- El servicio también apunta a su NAP, que es lo que ya usaba el resto
    -- del sistema para la ocupación.
    update public.customer_services
       set network_element_id = p_nap, updated_at = now()
     where id = p_servicio;
  else
    update public.nap_ports
       set service_id = null,
           status  = coalesce(p_estado, 'libre'),
           rx_dbm  = p_rx,
           notes   = coalesce(p_notas, notes),
           updated_at = now()
     where id = v_p.id;
  end if;

  -- La ocupación de la NAP se recalcula de los puertos, que es la verdad.
  update public.network_elements n
     set used_ports = (select count(*) from public.nap_ports p
                        where p.element_id = n.id and p.status = 'ocupado'),
         updated_at = now()
   where n.id = p_nap;
end;
$$;

comment on function public.asignar_puerto_nap is
  'Pone o quita un cliente de un puerto. Si el cliente estaba en otro puerto, '
  'lo suelta: nadie está en dos lados a la vez.';

-- ----------------------------------------------------------------------------
-- 7 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.guardar_cable(uuid, text, text, int, uuid, text, text, uuid, text, text, uuid, numeric, text, text, boolean) from public, anon;
revoke all on function public.guardar_hilo(uuid, text, text) from public, anon;
revoke all on function public.guardar_fusion(uuid, uuid, uuid, uuid, uuid, text, numeric, text, text) from public, anon;
revoke all on function public.eliminar_fusion(uuid) from public, anon;
revoke all on function public.abrir_puertos_nap(uuid) from public, anon;
revoke all on function public.asignar_puerto_nap(uuid, int, uuid, numeric, text, text) from public, anon;

grant execute on function public.guardar_cable(uuid, text, text, int, uuid, text, text, uuid, text, text, uuid, numeric, text, text, boolean) to authenticated;
grant execute on function public.guardar_hilo(uuid, text, text) to authenticated;
grant execute on function public.guardar_fusion(uuid, uuid, uuid, uuid, uuid, text, numeric, text, text) to authenticated;
grant execute on function public.eliminar_fusion(uuid) to authenticated;
grant execute on function public.abrir_puertos_nap(uuid) to authenticated;
grant execute on function public.asignar_puerto_nap(uuid, int, uuid, numeric, text, text) to authenticated;
grant execute on function public.color_hilo(int), public.tubo_hilo(int) to authenticated;
