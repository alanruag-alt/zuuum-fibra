-- ============================================================================
-- 041 · Dar de alta la OLT y el ODF desde el rack
--
-- El orden en que se captura debe ser el orden en que se instala: llega uno a
-- la comunidad, pone el gabinete, y adentro del gabinete atornilla el ODF y la
-- OLT. Hasta ahora había que ir a tres pantallas distintas —Equipos para la
-- OLT, Elementos para el ODF, y el rack para ubicarlos— y acordarse de amarrar
-- cada cosa a su sitio. Quien captura así se salta un paso tarde o temprano, y
-- lo que queda es un ODF sin sitio y una OLT que no aparece en ningún rack.
--
-- Estas dos funciones hacen el alta completa en un solo movimiento:
--
--   montar_olt  → crea la OLT, la amarra al sitio del rack, la monta en su U
--                 y le abre las tarjetas que se le digan, con sus puertos PON.
--   montar_odf  → crea el ODF, lo amarra al sitio, le abre sus bandejas con
--                 sus puertos, y lo monta en su U.
--
-- El sitio y la zona NO se preguntan: se sacan del rack. Un rack vive dentro
-- de un sitio, así que preguntarlo otra vez solo abre la puerta a que no
-- coincidan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · De qué sitio es este rack
-- ----------------------------------------------------------------------------
create or replace function public.sitio_de_rack(p_rack uuid)
returns table (
  site_id uuid,
  sitio   text,
  zone_id uuid,
  zona    text,
  rack    text,
  units   int
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.zone_id, z.name, r.name, r.units
    from public.racks r
    join public.network_sites s on s.id = r.site_id
    left join public.zones z on z.id = s.zone_id
   where r.id = p_rack and r.org_id = public.auth_org_id();
$$;

-- ----------------------------------------------------------------------------
-- 2 · Montar una OLT, dándola de alta de una vez
-- ----------------------------------------------------------------------------
/*
 * Las tarjetas se abren aquí mismo porque una OLT sin tarjetas no sirve para
 * nada: no tiene un solo puerto PON, así que no se le puede patchear el ODF ni
 * colgar un cliente. Dejarla sin tarjetas es dejar el trabajo a medias, y a
 * medias es como se queda.
 *
 * Se abren numeradas desde el slot 1, que es como vienen etiquetadas en el
 * chasis. Si la OLT trae los slots en otro orden —hay marcas que empiezan en
 * 0— se corrige después desde la tarjeta; lo importante es que existan.
 *
 * OJO: aquí NO se guardan usuarios ni contraseñas de la OLT. Nunca. La base
 * solo sabe que el equipo existe y en qué IP vive.
 */
create or replace function public.montar_olt(
  p_rack      uuid,
  p_nombre    text,
  p_marca     text    default null,
  p_modelo    text    default null,
  p_serie     text    default null,
  p_ip        text    default null,
  p_position  int     default 1,
  p_height    int     default 2,
  p_tarjetas  int     default 1,
  p_puertos   int     default 8,
  p_tipo_tarjeta text default null,
  p_notas     text    default null
)
returns table (
  olt_id   uuid,
  item_id  uuid,
  tarjetas int,
  pon      int,
  mensaje  text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_s    record;
  v_olt  uuid;
  v_item uuid;
  v_n    int := 0;
  v_pon  int := 0;
  i      int;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select * into v_s from public.sitio_de_rack(p_rack);
  if v_s.site_id is null then
    raise exception 'Ese rack no existe. Elige el gabinete donde va la OLT.';
  end if;

  if p_nombre is null or length(btrim(p_nombre)) < 2 then
    raise exception 'Ponle nombre a la OLT: sin nombre no se encuentra en el rack.';
  end if;

  -- Dos OLT con el mismo nombre es el error que hace que el día del corte
  -- alguien entre a reiniciar la que no era.
  if exists (select 1 from public.network_devices d
              where d.org_id = v_org and upper(btrim(d.name)) = upper(btrim(p_nombre))) then
    raise exception 'Ya tienes un equipo que se llama %. Ponle otro nombre.', btrim(p_nombre);
  end if;

  v_olt := public.guardar_dispositivo(
    null, btrim(p_nombre), 'olt', v_s.site_id, v_s.zone_id, p_ip, p_marca, p_modelo, true);

  -- Las tarjetas, con sus puertos PON.
  if coalesce(p_tarjetas, 0) > 0 then
    for i in 1..p_tarjetas loop
      perform public.abrir_tarjeta(v_olt, i, p_tipo_tarjeta, coalesce(p_puertos, 8));
      v_n := v_n + 1;
    end loop;
    select count(*) into v_pon
      from public.pon_ports pp
      join public.olt_cards ca on ca.id = pp.card_id
     where ca.device_id = v_olt;
  end if;

  v_item := public.montar_en_rack(
    p_rack     => p_rack,
    p_label    => btrim(p_nombre),
    p_kind     => 'olt',
    p_position => p_position,
    p_height   => coalesce(p_height, 2),
    p_device   => v_olt,
    p_element  => null,
    p_vendor   => p_marca,
    p_model    => p_modelo,
    p_serial   => p_serie,
    p_ip       => p_ip,
    p_estado   => 'en_linea',
    p_notas    => p_notas);

  return query select
    v_olt, v_item, v_n, v_pon,
    format('%s quedó dada de alta en %s, montada en la U%s%s%s.',
      btrim(p_nombre), v_s.sitio, p_position,
      case when coalesce(p_height, 2) > 1
           then format('-U%s', p_position + coalesce(p_height, 2) - 1) else '' end,
      case when v_n > 0
           then format(', con %s tarjeta(s) y %s puertos PON', v_n, v_pon)
           else '. Ojo: sin tarjetas todavía no tiene un solo puerto PON' end);
end;
$$;

comment on function public.montar_olt is
  'Da de alta la OLT, la amarra al sitio del rack, la monta y le abre sus tarjetas.';

-- ----------------------------------------------------------------------------
-- 3 · Montar un ODF, dándolo de alta de una vez
-- ----------------------------------------------------------------------------
/*
 * Igual que la OLT: el ODF nace con sus bandejas abiertas. Un ODF sin puertos
 * no tiene de dónde salga el cable a la calle, y la ruta del cliente queda
 * cortada en la caseta sin que nada avise.
 *
 * Hereda las coordenadas del sitio para que salga en el mapa donde está la
 * caseta, y no en el mar frente a África, que es donde caen las cosas sin
 * coordenadas.
 */
create or replace function public.montar_odf(
  p_rack        uuid,
  p_codigo      text,
  p_nombre      text    default null,
  p_position    int     default 1,
  p_height      int     default 1,
  p_bandejas    int     default 1,
  p_por_bandeja int     default 12,
  p_conector    text    default 'SC/APC',
  p_serie       text    default null,
  p_notas       text    default null
)
returns table (
  odf_id  uuid,
  item_id uuid,
  puertos int,
  mensaje text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_s    record;
  v_odf  uuid;
  v_item uuid;
  v_n    int := 0;
  v_lat  numeric;
  v_lon  numeric;
begin
  if v_org is null then
    raise exception 'No hay sesión' using errcode = '42501';
  end if;
  if not public.auth_has('network.write') then
    raise exception 'No tienes permiso para editar la red' using errcode = '42501';
  end if;

  select * into v_s from public.sitio_de_rack(p_rack);
  if v_s.site_id is null then
    raise exception 'Ese rack no existe. Elige el gabinete donde va el ODF.';
  end if;

  if p_codigo is null or length(btrim(p_codigo)) < 2 then
    raise exception 'Ponle código al ODF. Es como se va a llamar en toda la red.';
  end if;

  if exists (select 1 from public.network_elements e
              where e.org_id = v_org and upper(e.code) = upper(btrim(p_codigo))) then
    raise exception 'Ya existe un elemento con el código %. Usa otro.', btrim(p_codigo);
  end if;

  select s.latitude, s.longitude into v_lat, v_lon
    from public.network_sites s where s.id = v_s.site_id;

  v_odf := public.guardar_elemento(
    p_codigo => btrim(p_codigo),
    p_tipo   => 'odf',
    p_nombre => coalesce(nullif(btrim(coalesce(p_nombre, '')), ''),
                         format('ODF de %s', v_s.sitio)),
    p_zona   => v_s.zone_id,
    p_lat    => v_lat,
    p_lon    => v_lon,
    p_notas  => p_notas);

  update public.network_elements
     set site_id = v_s.site_id, updated_at = now()
   where id = v_odf;

  if coalesce(p_bandejas, 0) > 0 then
    v_n := public.abrir_puertos_odf(
      v_odf, p_bandejas, coalesce(p_por_bandeja, 12), coalesce(p_conector, 'SC/APC'));
  end if;

  v_item := public.montar_en_rack(
    p_rack     => p_rack,
    p_label    => btrim(p_codigo),
    p_kind     => 'odf',
    p_position => p_position,
    p_height   => coalesce(p_height, 1),
    p_device   => null,
    p_element  => v_odf,
    p_vendor   => null,
    p_model    => null,
    p_serial   => p_serie,
    p_ip       => null,
    p_estado   => 'en_linea',
    p_notas    => p_notas);

  return query select
    v_odf, v_item, v_n,
    format('%s quedó dado de alta en %s, montado en la U%s%s.',
      btrim(p_codigo), v_s.sitio, p_position,
      case when v_n > 0
           then format(', con %s puertos en %s bandeja(s)', v_n, p_bandejas)
           else '. Ojo: sin bandejas no tiene de dónde salga el cable a la calle' end);
end;
$$;

comment on function public.montar_odf is
  'Da de alta el ODF con sus bandejas, lo amarra al sitio del rack y lo monta.';

-- ----------------------------------------------------------------------------
-- 4 · Amarrar al sitio lo que se capturó suelto
-- ----------------------------------------------------------------------------
/*
 * Antes de esta pantalla se podía dar de alta un ODF sin decir de qué sitio
 * era —el ODF 002 de Pedriceña quedó así—. Al montarlo en un rack ya se sabe
 * dónde está, y conviene que la base lo aprenda sola en vez de dejarlo para
 * una limpieza manual que nunca se hace.
 */
create or replace function public.amarrar_al_sitio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_sitio uuid;
begin
  select r.site_id into v_sitio from public.racks r where r.id = new.rack_id;
  if v_sitio is null then return new; end if;

  if new.element_id is not null then
    update public.network_elements
       set site_id = v_sitio, updated_at = now()
     where id = new.element_id and site_id is distinct from v_sitio;
  end if;

  if new.device_id is not null then
    update public.network_devices
       set site_id = v_sitio, updated_at = now()
     where id = new.device_id and site_id is distinct from v_sitio;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_amarrar_al_sitio on public.rack_items;
create trigger trg_amarrar_al_sitio
  after insert or update of rack_id, device_id, element_id on public.rack_items
  for each row execute function public.amarrar_al_sitio();

-- ----------------------------------------------------------------------------
-- 5 · Todo lo del sitio, de un jalón
-- ----------------------------------------------------------------------------
/*
 * Lo que necesita la pantalla combinada para pintar el árbol del sitio sin
 * hacer seis consultas: cuántos racks tiene, cuántas U ocupadas, qué OLT y
 * qué ODF hay montados y qué traen adentro.
 */
create or replace view public.v_sitios_con_rack with (security_invoker = true) as
select s.id,
       s.org_id,
       s.name,
       s.type                                                                   as site_type,
       s.zone_id,
       z.name                                                                   as zona,
       s.latitude,
       s.longitude,
       s.is_active,
       (select count(*) from public.racks r where r.site_id = s.id)             as racks,
       coalesce((select sum(r.units) from public.racks r where r.site_id = s.id), 0) as unidades,
       coalesce((select sum(i.height)
                   from public.rack_items i
                   join public.racks r on r.id = i.rack_id
                  where r.site_id = s.id), 0)                                   as ocupadas,
       (select count(*) from public.rack_items i
          join public.racks r on r.id = i.rack_id
         where r.site_id = s.id and i.kind = 'olt')                             as olts,
       (select count(*) from public.rack_items i
          join public.racks r on r.id = i.rack_id
         where r.site_id = s.id and i.kind = 'odf')                             as odfs,
       (select count(*) from public.olt_cards ca
          join public.network_devices d on d.id = ca.device_id
         where d.site_id = s.id)                                               as tarjetas,
       (select count(*) from public.pon_ports pp
          join public.olt_cards ca on ca.id = pp.card_id
          join public.network_devices d on d.id = ca.device_id
         where d.site_id = s.id)                                               as puertos_pon,
       (select count(*) from public.pon_ports pp
          join public.olt_cards ca on ca.id = pp.card_id
          join public.network_devices d on d.id = ca.device_id
          join public.odf_ports op on op.pon_port_id = pp.id
         where d.site_id = s.id)                                               as pon_patcheados,
       (select count(*) from public.odf_ports op
          join public.network_elements e on e.id = op.odf_id
         where e.site_id = s.id)                                               as puertos_odf,
       (select count(*) from public.odf_ports op
          join public.network_elements e on e.id = op.odf_id
         where e.site_id = s.id and op.status = 'libre')                        as odf_libres
  from public.network_sites s
  left join public.zones z on z.id = s.zone_id
 where s.org_id = public.auth_org_id();

comment on view public.v_sitios_con_rack is
  'Cada comunidad con su gabinete: cuántas U ocupa, qué OLT y qué ODF trae.';

-- ----------------------------------------------------------------------------
-- 6 · Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.sitio_de_rack(uuid) from public, anon;
revoke all on function public.montar_olt(uuid, text, text, text, text, text, int, int, int, int, text, text) from public, anon;
revoke all on function public.montar_odf(uuid, text, text, int, int, int, int, text, text, text) from public, anon;

grant execute on function public.sitio_de_rack(uuid) to authenticated;
grant execute on function public.montar_olt(uuid, text, text, text, text, text, int, int, int, int, text, text) to authenticated;
grant execute on function public.montar_odf(uuid, text, text, int, int, int, int, text, text, text) to authenticated;

grant select on public.v_sitios_con_rack to authenticated;
