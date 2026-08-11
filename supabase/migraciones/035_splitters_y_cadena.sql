-- ============================================================================
-- 035 · Splitters, y la regla de que un hilo va a un solo lado
--
-- El splitter es lo único de la red FTTH que no es un cable ni una caja: es lo
-- que convierte una fibra en ocho. Sin él capturado, la cuenta de clientes por
-- puerto PON no cuadra nunca, y «¿cuántos me caben todavía?» se contesta a
-- ojo.
--
-- Va SIEMPRE dentro de algo —una caja de empalme, una NAP, o un rack junto al
-- ODF— porque en la calle no existe un splitter colgado del aire. Esa es la
-- validación 4, y está puesta como «not null» para que no se pueda ni
-- intentar.
--
--   abrir_splitter()     el splitter con sus salidas, según la razón
--   alimentar_splitter() de dónde le entra la luz
--   conectar_salida()    a dónde va cada salida
--   dueno_del_hilo()     quién se está usando este hilo, si alguien
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · El splitter
-- ----------------------------------------------------------------------------
create table if not exists public.splitters (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  code          text not null,
  -- Validación 5 · la razón manda cuántas salidas hay. No se captura aparte.
  ratio         text not null default '1x8'
                check (ratio in ('1x2','1x4','1x8','1x16','1x32','1x64',
                                 '2x2','2x4','2x8','2x16','2x32')),
  -- Validación 4 · sin caja no hay splitter.
  housing_id    uuid not null references public.network_elements(id) on delete restrict,
  -- De dónde le entra la luz. A lo mucho una de las tres.
  in_strand_id  uuid references public.fiber_strands(id) on delete set null,
  in_odf_port_id uuid references public.odf_ports(id) on delete set null,
  in_splitter_port_id uuid,
  loss_db       numeric(5,2) check (loss_db is null or loss_db >= 0),
  power_in_dbm  numeric(6,2),
  site_id       uuid references public.network_sites(id) on delete set null,
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  status        text not null default 'en_servicio'
                check (status in ('en_servicio','planeado','instalado','reservado',
                                  'danado','retirado')),
  installed_at  date,
  installed_by  uuid references public.profiles(id) on delete set null,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  constraint splitters_codigo_unico unique (org_id, code),
  -- La luz entra por un solo lado. Dos entradas capturadas es un error, no una
  -- red redundante: eso se hace con equipo de protección, no aquí.
  constraint splitters_una_entrada check (
    (case when in_strand_id        is not null then 1 else 0 end) +
    (case when in_odf_port_id      is not null then 1 else 0 end) +
    (case when in_splitter_port_id is not null then 1 else 0 end) <= 1
  )
);

comment on table public.splitters is
  'El divisor óptico. Vive dentro de una caja de empalme, de una NAP o del rack del ODF.';
comment on column public.splitters.ratio is
  'De la razón salen las salidas: un 1x8 tiene ocho, ni una más.';
comment on column public.splitters.in_splitter_port_id is
  'Cuando cuelga de otro splitter: primer nivel 1x4, segundo nivel 1x8. Se usa y hay que poder capturarlo.';

create table if not exists public.splitter_ports (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  splitter_id   uuid not null references public.splitters(id) on delete cascade,
  port_number   integer not null check (port_number > 0),
  -- Validación 6 · cada salida tiene su estado.
  status        text not null default 'disponible'
                check (status in ('disponible','utilizada','reservada','danada')),
  -- A dónde va la salida. A lo mucho una de las tres.
  out_strand_id   uuid references public.fiber_strands(id) on delete set null,
  out_nap_port_id uuid references public.nap_ports(id) on delete set null,
  out_element_id  uuid references public.network_elements(id) on delete set null,
  power_dbm     numeric(6,2),
  notes         text,
  updated_at    timestamptz not null default now(),
  constraint splitter_ports_unico unique (splitter_id, port_number),
  constraint splitter_ports_una_salida check (
    (case when out_strand_id   is not null then 1 else 0 end) +
    (case when out_nap_port_id is not null then 1 else 0 end) +
    (case when out_element_id  is not null then 1 else 0 end) <= 1
  ),
  -- Una salida con algo conectado no puede decir que está disponible.
  constraint splitter_ports_coherente check (
    status = 'utilizada'
    or (out_strand_id is null and out_nap_port_id is null and out_element_id is null)
  )
);

comment on table public.splitter_ports is
  'Cada salida del splitter con su estado y a dónde va.';

alter table public.splitters drop constraint if exists splitters_entrada_padre;
alter table public.splitters add constraint splitters_entrada_padre
  foreign key (in_splitter_port_id) references public.splitter_ports(id) on delete set null;

create index if not exists splitters_caja_idx  on public.splitters(housing_id);
create index if not exists splitters_hilo_idx  on public.splitters(in_strand_id);
create index if not exists spl_ports_spl_idx   on public.splitter_ports(splitter_id, port_number);
create index if not exists spl_ports_hilo_idx  on public.splitter_ports(out_strand_id);

select public.poner_tocar_actualizado('splitters');

alter table public.splitters      enable row level security;
alter table public.splitter_ports enable row level security;

create policy splitters_lectura on public.splitters for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy splitters_escritura on public.splitters for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

create policy spl_puertos_lectura on public.splitter_ports for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy spl_puertos_escritura on public.splitter_ports for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

grant select, insert, update, delete on public.splitters, public.splitter_ports to authenticated;
select public.poner_auditoria(t) from unnest(array['splitters','splitter_ports']) as t;

-- ----------------------------------------------------------------------------
-- 2 · Validación 3 · un hilo no se usa en dos rutas
-- ----------------------------------------------------------------------------
/*
 * Un hilo es un tubito de vidrio: la luz entra por un lado y sale por el otro.
 * Puede tener UN origen y UN destino, y ya.
 *
 * Esto no es purismo: si el mismo hilo aparece alimentando dos NAP, el día que
 * alguien lo desconecte para arreglar una, tumba la otra sin saber por qué.
 * El sistema tiene que negarse a capturar algo que físicamente no existe.
 *
 * Estas dos funciones contestan «¿este hilo ya tiene dueño?», y devuelven el
 * nombre de quien lo tiene para que el recado sea útil y no solo un «no».
 */
create or replace function public.fuente_del_hilo(p_hilo uuid, p_excepto uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_r text;
begin
  select format('%s bandeja %s puerto %s', e.code, op.tray_number, op.port_number) into v_r
    from public.odf_ports op
    join public.network_elements e on e.id = op.odf_id
   where op.out_strand_id = p_hilo and (p_excepto is null or op.id <> p_excepto);
  if v_r is not null then return v_r; end if;

  select format('la salida %s del splitter %s', sp.port_number, s.code) into v_r
    from public.splitter_ports sp
    join public.splitters s on s.id = sp.splitter_id
   where sp.out_strand_id = p_hilo and (p_excepto is null or sp.id <> p_excepto);
  if v_r is not null then return v_r; end if;

  select format('una fusión en la caja %s', e.code) into v_r
    from public.fiber_splices f
    join public.network_elements e on e.id = f.closure_id
   where f.out_strand_id = p_hilo and f.status = 'activa'
     and (p_excepto is null or f.id <> p_excepto);
  return v_r;
end;
$$;

create or replace function public.destino_del_hilo(p_hilo uuid, p_excepto uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_r text;
begin
  select format('el splitter %s', s.code) into v_r
    from public.splitters s
   where s.in_strand_id = p_hilo and s.is_active
     and (p_excepto is null or s.id <> p_excepto);
  if v_r is not null then return v_r; end if;

  select format('la NAP %s', e.code) into v_r
    from public.network_elements e
   where e.feed_strand_id = p_hilo and e.is_active
     and (p_excepto is null or e.id <> p_excepto);
  if v_r is not null then return v_r; end if;

  select format('una fusión en la caja %s', e.code) into v_r
    from public.fiber_splices f
    join public.network_elements e on e.id = f.closure_id
   where f.in_strand_id = p_hilo and f.status = 'activa'
     and (p_excepto is null or f.id <> p_excepto);
  return v_r;
end;
$$;

comment on function public.destino_del_hilo is
  'A dónde va ya este hilo, si va a algún lado. Sirve para no usarlo dos veces.';

create or replace function public.exigir_hilo_libre(
  p_hilo    uuid,
  p_como    text,             -- 'destino' o 'fuente'
  p_excepto uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quien text;
  v_hilo  record;
begin
  if p_hilo is null then return; end if;

  v_quien := case when p_como = 'fuente'
                  then public.fuente_del_hilo(p_hilo, p_excepto)
                  else public.destino_del_hilo(p_hilo, p_excepto) end;

  if v_quien is null then return; end if;

  select s.strand_number, s.color, c.code as cable into v_hilo
    from public.fiber_strands s
    join public.fiber_cables c on c.id = s.cable_id
   where s.id = p_hilo;

  raise exception
    'El hilo % (%) de % ya %s %. Un hilo va a un solo lado; si de verdad va para allá, quita primero lo anterior.',
    v_hilo.strand_number, v_hilo.color, v_hilo.cable,
    case when p_como = 'fuente' then 'viene de' else 'alimenta' end,
    v_quien;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3 · Abrir un splitter con sus salidas
-- ----------------------------------------------------------------------------
create or replace function public.abrir_splitter(
  p_codigo   text,
  p_caja     uuid,
  p_razon    text    default '1x8',
  p_perdida  numeric default null,
  p_notas    text    default null,
  p_id       uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_caja   record;
  v_id     uuid;
  v_salidas int;
  v_hoy    int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  -- Validación 4 · primero la caja.
  if p_caja is null then
    raise exception
      'Antes del splitter va la caja donde se va a montar. Elige la caja de empalme, la NAP o el ODF y vuelve a intentar.';
  end if;

  select id, element_type, code, site_id, latitude, longitude into v_caja
    from public.network_elements where id = p_caja and org_id = v_org;

  if v_caja.id is null then
    raise exception 'Esa caja no existe';
  end if;
  if v_caja.element_type not in ('closure', 'nap', 'odf') then
    raise exception
      'Un splitter se monta en una caja de empalme, en una NAP o en el ODF. % está capturado como otra cosa.',
      v_caja.code;
  end if;

  -- Validación 5 · las salidas salen de la razón.
  v_salidas := split_part(coalesce(p_razon, '1x8'), 'x', 2)::int;
  if v_salidas is null or v_salidas < 2 then
    raise exception 'Esa razón no dice cuántas salidas tiene. Usa 1x2, 1x4, 1x8, 1x16 o 1x32.';
  end if;

  if p_id is null then
    insert into public.splitters
      (org_id, code, ratio, housing_id, loss_db, notes, site_id, latitude, longitude,
       installed_at, installed_by, created_by)
    values
      (v_org, upper(btrim(p_codigo)), coalesce(p_razon, '1x8'), p_caja, p_perdida, p_notas,
       v_caja.site_id, v_caja.latitude, v_caja.longitude,
       current_date, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.splitters
       set code = coalesce(upper(btrim(p_codigo)), code),
           ratio = coalesce(p_razon, ratio),
           housing_id = p_caja,
           loss_db = coalesce(p_perdida, loss_db),
           notes = coalesce(p_notas, notes),
           updated_at = now()
     where id = p_id and org_id = v_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese splitter no existe';
    end if;
  end if;

  -- Las salidas se crean hasta completar la razón. Si el splitter se cambió
  -- por uno más grande, se agregan las que faltan sin tocar las que ya tenían
  -- cliente.
  select coalesce(max(port_number), 0) into v_hoy
    from public.splitter_ports where splitter_id = v_id;

  if v_salidas > v_hoy then
    insert into public.splitter_ports (org_id, splitter_id, port_number)
    select v_org, v_id, n from generate_series(v_hoy + 1, v_salidas) as n;
  end if;

  return v_id;
end;
$$;

comment on function public.abrir_splitter is
  'Da de alta un splitter dentro de su caja y le crea las salidas de su razón.';

-- ----------------------------------------------------------------------------
-- 4 · De dónde le entra la luz
-- ----------------------------------------------------------------------------
create or replace function public.alimentar_splitter(
  p_splitter uuid,
  p_hilo     uuid default null,
  p_odf_port uuid default null,
  p_salida   uuid default null,
  p_potencia numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_sp  record;
  v_de  text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select id, code into v_sp from public.splitters
   where id = p_splitter and org_id = v_org;
  if v_sp.id is null then
    raise exception 'Ese splitter no existe';
  end if;

  if (case when p_hilo is not null then 1 else 0 end) +
     (case when p_odf_port is not null then 1 else 0 end) +
     (case when p_salida is not null then 1 else 0 end) <> 1 then
    raise exception 'Di por dónde le entra la luz: un hilo, un puerto del ODF o la salida de otro splitter. Una sola.';
  end if;

  if p_hilo is not null then
    perform public.exigir_hilo_libre(p_hilo, 'destino', p_splitter);
    select format('el hilo %s (%s) de %s', s.strand_number, s.color, c.code) into v_de
      from public.fiber_strands s join public.fiber_cables c on c.id = s.cable_id
     where s.id = p_hilo;
  elsif p_odf_port is not null then
    select format('%s bandeja %s puerto %s', e.code, op.tray_number, op.port_number) into v_de
      from public.odf_ports op join public.network_elements e on e.id = op.odf_id
     where op.id = p_odf_port;
  else
    -- Ocupar una salida que ya tiene algo sería empalmar dos cosas al mismo
    -- punto: eso no reparte, apaga.
    if exists (select 1 from public.splitter_ports where id = p_salida and status = 'utilizada') then
      raise exception 'Esa salida ya está ocupada. Elige una disponible.';
    end if;
    select format('la salida %s del splitter %s', sp.port_number, s.code) into v_de
      from public.splitter_ports sp join public.splitters s on s.id = sp.splitter_id
     where sp.id = p_salida;
    update public.splitter_ports set status = 'utilizada', updated_at = now()
     where id = p_salida;
  end if;

  if v_de is null then
    raise exception 'Eso de donde quieres alimentarlo no existe';
  end if;

  update public.splitters
     set in_strand_id = p_hilo,
         in_odf_port_id = p_odf_port,
         in_splitter_port_id = p_salida,
         power_in_dbm = coalesce(p_potencia, power_in_dbm),
         updated_at = now()
   where id = p_splitter;

  if p_hilo is not null then
    update public.fiber_strands
       set status = case when status = 'disponible' then 'en_servicio' else status end,
           updated_at = now()
     where id = p_hilo;
  end if;

  return format('El splitter %s se alimenta de %s.', v_sp.code, v_de);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · A dónde va cada salida
-- ----------------------------------------------------------------------------
create or replace function public.conectar_salida(
  p_salida    uuid,
  p_hilo      uuid default null,
  p_nap       uuid default null,
  p_nap_port  uuid default null,
  p_potencia  numeric default null,
  p_estado    text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_sal record;
  v_a   text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select sp.id, sp.port_number, sp.status, s.code as splitter
    into v_sal
    from public.splitter_ports sp
    join public.splitters s on s.id = sp.splitter_id
   where sp.id = p_salida and sp.org_id = v_org;

  if v_sal.id is null then
    raise exception 'Esa salida no existe';
  end if;

  -- Cambiar solo el estado —reservarla, marcarla dañada— sin conectar nada.
  if p_hilo is null and p_nap is null and p_nap_port is null then
    if p_estado is null then
      raise exception 'Di a dónde va la salida, o en qué estado la quieres dejar.';
    end if;
    update public.splitter_ports
       set status = p_estado,
           out_strand_id = null, out_nap_port_id = null, out_element_id = null,
           updated_at = now()
     where id = p_salida;
    return format('La salida %s de %s quedó %s.', v_sal.port_number, v_sal.splitter, p_estado);
  end if;

  if (case when p_hilo is not null then 1 else 0 end) +
     (case when p_nap is not null then 1 else 0 end) +
     (case when p_nap_port is not null then 1 else 0 end) <> 1 then
    raise exception 'Una salida va a un solo lado: un hilo, una NAP entera o un puerto de NAP.';
  end if;

  if p_hilo is not null then
    perform public.exigir_hilo_libre(p_hilo, 'fuente', p_salida);
    select format('el hilo %s (%s) de %s', s.strand_number, s.color, c.code) into v_a
      from public.fiber_strands s join public.fiber_cables c on c.id = s.cable_id
     where s.id = p_hilo;
  elsif p_nap is not null then
    select format('la NAP %s', code) into v_a from public.network_elements
     where id = p_nap and element_type = 'nap';
    if v_a is null then
      raise exception 'Eso no es una NAP.';
    end if;
  else
    select format('el puerto %s de %s', np.port_number, e.code) into v_a
      from public.nap_ports np join public.network_elements e on e.id = np.element_id
     where np.id = p_nap_port;
  end if;

  if v_a is null then
    raise exception 'Eso a donde la quieres conectar no existe';
  end if;

  update public.splitter_ports
     set out_strand_id = p_hilo,
         out_element_id = p_nap,
         out_nap_port_id = p_nap_port,
         status = 'utilizada',
         power_dbm = coalesce(p_potencia, power_dbm),
         updated_at = now()
   where id = p_salida;

  -- Si la salida alimenta una NAP completa, la NAP se entera de quién la
  -- alimenta: eso es lo que después permite trazarla hasta la OLT.
  if p_nap is not null then
    update public.network_elements set updated_at = now() where id = p_nap;
  end if;

  if p_hilo is not null then
    update public.fiber_strands
       set status = case when status = 'disponible' then 'en_servicio' else status end,
           updated_at = now()
     where id = p_hilo;
  end if;

  return format('La salida %s de %s va a %s.', v_sal.port_number, v_sal.splitter, v_a);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6 · Colgar una NAP de un hilo, con la regla puesta
-- ----------------------------------------------------------------------------
create or replace function public.alimentar_nap(
  p_nap      uuid,
  p_hilo     uuid    default null,
  p_salida   uuid    default null,
  p_potencia numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_nap record;
  v_de  text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select id, code, element_type into v_nap
    from public.network_elements where id = p_nap and org_id = v_org;

  if v_nap.id is null then
    raise exception 'Esa NAP no existe';
  end if;
  if v_nap.element_type <> 'nap' then
    raise exception '% no es una NAP.', v_nap.code;
  end if;
  if (p_hilo is null) = (p_salida is null) then
    raise exception 'Di de dónde se alimenta: de un hilo, o de la salida de un splitter.';
  end if;

  if p_hilo is not null then
    perform public.exigir_hilo_libre(p_hilo, 'destino', p_nap);
    update public.network_elements
       set feed_strand_id = p_hilo,
           input_dbm = coalesce(p_potencia, input_dbm),
           updated_at = now()
     where id = p_nap;
    update public.fiber_strands
       set status = case when status = 'disponible' then 'en_servicio' else status end,
           updated_at = now()
     where id = p_hilo;
    select format('el hilo %s (%s) de %s', s.strand_number, s.color, c.code) into v_de
      from public.fiber_strands s join public.fiber_cables c on c.id = s.cable_id
     where s.id = p_hilo;
  else
    perform public.conectar_salida(p_salida, null, p_nap, null, p_potencia, null);
    update public.network_elements
       set feed_strand_id = null,
           input_dbm = coalesce(p_potencia, input_dbm),
           updated_at = now()
     where id = p_nap;
    select format('la salida %s del splitter %s', sp.port_number, s.code) into v_de
      from public.splitter_ports sp join public.splitters s on s.id = sp.splitter_id
     where sp.id = p_salida;
  end if;

  -- Los puertos de la NAP se abren aquí: una NAP alimentada sin puertos no
  -- sirve para nada, y abrirlos a mano es un paso que se olvida.
  perform public.abrir_puertos_nap(p_nap);

  return format('%s se alimenta de %s.', v_nap.code, v_de);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7 · Validación 9 · el cliente no se cuelga del troncal
-- ----------------------------------------------------------------------------
/*
 * Un cliente entra por un puerto de NAP. Punto.
 *
 * La tentación de campo es real: el troncal pasa por enfrente de la casa, hay
 * hilos libres, y se antoja fusionar el drop directo. Funciona… hasta que hay
 * que abrir ese troncal, y entonces se cae media localidad en vez de una NAP.
 * Por eso el sistema no lo deja capturar.
 */
create or replace function public.exigir_terminal_de_cliente(p_elemento uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_e record;
begin
  if p_elemento is null then return; end if;

  select code, element_type into v_e
    from public.network_elements where id = p_elemento;

  if v_e.code is null then
    raise exception 'Ese elemento no existe';
  end if;

  if v_e.element_type <> 'nap' then
    raise exception
      'Un cliente se conecta en una NAP, no directo en %. Si de veras va colgado ahí, primero da de alta la NAP en ese punto y cuélgalo de un puerto.',
      v_e.code;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8 · Vistas
-- ----------------------------------------------------------------------------
create or replace view public.v_splitters with (security_invoker = true) as
select s.id,
       s.org_id,
       s.code,
       s.ratio,
       s.housing_id,
       e.code                              as caja,
       e.element_type                      as tipo_caja,
       s.site_id,
       si.name                             as sitio,
       s.latitude,
       s.longitude,
       s.status,
       s.loss_db,
       s.power_in_dbm,
       s.installed_at,
       p.full_name                         as responsable,
       s.notes,
       s.is_active,
       split_part(s.ratio, 'x', 2)::int    as salidas,
       (select count(*) from public.splitter_ports sp
         where sp.splitter_id = s.id and sp.status = 'utilizada')      as usadas,
       (select count(*) from public.splitter_ports sp
         where sp.splitter_id = s.id and sp.status = 'disponible')     as libres,
       (select count(*) from public.splitter_ports sp
         where sp.splitter_id = s.id and sp.status = 'danada')         as danadas,
       -- De dónde le entra la luz, dicho en una línea.
       coalesce(
         (select format('hilo %s de %s', st.strand_number, c.code)
            from public.fiber_strands st join public.fiber_cables c on c.id = st.cable_id
           where st.id = s.in_strand_id),
         (select format('%s bandeja %s puerto %s', oe.code, op.tray_number, op.port_number)
            from public.odf_ports op join public.network_elements oe on oe.id = op.odf_id
           where op.id = s.in_odf_port_id),
         (select format('salida %s de %s', sp.port_number, s2.code)
            from public.splitter_ports sp join public.splitters s2 on s2.id = sp.splitter_id
           where sp.id = s.in_splitter_port_id)
       )                                                               as entrada
  from public.splitters s
  join public.network_elements e on e.id = s.housing_id
  left join public.network_sites si on si.id = s.site_id
  left join public.profiles p on p.id = s.installed_by;

comment on view public.v_splitters is
  'Los splitters con su caja, su entrada y cuántas salidas les quedan.';

create or replace view public.v_salidas_splitter with (security_invoker = true) as
select sp.id,
       sp.org_id,
       sp.splitter_id,
       s.code                       as splitter,
       s.ratio,
       s.housing_id,
       e.code                       as caja,
       sp.port_number,
       sp.status,
       sp.power_dbm,
       sp.notes,
       sp.out_strand_id,
       c.code                       as cable,
       st.strand_number,
       st.color                     as color_hilo,
       sp.out_element_id,
       ne.code                      as nap,
       sp.out_nap_port_id,
       np.port_number               as puerto_nap
  from public.splitter_ports sp
  join public.splitters s on s.id = sp.splitter_id
  join public.network_elements e on e.id = s.housing_id
  left join public.fiber_strands st on st.id = sp.out_strand_id
  left join public.fiber_cables c on c.id = st.cable_id
  left join public.network_elements ne on ne.id = sp.out_element_id
  left join public.nap_ports np on np.id = sp.out_nap_port_id;

/*
 * Validación 8 · la caja de empalme, por dentro.
 *
 * Qué hilos entran, cuáles salen, cuáles quedaron fusionados y cuáles están
 * libres. Es la hoja que uno quisiera tener pegada por dentro de la tapa antes
 * de subirse al poste.
 */
create or replace view public.v_caja_por_dentro with (security_invoker = true) as
select e.id                                    as caja_id,
       e.org_id,
       e.code                                  as caja,
       e.element_type,
       f.id                                    as fusion_id,
       f.status                                as estado_fusion,
       f.splice_type,
       f.loss_db,
       ci.code                                 as cable_entra,
       si.strand_number                        as hilo_entra,
       si.color                                as color_entra,
       co.code                                 as cable_sale,
       so.strand_number                        as hilo_sale,
       so.color                                as color_sale,
       d.code                                  as termina_en,
       case
         when f.out_strand_id is not null then 'empalmado'
         when f.to_element_id is not null then 'termina'
         else 'suelto'
       end                                     as que_hace
  from public.network_elements e
  left join public.fiber_splices f on f.closure_id = e.id
  left join public.fiber_strands si on si.id = f.in_strand_id
  left join public.fiber_cables  ci on ci.id = si.cable_id
  left join public.fiber_strands so on so.id = f.out_strand_id
  left join public.fiber_cables  co on co.id = so.cable_id
  left join public.network_elements d on d.id = f.to_element_id
 where e.element_type in ('closure', 'nap');

comment on view public.v_caja_por_dentro is
  'Qué entra, qué sale y qué queda empalmado en cada caja. La hoja de la tapa.';

/*
 * Validación 7 · la NAP con su cuenta clara.
 */
create or replace view public.v_naps with (security_invoker = true) as
select e.id,
       e.org_id,
       e.code,
       e.name,
       e.zone_id,
       z.name                                   as zona,
       e.site_id,
       e.latitude,
       e.longitude,
       e.status,
       e.capacity                               as puertos,
       (select count(*) from public.nap_ports np
         where np.element_id = e.id and np.status = 'ocupado')     as ocupados,
       (select count(*) from public.nap_ports np
         where np.element_id = e.id and np.status = 'libre')       as disponibles,
       (select count(*) from public.nap_ports np
         where np.element_id = e.id and np.status = 'reservado')   as reservados,
       (select count(*) from public.nap_ports np
         where np.element_id = e.id and np.status = 'danado')      as danados,
       e.input_dbm,
       e.cable_id,
       c.code                                   as cable,
       e.cable_pos_m,
       e.feed_strand_id,
       fs.strand_number                         as hilo,
       fs.color                                 as color_hilo,
       (select s.code from public.splitter_ports sp
          join public.splitters s on s.id = sp.splitter_id
         where sp.out_element_id = e.id limit 1) as splitter,
       e.installed_at,
       p.full_name                              as responsable,
       e.notes,
       e.is_active
  from public.network_elements e
  left join public.zones z on z.id = e.zone_id
  left join public.fiber_cables c on c.id = e.cable_id
  left join public.fiber_strands fs on fs.id = e.feed_strand_id
  left join public.profiles p on p.id = e.installed_by
 where e.element_type = 'nap';

comment on view public.v_naps is
  'Cada NAP con su capacidad, ocupados y disponibles, y de qué se alimenta.';

-- ----------------------------------------------------------------------------
-- 9 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.fuente_del_hilo(uuid, uuid)             from public, anon;
revoke all on function public.destino_del_hilo(uuid, uuid)            from public, anon;
revoke all on function public.exigir_hilo_libre(uuid, text, uuid)     from public, anon;
revoke all on function public.exigir_terminal_de_cliente(uuid)        from public, anon;
revoke all on function public.abrir_splitter(text, uuid, text, numeric, text, uuid) from public, anon;
revoke all on function public.alimentar_splitter(uuid, uuid, uuid, uuid, numeric)   from public, anon;
revoke all on function public.conectar_salida(uuid, uuid, uuid, uuid, numeric, text) from public, anon;
revoke all on function public.alimentar_nap(uuid, uuid, uuid, numeric) from public, anon;

grant execute on function public.fuente_del_hilo(uuid, uuid)          to authenticated;
grant execute on function public.destino_del_hilo(uuid, uuid)         to authenticated;
grant execute on function public.exigir_hilo_libre(uuid, text, uuid)  to authenticated;
grant execute on function public.exigir_terminal_de_cliente(uuid)     to authenticated;
grant execute on function public.abrir_splitter(text, uuid, text, numeric, text, uuid) to authenticated;
grant execute on function public.alimentar_splitter(uuid, uuid, uuid, uuid, numeric)   to authenticated;
grant execute on function public.conectar_salida(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.alimentar_nap(uuid, uuid, uuid, numeric) to authenticated;
