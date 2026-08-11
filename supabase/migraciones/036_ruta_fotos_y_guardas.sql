-- ============================================================================
-- 036 · La ruta completa, las fotos y las guardas de borrado
--
-- Aquí es donde todo lo anterior sirve para algo. La pregunta que este archivo
-- contesta es la que se hace a las once de la noche con el teléfono sonando:
--
--   «Fulano no tiene internet. ¿Por dónde le llega?»
--
--   Sitio Cuencamé → OLT Huawei EA5800 → PON 0/1/3 → ODF 1 puerto 12
--   → Troncal Ruta Centro → hilo 4 → caja CE-005 → splitter 1x8 salida 3
--   → NAP-024 puerto 6 → el cliente
--
-- Y la contraria, que es la que sirve cuando suenan veinte teléfonos:
-- «¿a quiénes les pega si truena este PON?».
--
--   ruta_de_servicio()   de la OLT al cliente, renglón por renglón
--   ruta_de_cliente()    lo mismo, buscando por cliente
--   aguas_abajo()        todo lo que cuelga de un punto
--   clientes_de_pon()    a quién le pega si truena ese puerto
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Fotografías
-- ----------------------------------------------------------------------------
/*
 * Una tabla para todas, con el nombre de la tabla y el renglón al que
 * pertenecen. Se hace polimórfica a propósito: fotos hay de todo —de la caja,
 * del splitter, del poste, del empalme— y una columna `foto_url` por tabla
 * termina en «solo cabe una» el día que el técnico toma tres.
 *
 * En la base va la RUTA del archivo, no el archivo. El archivo vive en el
 * Storage de Supabase, que es el que sabe servirlo y cobrar por él.
 */
create table if not exists public.network_photos (
  id           uuid primary key default extensions.gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  tabla        text not null check (tabla in
               ('network_sites','network_devices','network_elements','fiber_cables',
                'fiber_strands','fiber_splices','splitters','poles','odf_ports','nap_ports')),
  registro_id  uuid not null,
  ruta         text not null,
  descripcion  text,
  tomada_en    timestamptz,
  bytes        integer,
  subida_por   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint network_photos_ruta_unica unique (org_id, ruta)
);

comment on table public.network_photos is
  'Las fotos de campo. En la base va la ruta del archivo; el archivo vive en Storage.';
comment on column public.network_photos.ruta is
  'Ruta dentro del bucket «red», por ejemplo splitters/<id>/2026-08-11-caja-abierta.jpg';

create index if not exists fotos_registro_idx on public.network_photos(tabla, registro_id);

alter table public.network_photos enable row level security;

create policy fotos_lectura on public.network_photos for select
  using (org_id = public.auth_org_id() and public.auth_has('network.read'));
create policy fotos_escritura on public.network_photos for all
  using (org_id = public.auth_org_id() and public.auth_has('network.write'))
  with check (org_id = public.auth_org_id() and public.auth_has('network.write'));

grant select, insert, update, delete on public.network_photos to authenticated;

create or replace function public.guardar_foto(
  p_tabla    text,
  p_registro uuid,
  p_ruta     text,
  p_desc     text default null,
  p_bytes    int  default null
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
    raise exception 'No tienes permiso para subir fotos de red' using errcode = '42501';
  end if;

  insert into public.network_photos
    (org_id, tabla, registro_id, ruta, descripcion, bytes, tomada_en, subida_por)
  values (v_org, p_tabla, p_registro, p_ruta, p_desc, p_bytes, now(), auth.uid())
  on conflict (org_id, ruta) do update
     set descripcion = coalesce(excluded.descripcion, public.network_photos.descripcion)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.eliminar_foto(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_ruta text;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar fotos' using errcode = '42501';
  end if;

  delete from public.network_photos where id = p_id and org_id = v_org
  returning ruta into v_ruta;

  if v_ruta is null then
    raise exception 'Esa foto no existe';
  end if;

  -- Se devuelve la ruta para que quien llame borre también el archivo del
  -- Storage. Borrar el renglón y dejar el archivo llena el bucket de basura
  -- que nadie va a encontrar nunca.
  return v_ruta;
end;
$$;

/*
 * El bucket y sus permisos.
 *
 * Va dentro de un bloque que primero pregunta si existe el esquema `storage`,
 * porque la base de pruebas que se levanta en la computadora no lo trae. Sin
 * esta guarda, correr las pruebas tronaría aquí y no se podría probar nada de
 * lo demás.
 */
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Sin esquema storage: se omite el bucket de fotos (esto es normal en pruebas).';
    return;
  end if;

  -- Privado: las fotos de la red enseñan dónde está el equipo y cómo se llega.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('red', 'red', false, 10485760,
          array['image/jpeg','image/png','image/webp','image/heic'])
  on conflict (id) do nothing;

  execute $p$
    drop policy if exists fotos_red_ver on storage.objects;
    create policy fotos_red_ver on storage.objects for select to authenticated
      using (bucket_id = 'red' and public.auth_has('network.read'));
  $p$;
  execute $p$
    drop policy if exists fotos_red_subir on storage.objects;
    create policy fotos_red_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'red' and public.auth_has('network.write'));
  $p$;
  execute $p$
    drop policy if exists fotos_red_borrar on storage.objects;
    create policy fotos_red_borrar on storage.objects for delete to authenticated
      using (bucket_id = 'red' and public.auth_has('network.write'));
  $p$;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2 · La ruta completa de un servicio
-- ----------------------------------------------------------------------------
/*
 * Se camina de abajo hacia arriba —del cliente a la OLT— porque hacia arriba
 * cada punto tiene UN solo origen, y hacia abajo tiene muchos. Subir es
 * caminar una línea; bajar es abrir un árbol.
 *
 * Al final se voltea, porque nadie explica una ruta empezando por el cliente.
 *
 * El tope de 60 saltos no es por miedo a redes grandes: es por si alguien
 * captura un ciclo —una fusión que regresa a su propio hilo— y el sistema se
 * quedaría dando vueltas para siempre.
 */
create or replace function public.ruta_de_servicio(p_servicio uuid)
returns table (
  paso    int,
  que     text,
  nombre  text,
  detalle text,
  ref_id  uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_pasos  text[][] := array[]::text[][];
  v_srv    record;
  v_nap    record;
  v_st     record;
  v_fus    record;
  v_pon    record;
  -- Todo el estado del recorrido son uuid sueltos, no «record».
  -- Un record sin asignar en plpgsql no se puede ni preguntar si es nulo:
  -- truena con «tuple structure is indeterminate». Con uuid se puede.
  v_hilo    uuid;
  v_sal_id  uuid;   -- salida de splitter por la que venimos
  v_odf_id  uuid;   -- puerto del ODF al que llegamos
  v_saltos  int := 0;
  i         int;
  v_sal     record;
  v_odf     record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;

  select s.id, c.full_name, c.customer_code
    into v_srv
    from public.customer_services s
    join public.customers c on c.id = s.customer_id
   where s.id = p_servicio and s.org_id = v_org;

  if v_srv.id is null then
    raise exception 'Ese servicio no existe';
  end if;

  v_pasos := v_pasos || array[array['cliente', v_srv.full_name,
                                    coalesce(v_srv.customer_code, ''), v_srv.id::text]];

  select np.id, np.port_number, np.rx_dbm, e.id as nap_id, e.code as nap, e.capacity,
         e.feed_strand_id
    into v_nap
    from public.nap_ports np
    join public.network_elements e on e.id = np.element_id
   where np.service_id = p_servicio;

  if v_nap.id is null then
    -- Sin puerto de NAP no hay ruta que seguir. Se dice qué falta capturar en
    -- vez de devolver una lista vacía, que no explica nada.
    v_pasos := v_pasos || array[array['pendiente', 'Falta el puerto de NAP',
      'Este servicio no está asignado a ningún puerto. Asígnalo en la NAP para poder trazarlo.', '']];
  else
    v_pasos := v_pasos || array[array['puerto_nap',
      format('%s puerto %s', v_nap.nap, v_nap.port_number),
      case when v_nap.rx_dbm is not null then format('%s dBm', v_nap.rx_dbm) else '' end,
      v_nap.id::text]];
    v_pasos := v_pasos || array[array['nap', v_nap.nap,
      format('%s puertos', coalesce(v_nap.capacity, 0)), v_nap.nap_id::text]];

    v_hilo := v_nap.feed_strand_id;
    if v_hilo is null then
      select sp.id into v_sal_id
        from public.splitter_ports sp
       where sp.out_element_id = v_nap.nap_id
       limit 1;
    end if;
  end if;

  loop
    v_saltos := v_saltos + 1;
    exit when v_saltos > 60;

    -- (a) Venimos de la salida de un splitter.
    if v_sal_id is not null then
      select sp.port_number, s.id as spl_id, s.code, s.ratio,
             s.in_strand_id, s.in_odf_port_id, s.in_splitter_port_id, e.code as caja
        into v_sal
        from public.splitter_ports sp
        join public.splitters s on s.id = sp.splitter_id
        join public.network_elements e on e.id = s.housing_id
       where sp.id = v_sal_id;

      exit when v_sal.spl_id is null;

      v_pasos := v_pasos || array[array['salida',
        format('salida %s', v_sal.port_number), '', v_sal_id::text]];
      v_pasos := v_pasos || array[array['splitter',
        format('%s %s', v_sal.code, v_sal.ratio),
        format('dentro de %s', v_sal.caja), v_sal.spl_id::text]];

      v_hilo   := v_sal.in_strand_id;
      v_odf_id := v_sal.in_odf_port_id;
      v_sal_id := v_sal.in_splitter_port_id;
      continue;
    end if;

    -- (b) Venimos de un hilo.
    if v_hilo is not null then
      select st.id, st.strand_number, st.color, c.code as cable, c.length_m
        into v_st
        from public.fiber_strands st
        join public.fiber_cables c on c.id = st.cable_id
       where st.id = v_hilo;

      exit when v_st.id is null;

      v_pasos := v_pasos || array[array['hilo',
        format('hilo %s (%s)', v_st.strand_number, v_st.color),
        v_st.cable || case when v_st.length_m is not null
                          then format(' · %s m', round(v_st.length_m)) else '' end,
        v_st.id::text]];

      -- ¿De dónde le llega la luz a este hilo? Puerto del ODF, salida de
      -- splitter, o una fusión que lo empalma con otro hilo.
      select op.id into v_odf_id
        from public.odf_ports op where op.out_strand_id = v_hilo;

      if v_odf_id is not null then
        v_hilo := null;
        continue;
      end if;

      select sp.id into v_sal_id
        from public.splitter_ports sp where sp.out_strand_id = v_hilo;

      if v_sal_id is not null then
        v_hilo := null;
        continue;
      end if;

      select f.in_strand_id, f.loss_db, e.code as caja, e.id as caja_id
        into v_fus
        from public.fiber_splices f
        join public.network_elements e on e.id = f.closure_id
       where f.out_strand_id = v_hilo and f.status = 'activa'
       limit 1;

      if v_fus.caja_id is not null then
        v_pasos := v_pasos || array[array['caja', v_fus.caja,
          case when v_fus.loss_db is not null
               then format('empalme de %s dB', v_fus.loss_db) else 'empalme' end,
          v_fus.caja_id::text]];
        v_hilo := v_fus.in_strand_id;
        continue;
      end if;

      v_pasos := v_pasos || array[array['pendiente', 'Aquí se corta el rastro',
        'A este hilo no se le ha capturado de dónde viene. Amárralo a un puerto del ODF, a un splitter o a una fusión.', '']];
      exit;
    end if;

    -- (c) Ya no hay de dónde seguir.
    exit when v_odf_id is null;

    -- (d) El ODF y, si está patcheado, la OLT y el sitio.
    select op.tray_number, op.port_number, op.pon_port_id, e.code as odf
      into v_odf
      from public.odf_ports op
      join public.network_elements e on e.id = op.odf_id
     where op.id = v_odf_id;

    v_pasos := v_pasos || array[array['odf',
      format('%s bandeja %s puerto %s', v_odf.odf, v_odf.tray_number, v_odf.port_number),
      '', v_odf_id::text]];

    if v_odf.pon_port_id is not null then
      select pp.id, pp.port_number, ca.slot_number, d.name as olt, d.vendor, d.model,
             si.name as sitio, si.id as sitio_id
        into v_pon
        from public.pon_ports pp
        join public.olt_cards ca on ca.id = pp.card_id
        join public.network_devices d on d.id = ca.device_id
        left join public.network_sites si on si.id = d.site_id
       where pp.id = v_odf.pon_port_id;

      v_pasos := v_pasos || array[array['pon',
        format('PON 0/%s/%s', v_pon.slot_number, v_pon.port_number), '', v_pon.id::text]];
      v_pasos := v_pasos || array[array['olt', v_pon.olt,
        trim(concat_ws(' ', v_pon.vendor, v_pon.model)), v_pon.id::text]];
      if v_pon.sitio is not null then
        v_pasos := v_pasos || array[array['sitio', v_pon.sitio, '', v_pon.sitio_id::text]];
      end if;
    else
      v_pasos := v_pasos || array[array['pendiente', 'Falta el latiguillo',
        'Ese puerto del ODF no tiene PON conectado. Patchéalo para cerrar la ruta hasta la OLT.', '']];
    end if;

    exit;
  end loop;

  -- Se voltea: del sitio al cliente, que es como se cuenta.
  for i in reverse array_length(v_pasos, 1) .. 1 loop
    paso := array_length(v_pasos, 1) - i + 1;
    que := v_pasos[i][1];
    nombre := v_pasos[i][2];
    detalle := nullif(v_pasos[i][3], '');
    ref_id := nullif(v_pasos[i][4], '')::uuid;
    return next;
  end loop;
end;
$$;

comment on function public.ruta_de_servicio is
  'La ruta completa de un servicio, del sitio al cliente, paso por paso.';

-- ----------------------------------------------------------------------------
create or replace function public.ruta_de_cliente(p_cliente uuid)
returns table (paso int, que text, nombre text, detalle text, ref_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_srv uuid;
begin
  select s.id into v_srv
    from public.customer_services s
   where s.customer_id = p_cliente and s.org_id = public.auth_org_id()
   order by case when s.status = 'active' then 0 else 1 end, s.created_at desc
   limit 1;

  if v_srv is null then
    raise exception 'Ese cliente no tiene servicios';
  end if;

  return query select * from public.ruta_de_servicio(v_srv);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3 · Aguas abajo: qué cuelga de aquí
-- ----------------------------------------------------------------------------
/*
 * El camino contrario. Se usa para dos cosas que parecen distintas y son la
 * misma: saber a quién le pega una falla, y saber si un elemento se puede
 * borrar sin dejar la red trunca.
 *
 * Se entra por un hilo y se va abriendo el árbol: fusiones, splitters, NAP y
 * los clientes de cada NAP.
 */
create or replace function public.aguas_abajo(p_hilo uuid)
returns table (
  que         text,
  nombre      text,
  elemento_id uuid,
  clientes    int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hilos  uuid[] := array[p_hilo];
  v_vistos uuid[] := array[]::uuid[];
  v_h      uuid;
  v_n      int := 0;
  -- Cada nivel del recorrido tiene su propia variable de renglón. Compartir
  -- una sola entre el ciclo de afuera y el de adentro parece ahorro y es un
  -- error: el ciclo interior le pisa el valor al exterior y a partir de ahí
  -- se recorre cualquier cosa menos el árbol.
  r_nap    record;
  r_spl    record;
  r_hija   record;
  r_fus    record;
begin
  while array_length(v_hilos, 1) > 0 and v_n < 500 loop
    v_h := v_hilos[1];
    v_hilos := v_hilos[2:];
    v_n := v_n + 1;

    continue when v_h is null or v_h = any(v_vistos);
    v_vistos := v_vistos || v_h;

    -- NAP colgadas directo del hilo.
    for r_nap in
      select e.id, e.code from public.network_elements e
       where e.feed_strand_id = v_h and e.is_active
    loop
      que := 'nap'; nombre := r_nap.code; elemento_id := r_nap.id;
      select count(*) into clientes from public.nap_ports np
       where np.element_id = r_nap.id and np.service_id is not null;
      return next;
    end loop;

    -- Splitters que se alimentan de este hilo.
    for r_spl in
      select s.id, s.code, s.ratio from public.splitters s
       where s.in_strand_id = v_h and s.is_active
    loop
      que := 'splitter';
      nombre := r_spl.code || ' ' || r_spl.ratio;
      elemento_id := r_spl.id;
      select count(*) into clientes
        from public.splitter_ports sp
        join public.nap_ports np on np.element_id = sp.out_element_id
       where sp.splitter_id = r_spl.id and np.service_id is not null;
      return next;

      -- Las salidas que van a un hilo siguen el árbol.
      v_hilos := v_hilos || array(
        select sp.out_strand_id from public.splitter_ports sp
         where sp.splitter_id = r_spl.id and sp.out_strand_id is not null);

      -- Las que van directo a una NAP se reportan aquí mismo.
      for r_hija in
        select e.id, e.code from public.splitter_ports sp
         join public.network_elements e on e.id = sp.out_element_id
        where sp.splitter_id = r_spl.id
      loop
        que := 'nap'; nombre := r_hija.code; elemento_id := r_hija.id;
        select count(*) into clientes from public.nap_ports np
         where np.element_id = r_hija.id and np.service_id is not null;
        return next;
      end loop;
    end loop;

    -- Fusiones: el hilo sigue en otro hilo, o termina en un elemento.
    for r_fus in
      select f.out_strand_id, e.id as dest_id, e.code as destino
        from public.fiber_splices f
        left join public.network_elements e on e.id = f.to_element_id
       where f.in_strand_id = v_h and f.status = 'activa'
    loop
      if r_fus.out_strand_id is not null then
        v_hilos := v_hilos || r_fus.out_strand_id;
      elsif r_fus.dest_id is not null then
        que := 'elemento'; nombre := r_fus.destino; elemento_id := r_fus.dest_id;
        select count(*) into clientes from public.nap_ports np
         where np.element_id = r_fus.dest_id and np.service_id is not null;
        return next;
      end if;
    end loop;
  end loop;
end;
$$;

comment on function public.aguas_abajo is
  'Todo lo que cuelga de un hilo, con cuántos clientes trae cada cosa.';

-- ----------------------------------------------------------------------------
create or replace function public.clientes_de_pon(p_pon uuid)
returns table (
  cliente     text,
  codigo      text,
  nap         text,
  puerto      int,
  servicio_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with raiz as (
    select op.out_strand_id as hilo
      from public.odf_ports op
     where op.pon_port_id = p_pon and op.out_strand_id is not null
  ),
  colgado as (
    select a.elemento_id
      from raiz r, lateral public.aguas_abajo(r.hilo) a
     where a.que in ('nap', 'elemento')
  )
  select c.full_name, c.customer_code, e.code, np.port_number, s.id
    from colgado g
    join public.network_elements e on e.id = g.elemento_id
    join public.nap_ports np on np.element_id = e.id
    join public.customer_services s on s.id = np.service_id
    join public.customers c on c.id = s.customer_id
   order by e.code, np.port_number;
$$;

comment on function public.clientes_de_pon is
  'A quién le pega si truena ese puerto PON. La lista que uno quisiera tener antes de que suene el teléfono.';

-- ----------------------------------------------------------------------------
-- 4 · Validación 10 · no dejar rutas truncas
-- ----------------------------------------------------------------------------
/*
 * Borrar algo que tiene cosas colgando no es un descuido: es dejar clientes
 * sin ruta y sin que nadie se entere hasta que llamen. Cada borrado dice qué
 * se lleva entre las patas, con nombres, y se niega.
 */
create or replace function public.eliminar_elemento(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid := public.auth_org_id();
  v_codigo    text;
  v_tipo      text;
  v_servicios int;
  v_hijos     int;
  v_tramos    int;
  v_spl       int;
  v_puertos   int;
  v_fus       int;
  v_cuelga    int := 0;
  r           record;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar elementos de red' using errcode = '42501';
  end if;

  select n.code, n.element_type into v_codigo, v_tipo
    from public.network_elements n where n.id = p_id and n.org_id = v_org;

  if v_codigo is null then
    raise exception 'Ese elemento no existe';
  end if;

  select count(*) into v_servicios
    from public.customer_services s where s.network_element_id = p_id;
  select count(*) into v_hijos
    from public.network_elements n where n.parent_element_id = p_id;
  select count(*) into v_tramos
    from public.fiber_links f where f.from_element_id = p_id or f.to_element_id = p_id;
  select count(*) into v_spl
    from public.splitters s where s.housing_id = p_id and s.is_active;
  select count(*) into v_fus
    from public.fiber_splices f where f.closure_id = p_id and f.status = 'activa';
  select count(*) into v_puertos
    from public.odf_ports op where op.odf_id = p_id and op.status = 'ocupado';

  -- Clientes colgados de sus puertos, que es lo que de verdad duele.
  select count(*) into v_cuelga
    from public.nap_ports np where np.element_id = p_id and np.service_id is not null;

  if v_servicios > 0 or v_cuelga > 0 then
    raise exception
      'No se puede borrar %: %. Pásalos a otra caja primero.',
      v_codigo,
      case when greatest(v_servicios, v_cuelga) = 1 then 'hay un cliente conectado ahí'
           else 'hay ' || greatest(v_servicios, v_cuelga) || ' clientes conectados ahí' end;
  end if;

  if v_spl > 0 then
    select string_agg(s.code, ', ') into v_codigo
      from public.splitters s where s.housing_id = p_id and s.is_active;
    raise exception
      'No se puede borrar esa caja: adentro está %. Saca el splitter primero.',
      v_codigo;
  end if;

  if v_fus > 0 then
    raise exception
      'No se puede borrar %: tiene % fusiones activas adentro. Si de verdad se va, quítalas una por una para saber qué hilos quedan sueltos.',
      v_codigo, v_fus;
  end if;

  if v_puertos > 0 then
    raise exception
      'No se puede borrar %: tiene % puertos ocupados. Desconéctalos primero para no dejar cables sin origen.',
      v_codigo, v_puertos;
  end if;

  if v_hijos > 0 then
    raise exception 'No se puede borrar %: hay % elementos que cuelgan de ahí.', v_codigo, v_hijos;
  end if;
  if v_tramos > 0 then
    raise exception 'No se puede borrar %: hay % tramos de fibra que llegan o salen de ahí.',
      v_codigo, v_tramos;
  end if;

  -- Una NAP alimentada libera su hilo al irse: si no, el hilo queda marcado
  -- como ocupado por algo que ya no existe.
  update public.fiber_strands set status = 'disponible', updated_at = now()
   where id = (select feed_strand_id from public.network_elements where id = p_id)
     and status = 'en_servicio';

  delete from public.network_elements where id = p_id and org_id = v_org
  returning code into v_codigo;

  return v_codigo;
end;
$$;

-- ----------------------------------------------------------------------------
create or replace function public.eliminar_splitter(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_code   text;
  v_usadas int;
  v_hilo   uuid;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para borrar splitters' using errcode = '42501';
  end if;

  select code, in_strand_id into v_code, v_hilo
    from public.splitters where id = p_id and org_id = v_org;

  if v_code is null then
    raise exception 'Ese splitter no existe';
  end if;

  select count(*) into v_usadas
    from public.splitter_ports where splitter_id = p_id and status = 'utilizada';

  if v_usadas > 0 then
    raise exception
      'No se puede borrar %: tiene % %s conectadas. Desconéctalas primero, o vas a dejar sin ruta a lo que cuelga de ellas.',
      v_code, v_usadas, case when v_usadas = 1 then 'salida' else 'salidas' end;
  end if;

  delete from public.splitters where id = p_id and org_id = v_org;

  if v_hilo is not null then
    update public.fiber_strands set status = 'disponible', updated_at = now()
     where id = v_hilo and status = 'en_servicio';
  end if;

  return v_code;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.guardar_foto(text, uuid, text, text, int) from public, anon;
revoke all on function public.eliminar_foto(uuid)                       from public, anon;
revoke all on function public.ruta_de_servicio(uuid)                    from public, anon;
revoke all on function public.ruta_de_cliente(uuid)                     from public, anon;
revoke all on function public.aguas_abajo(uuid)                         from public, anon;
revoke all on function public.clientes_de_pon(uuid)                     from public, anon;
revoke all on function public.eliminar_splitter(uuid)                   from public, anon;

grant execute on function public.guardar_foto(text, uuid, text, text, int) to authenticated;
grant execute on function public.eliminar_foto(uuid)                       to authenticated;
grant execute on function public.ruta_de_servicio(uuid)                    to authenticated;
grant execute on function public.ruta_de_cliente(uuid)                     to authenticated;
grant execute on function public.aguas_abajo(uuid)                         to authenticated;
grant execute on function public.clientes_de_pon(uuid)                     to authenticated;
grant execute on function public.eliminar_splitter(uuid)                   to authenticated;
