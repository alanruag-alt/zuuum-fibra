-- ============================================================================
-- 040 · La caja por dentro
--
-- Hasta aquí las fusiones se capturaban en una lista: caja, hilo que entra,
-- hilo que sale. Funciona, pero no se parece a nada. Adentro de una caja de
-- empalme hay cables de un lado y cables del otro, y el trabajo consiste en
-- pegar un hilo con otro. Eso se ve; una lista de renglones no.
--
-- Esta migración pone lo que la pantalla necesita para dibujar el interior y
-- para dejar empalmar arrastrando de un hilo a otro:
--
--   · qué cables entran a esta caja
--   · qué hilos trae cada uno, de dónde vienen y a dónde van
--   · empalmar dos hilos, con la base decidiendo cuál es el que alimenta
--   · soltar un empalme, y que los hilos vuelvan a quedar libres
--   · sacar las fusiones de la caja para llevárselas en una hoja
--
-- La regla de siempre: las validaciones van aquí, no en la pantalla. Un hilo
-- entra a un solo lado y sale a un solo lado, y eso se cumple aunque alguien
-- llame a la función desde otra parte.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0 · Un recado que salió mal escrito
-- ----------------------------------------------------------------------------
/*
 * En 035 el mensaje decía «ya viene des la NAP X» — una «s» suelta de un
 * marcador mal puesto. Se lee mil veces al capturar; vale la pena arreglarlo.
 */
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
    'El hilo % (%) de % ya % %. Un hilo va a un solo lado; si de verdad va para allá, quita primero lo anterior.',
    v_hilo.strand_number, v_hilo.color, v_hilo.cable,
    case when p_como = 'fuente' then 'viene de' else 'alimenta' end,
    v_quien;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1 · Qué cables entran a la caja
-- ----------------------------------------------------------------------------
/*
 * Un cable está en la caja por cualquiera de cuatro razones, y las cuatro
 * cuentan: porque nace ahí, porque muere ahí, porque alguien lo enganchó a
 * mano al derivar sobre su línea, o porque ya tiene un hilo empalmado adentro.
 *
 * La última no es redundante. Un cable que pasa de largo por la calle y del
 * que se cortaron dos hilos en esta caja no nace ni muere aquí, pero si no
 * apareciera en el dibujo, los dos hilos empalmados no tendrían de dónde
 * salir y el diagrama mentiría.
 */
create or replace function public.cables_en_caja(p_caja uuid)
returns table (
  cable_id   uuid,
  codigo     text,
  papel      text,
  hilos      int,
  metros     numeric,
  enganchado boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with mios as (
    select c.id,
           c.code,
           c.fiber_count,
           c.length_m,
           case when c.from_id = p_caja then 'sale'
                when c.to_id   = p_caja then 'llega'
                else 'pasa' end as papel,
           exists (select 1 from public.closure_cables cc
                    where cc.closure_id = p_caja and cc.cable_id = c.id) as enganchado
      from public.fiber_cables c
     where c.org_id = public.auth_org_id()
       and c.is_active
       and (
         c.from_id = p_caja
         or c.to_id = p_caja
         or exists (select 1 from public.closure_cables cc
                     where cc.closure_id = p_caja and cc.cable_id = c.id)
         or exists (select 1
                      from public.fiber_splices f
                      join public.fiber_strands s
                        on s.id = f.in_strand_id or s.id = f.out_strand_id
                     where f.closure_id = p_caja
                       and f.status = 'activa'
                       and s.cable_id = c.id)
         or exists (select 1
                      from public.splitters sp
                      join public.fiber_strands s on s.id = sp.in_strand_id
                     where sp.housing_id = p_caja and s.cable_id = c.id)
         or exists (select 1
                      from public.splitter_ports sp
                      join public.splitters sl on sl.id = sp.splitter_id
                      join public.fiber_strands s on s.id = sp.out_strand_id
                     where sl.housing_id = p_caja and s.cable_id = c.id)
       )
  )
  select mios.id, mios.code, mios.papel, mios.fiber_count, mios.length_m, mios.enganchado
    from mios
   order by case mios.papel when 'llega' then 1 when 'sale' then 2 else 3 end, mios.code;
$$;

comment on function public.cables_en_caja is
  'Los cables que hay que dibujar a los lados de la caja, con su papel.';

-- ----------------------------------------------------------------------------
-- 2 · Los hilos de la caja, con lo que trae cada uno
-- ----------------------------------------------------------------------------
/*
 * Un renglón por hilo de cada cable de la caja. Lleva de dónde le llega la
 * luz y hacia dónde sigue —lo que en la pantalla son las dos etiquitas de
 * abajo— y, si está empalmado AQUÍ, con qué hilo y bajo qué fusión.
 *
 * Lo de `cortado_aqui` importa: un hilo cortado en esta caja aguas abajo ya
 * no viene del ODF, viene de lo que se le empalme aquí. Si eso no se dijera
 * en el dibujo, alguien lo daría por bueno y mediría de más.
 */
create or replace function public.hilos_en_caja(p_caja uuid)
returns table (
  hilo_id     uuid,
  cable_id    uuid,
  cable       text,
  numero      int,
  color       text,
  tubo        int,
  estado      text,
  cortado_aqui boolean,
  viene_de    text,
  va_a        text,
  fusion_id   uuid,
  par_id      uuid,
  par_texto   text,
  termina_en  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.cable_id,
         c.code,
         s.strand_number,
         s.color,
         s.tube_number,
         s.status,
         coalesce(s.cut_at @> to_jsonb(array[p_caja::text]), false),
         public.fuente_del_hilo(s.id),
         public.destino_del_hilo(s.id),
         f.id,
         case when f.in_strand_id = s.id then f.out_strand_id else f.in_strand_id end,
         (select format('%s hilo %s (%s)', c2.code, s2.strand_number, s2.color)
            from public.fiber_strands s2
            join public.fiber_cables c2 on c2.id = s2.cable_id
           where s2.id = case when f.in_strand_id = s.id
                              then f.out_strand_id else f.in_strand_id end),
         (select e.code from public.network_elements e where e.id = f.to_element_id)
    from public.cables_en_caja(p_caja) cec
    join public.fiber_cables c on c.id = cec.cable_id
    join public.fiber_strands s on s.cable_id = c.id
    left join public.fiber_splices f
           on f.closure_id = p_caja
          and f.status = 'activa'
          and (f.in_strand_id = s.id or f.out_strand_id = s.id)
   order by c.code, s.strand_number;
$$;

comment on function public.hilos_en_caja is
  'Todos los hilos que se pueden tocar dentro de esta caja, con su ocupación.';

-- ----------------------------------------------------------------------------
-- 3 · Empalmar arrastrando
-- ----------------------------------------------------------------------------
/*
 * Esta es la función del arrastre: se sueltan dos hilos y la base decide cuál
 * es el que alimenta y cuál el que recibe.
 *
 * Lo decide sola a propósito. Quien está frente a la caja sabe que va a pegar
 * el hilo 4 del troncal con el 1 del ramal; no tiene por qué saber cuál de
 * los dos es «entrada» en un modelo de datos. El que ya trae luz es la
 * entrada. Si ninguno trae, se toma el primero y se dice en el recado, para
 * que quien capture pueda corregirlo si iba al revés.
 *
 * Si los dos ya vienen alimentados, no hay forma de adivinar y sería un
 * empalme que apaga a alguien: se niega y se dice quién alimenta a cada uno.
 */
create or replace function public.empalmar(
  p_caja    uuid,
  p_a       uuid,
  p_b       uuid,
  p_tipo    text    default 'fusion',
  p_perdida numeric default null,
  p_notas   text    default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_caja record;
  v_ha   record;
  v_hb   record;
  v_ent  uuid;
  v_sal  uuid;
  v_fa   text;
  v_fb   text;
  v_adiv boolean := false;
  v_id   uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para empalmar' using errcode = '42501';
  end if;

  if p_a is null or p_b is null then
    raise exception 'Faltan los dos hilos que se van a empalmar';
  end if;
  if p_a = p_b then
    raise exception 'Ese es el mismo hilo. Un hilo no se empalma consigo mismo.';
  end if;

  select e.id, e.code, e.element_type into v_caja
    from public.network_elements e where e.id = p_caja and e.org_id = v_org;

  if v_caja.id is null then
    raise exception 'Esa caja no existe';
  end if;
  if v_caja.element_type not in ('closure', 'nap') then
    raise exception '% no es una caja de empalme: adentro de eso no se fusiona.', v_caja.code;
  end if;

  select s.id, s.strand_number, s.color, c.id as cable_id, c.code as cable
    into v_ha
    from public.fiber_strands s
    join public.fiber_cables c on c.id = s.cable_id
   where s.id = p_a and s.org_id = v_org;

  select s.id, s.strand_number, s.color, c.id as cable_id, c.code as cable
    into v_hb
    from public.fiber_strands s
    join public.fiber_cables c on c.id = s.cable_id
   where s.id = p_b and s.org_id = v_org;

  if v_ha.id is null or v_hb.id is null then
    raise exception 'Alguno de esos dos hilos no existe';
  end if;

  -- Ninguno de los dos puede venir ya empalmado en ESTA caja. Si lo está, o
  -- está mal capturado, o alguien va a dejar sin servicio a quien colgaba de
  -- ese empalme sin darse cuenta.
  if exists (select 1 from public.fiber_splices f
              where f.closure_id = p_caja and f.status = 'activa'
                and (f.in_strand_id in (p_a, p_b) or f.out_strand_id in (p_a, p_b))) then
    raise exception
      'Uno de esos hilos ya tiene un empalme en %. Suéltalo primero: se ve en el diagrama, es la línea que sale de su punto.',
      v_caja.code;
  end if;

  v_fa := public.fuente_del_hilo(p_a);
  v_fb := public.fuente_del_hilo(p_b);

  if v_fa is not null and v_fb is not null then
    raise exception
      'Los dos hilos ya vienen alimentados: el % de % viene de %, y el % de % viene de %. Empalmarlos apagaría a alguien.',
      v_ha.strand_number, v_ha.cable, v_fa,
      v_hb.strand_number, v_hb.cable, v_fb;
  end if;

  if v_fa is not null then
    v_ent := p_a; v_sal := p_b;
  elsif v_fb is not null then
    v_ent := p_b; v_sal := p_a;
  else
    v_ent := p_a; v_sal := p_b;
    v_adiv := true;
  end if;

  -- El que va a recibir no puede estar ya alimentado por otro lado, y el que
  -- alimenta no puede estar ya mandando a otra parte.
  perform public.exigir_hilo_libre(v_sal, 'fuente');
  perform public.exigir_hilo_libre(v_ent, 'destino');

  -- Los dos cables quedan enganchados a la caja, para que el dibujo los siga
  -- enseñando aunque solo pasen de largo por la calle.
  perform public.enganchar_cable(p_caja, v_ha.cable_id);
  perform public.enganchar_cable(p_caja, v_hb.cable_id);

  v_id := public.guardar_fusion(
    p_caja    => p_caja,
    p_entrada => v_ent,
    p_salida  => v_sal,
    p_tipo    => coalesce(p_tipo, 'fusion'),
    p_perdida => p_perdida,
    p_notas   => p_notas);

  return format('Empalmado en %s: %s hilo %s (%s) → %s hilo %s (%s).%s',
    v_caja.code,
    case when v_ent = p_a then v_ha.cable else v_hb.cable end,
    case when v_ent = p_a then v_ha.strand_number else v_hb.strand_number end,
    case when v_ent = p_a then v_ha.color else v_hb.color end,
    case when v_sal = p_a then v_ha.cable else v_hb.cable end,
    case when v_sal = p_a then v_ha.strand_number else v_hb.strand_number end,
    case when v_sal = p_a then v_ha.color else v_hb.color end,
    case when v_adiv
         then ' Ninguno de los dos traía luz todavía, así que se tomó el primero como el que alimenta. Si va al revés, suelta el empalme y hazlo al contrario.'
         else '' end);
end;
$$;

comment on function public.empalmar is
  'Pega dos hilos dentro de una caja. La base decide cuál alimenta a cuál.';

-- ----------------------------------------------------------------------------
-- 4 · Terminar un hilo en una NAP o en un splitter
-- ----------------------------------------------------------------------------
/*
 * El otro movimiento del diagrama: arrastrar un hilo hasta la NAP o hasta la
 * entrada del splitter que están en la misma caja. No es un empalme entre dos
 * hilos, es una terminación, y el modelo ya la tenía —`feed_strand_id` en la
 * NAP, `in_strand_id` en el splitter—; lo que faltaba era una sola puerta que
 * la pantalla pudiera llamar sin saber cuál de las dos es.
 */
create or replace function public.terminar_hilo(
  p_caja     uuid,
  p_hilo     uuid,
  p_destino  uuid,
  p_potencia numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_el  record;
  v_sp  record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select e.id, e.code, e.element_type into v_el
    from public.network_elements e where e.id = p_destino and e.org_id = v_org;

  if v_el.id is not null then
    if v_el.element_type <> 'nap' then
      raise exception 'Un hilo se termina en una NAP o en un splitter, no en %.', v_el.code;
    end if;
    perform public.enganchar_cable(p_caja,
      (select s.cable_id from public.fiber_strands s where s.id = p_hilo));
    return public.alimentar_nap(v_el.id, p_hilo, null, p_potencia);
  end if;

  select s.id, s.code into v_sp
    from public.splitters s where s.id = p_destino and s.org_id = v_org;

  if v_sp.id is null then
    raise exception 'Ese destino no existe: ni NAP ni splitter';
  end if;

  perform public.enganchar_cable(p_caja,
    (select s.cable_id from public.fiber_strands s where s.id = p_hilo));

  return public.alimentar_splitter(v_sp.id, p_hilo, null, null, p_potencia);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Soltar un empalme
-- ----------------------------------------------------------------------------
/*
 * Se dice qué se acaba de desconectar y, si aguas abajo colgaba gente, se
 * dice cuánta. Soltar un empalme en una caja es exactamente lo mismo que
 * cortar la fibra con unas pinzas: si detrás hay treinta clientes, quien lo
 * hace merece enterarse en ese momento y no por el teléfono.
 */
create or replace function public.soltar_empalme(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_f   record;
  v_n   int := 0;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para soltar empalmes' using errcode = '42501';
  end if;

  select f.id, f.out_strand_id, e.code as caja,
         ci.code as cable_entra, si.strand_number as hilo_entra, si.color as color_entra,
         co.code as cable_sale,  so.strand_number as hilo_sale,  so.color as color_sale
    into v_f
    from public.fiber_splices f
    join public.network_elements e on e.id = f.closure_id
    left join public.fiber_strands si on si.id = f.in_strand_id
    left join public.fiber_cables  ci on ci.id = si.cable_id
    left join public.fiber_strands so on so.id = f.out_strand_id
    left join public.fiber_cables  co on co.id = so.cable_id
   where f.id = p_id and f.org_id = v_org;

  if v_f.id is null then
    raise exception 'Ese empalme no existe';
  end if;

  if v_f.out_strand_id is not null then
    select count(*) into v_n from public.aguas_abajo(v_f.out_strand_id) a
     where a.que = 'cliente';
  end if;

  perform public.eliminar_fusion(p_id);

  return format('Soltado en %s: %s hilo %s (%s) ya no va a %s hilo %s (%s).%s',
    v_f.caja,
    v_f.cable_entra, v_f.hilo_entra, v_f.color_entra,
    coalesce(v_f.cable_sale, '—'), coalesce(v_f.hilo_sale::text, '—'),
    coalesce(v_f.color_sale, '—'),
    case when v_n > 0
         then format(' Ojo: de ahí colgaban %s clientes, que acaban de quedarse sin señal.', v_n)
         else '' end);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6 · Quitar un cable del dibujo
-- ----------------------------------------------------------------------------
/*
 * Solo quita el cable del diagrama de esta caja; el cable y sus hilos se
 * quedan enteros en el sistema. Se niega si adentro de la caja hay algo suyo
 * conectado, porque entonces el dibujo quedaría enseñando un empalme que sale
 * de un cable invisible.
 */
create or replace function public.soltar_cable_de_caja(p_caja uuid, p_cable uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.auth_org_id();
  v_cod text;
  v_n   int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select c.code into v_cod from public.fiber_cables c
   where c.id = p_cable and c.org_id = v_org;

  if v_cod is null then
    raise exception 'Ese cable no existe';
  end if;

  select count(*) into v_n
    from public.fiber_splices f
    join public.fiber_strands s
      on s.id = f.in_strand_id or s.id = f.out_strand_id
   where f.closure_id = p_caja and f.status = 'activa' and s.cable_id = p_cable;

  if v_n > 0 then
    raise exception
      'No se puede quitar % del dibujo: tiene % empalmes en esta caja. Suéltalos primero.',
      v_cod, v_n;
  end if;

  select count(*) into v_n
    from public.splitter_ports sp
    join public.splitters sl on sl.id = sp.splitter_id
    join public.fiber_strands s on s.id = sp.out_strand_id
   where sl.housing_id = p_caja and s.cable_id = p_cable;

  if v_n > 0 then
    raise exception
      'No se puede quitar % del dibujo: %s de sus hilos salen de un splitter de esta caja.',
      v_cod, v_n;
  end if;

  if exists (select 1 from public.fiber_cables c
              where c.id = p_cable and (c.from_id = p_caja or c.to_id = p_caja)) then
    raise exception
      'No se puede quitar %: ese cable nace o muere en esta caja. Siempre va a estar aquí.',
      v_cod;
  end if;

  delete from public.closure_cables
   where closure_id = p_caja and cable_id = p_cable;

  return format('%s se quitó del dibujo de esta caja. El cable y sus hilos siguen enteros.', v_cod);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7 · Las fusiones de la caja, para llevárselas
-- ----------------------------------------------------------------------------
/*
 * Un renglón por empalme, con todo lo que se necesita para revisar la caja
 * sin la caja enfrente: los dos cables, los dos hilos con su tubo y su color,
 * qué tipo de empalme es, la pérdida, quién lo hizo y cuándo.
 *
 * Se saca aparte y no de la vista general porque la hoja tiene un uso muy
 * concreto: se imprime, se mete en la caja, y ahí se queda. El siguiente que
 * la abra —que puede ser otro, dentro de tres años— sabe qué hay adentro
 * antes de tocar nada.
 */
create or replace function public.fusiones_de_caja(p_caja uuid)
returns table (
  caja          text,
  cable_entra   text,
  tubo_entra    int,
  hilo_entra    int,
  color_entra   text,
  tipo          text,
  cable_sale    text,
  tubo_sale     int,
  hilo_sale     int,
  color_sale    text,
  termina_en    text,
  perdida_db    numeric,
  estado        text,
  responsable   text,
  fecha         date,
  observaciones text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.code,
         ci.code, si.tube_number, si.strand_number, si.color,
         f.splice_type,
         co.code, so.tube_number, so.strand_number, so.color,
         d.code,
         f.loss_db,
         f.status,
         p.full_name,
         f.created_at::date,
         f.notes
    from public.fiber_splices f
    join public.network_elements e on e.id = f.closure_id
    left join public.fiber_strands si on si.id = f.in_strand_id
    left join public.fiber_cables  ci on ci.id = si.cable_id
    left join public.fiber_strands so on so.id = f.out_strand_id
    left join public.fiber_cables  co on co.id = so.cable_id
    left join public.network_elements d on d.id = f.to_element_id
    left join public.profiles p on p.id = f.created_by
   where f.closure_id = p_caja
     and f.org_id = public.auth_org_id()
   order by ci.code, si.strand_number;
$$;

comment on function public.fusiones_de_caja is
  'Las fusiones de una caja, en el orden en que conviene revisarlas.';

/*
 * Y los clientes que cuelgan de esta caja, que es la segunda hoja de esa
 * misma descarga. Antes de tocar una caja conviene saber a quién le va a
 * doler.
 */
create or replace function public.clientes_de_caja(p_caja uuid)
returns table (
  contrato  text,
  cliente   text,
  telefono  text,
  direccion text,
  nap       text,
  puerto    int,
  rx_dbm    numeric,
  estado    text
)
language sql
stable
security definer
set search_path = ''
as $$
  with colgado as (
    select distinct ab.elemento_id
      from public.fiber_splices f
      join public.fiber_strands so on so.id = f.out_strand_id
      cross join lateral public.aguas_abajo(so.id) ab
     where f.closure_id = p_caja
       and f.status = 'activa'
       and f.org_id = public.auth_org_id()
       and ab.que in ('nap', 'elemento')
  )
  select c.customer_code,
         c.full_name,
         c.phone,
         nullif(concat_ws(' ', d.street, d.number, d.neighborhood), ''),
         e.code,
         np.port_number,
         np.rx_dbm,
         sv.status
    from colgado g
    join public.network_elements e on e.id = g.elemento_id
    join public.nap_ports np on np.element_id = e.id
    join public.customer_services sv on sv.id = np.service_id
    join public.customers c on c.id = sv.customer_id
    left join public.addresses d on d.id = sv.address_id
   order by e.code, np.port_number;
$$;

comment on function public.clientes_de_caja is
  'A quién le pega si se abre esta caja. La lista que uno quiere antes de subir a la escalera.';

-- ----------------------------------------------------------------------------
-- 8 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.cables_en_caja(uuid)                              from public, anon;
revoke all on function public.hilos_en_caja(uuid)                               from public, anon;
revoke all on function public.empalmar(uuid, uuid, uuid, text, numeric, text)   from public, anon;
revoke all on function public.terminar_hilo(uuid, uuid, uuid, numeric)          from public, anon;
revoke all on function public.soltar_empalme(uuid)                              from public, anon;
revoke all on function public.soltar_cable_de_caja(uuid, uuid)                  from public, anon;
revoke all on function public.fusiones_de_caja(uuid)                            from public, anon;
revoke all on function public.clientes_de_caja(uuid)                            from public, anon;

grant execute on function public.cables_en_caja(uuid)                            to authenticated;
grant execute on function public.hilos_en_caja(uuid)                             to authenticated;
grant execute on function public.empalmar(uuid, uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.terminar_hilo(uuid, uuid, uuid, numeric)        to authenticated;
grant execute on function public.soltar_empalme(uuid)                            to authenticated;
grant execute on function public.soltar_cable_de_caja(uuid, uuid)                to authenticated;
grant execute on function public.fusiones_de_caja(uuid)                          to authenticated;
grant execute on function public.clientes_de_caja(uuid)                          to authenticated;
