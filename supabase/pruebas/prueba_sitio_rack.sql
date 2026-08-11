-- ============================================================================
-- Prueba · Del sitio al puerto PON, en el orden en que se instala
--
-- Se captura como se trabaja: la comunidad, su gabinete, y adentro del
-- gabinete el ODF y la OLT. Lo que se comprueba es que el alta desde el rack
-- deje todo amarrado —sitio, zona, tarjetas, bandejas— sin tener que ir a
-- otras tres pantallas y sin dejar cabos sueltos.
--
-- Y que se niegue a lo que ensucia el padrón: dos equipos con el mismo
-- nombre, dos elementos con el mismo código, o montar en un rack que no es.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

do $p$
declare
  v_zona  uuid;
  v_sitio uuid;
  v_rack  uuid;
  v_olt   uuid;
  v_odf   uuid;
  v_suelto uuid;
  v_item  uuid;
  v_pon   uuid;
  v_pto   uuid;
  v_falla int := 0;
  v_n     int;
  v_msg   text;
  r       record;
begin
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── 1 · la comunidad y su gabinete ──────────────────────────────────────
  v_sitio := public.guardar_sitio(null, 'Caseta del arbol', 'olt_site', v_zona,
                                  24.8900000, -103.7200000);
  v_rack := public.guardar_rack(null, v_sitio, 'Rack unico', 42, 'Pared norte', null);

  select * into r from public.sitio_de_rack(v_rack);
  if r.sitio = 'Caseta del arbol' and r.units = 42 then
    raise notice 'PASA · el rack sabe de que comunidad es, sin preguntarlo';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el rack dice sitio «%» de %U', r.sitio, r.units;
  end if;

  -- ── 2 · el ODF, dado de alta desde el rack ──────────────────────────────
  select * into r from public.montar_odf(v_rack, 'ODF-ARBOL', null, 40, 1, 2, 12);
  v_odf := r.odf_id;

  if r.puertos = 24 then
    raise notice 'PASA · %', r.mensaje;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ODF abrio % puertos', r.puertos;
  end if;

  select site_id, latitude into r from public.network_elements where id = v_odf;
  if r.site_id = v_sitio and r.latitude = 24.8900000 then
    raise notice 'PASA · el ODF quedo amarrado al sitio y hereda sus coordenadas';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ODF quedo sin sitio o sin coordenadas';
  end if;

  -- ── 3 · la OLT, con sus tarjetas de una vez ─────────────────────────────
  select * into r from public.montar_olt(
    v_rack, 'OLT-ARBOL', 'Huawei', 'EA5800', 'SN-ARBOL-1', '10.20.0.2', 36, 2, 2, 8);
  v_olt := r.olt_id;
  v_item := r.item_id;

  if r.tarjetas = 2 and r.pon = 16 then
    raise notice 'PASA · %', r.mensaje;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la OLT nacio con % tarjetas y % PON', r.tarjetas, r.pon;
  end if;

  select site_id, zone_id into r from public.network_devices where id = v_olt;
  if r.site_id = v_sitio and r.zone_id = v_zona then
    raise notice 'PASA · la OLT quedo amarrada al sitio y a la zona del rack';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la OLT quedo suelta';
  end if;

  -- Las tarjetas cuelgan de la OLT, no del rack: el rack solo la ubica.
  select count(*) into v_n from public.olt_cards where device_id = v_olt;
  if v_n = 2 then
    raise notice 'PASA · las tarjetas cuelgan de la OLT, no del gabinete';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la OLT trae % tarjetas', v_n;
  end if;

  select * into r from public.v_rack_items where id = v_item;
  if r.position = 36 and r.hasta = 37 and r.tarjetas = 2 and r.puertos_pon = 16 then
    raise notice 'PASA · el dibujo del rack ya enseña la OLT en U36-U37 con sus 16 PON';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el dibujo dice U%-U% con % tarjetas', r.position, r.hasta, r.tarjetas;
  end if;

  -- ── 4 · el arbol del sitio, de un jalon ─────────────────────────────────
  select * into r from public.v_sitios_con_rack where id = v_sitio;
  if r.racks = 1 and r.olts = 1 and r.odfs = 1 and r.tarjetas = 2
     and r.puertos_pon = 16 and r.puertos_odf = 24 and r.ocupadas = 3 then
    raise notice 'PASA · la comunidad se resume sola: 1 rack, 1 OLT, 1 ODF, 3U ocupadas';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el resumen dice % racks, % OLT, % ODF, % tarjetas, %U ocupadas',
      r.racks, r.olts, r.odfs, r.tarjetas, r.ocupadas;
  end if;

  -- ── 5 · no se repite el nombre de la OLT ────────────────────────────────
  begin
    perform public.montar_olt(v_rack, 'olt-arbol', 'VSOL', 'V1600D', null, null, 10, 2, 1, 8);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo dos equipos con el mismo nombre';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%olt-arbol%' then
      raise notice 'PASA · no deja repetir el nombre del equipo, ni en minusculas';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota sin decir cual: %', v_msg;
    end if;
  end;

  -- ── 6 · no se repite el codigo del ODF ──────────────────────────────────
  begin
    perform public.montar_odf(v_rack, 'odf-arbol', null, 20, 1, 1, 12);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo dos elementos con el mismo codigo';
  exception when others then
    raise notice 'PASA · no deja repetir el codigo del ODF';
  end;

  -- ── 7 · un rack que no existe ───────────────────────────────────────────
  begin
    perform public.montar_olt(
      '00000000-0000-0000-0000-000000000000'::uuid, 'OLT-FANTASMA');
    v_falla := v_falla + 1;
    raise notice 'FALLA · monto una OLT en un rack que no existe';
  exception when others then
    raise notice 'PASA · no monta nada en un rack que no existe';
  end;

  -- ── 8 · el ODF que se capturo suelto se amarra al montarlo ──────────────
  -- Es el caso real del ODF 002 de Pedriceña: existe, sin sitio y sin
  -- bandejas. Al montarlo en un rack la base debe aprender dónde está.
  v_suelto := public.guardar_elemento(
    p_codigo => 'ODF-SUELTO', p_tipo => 'odf', p_zona => v_zona);

  select site_id into v_n from public.network_elements where id = v_suelto;
  perform public.montar_en_rack(v_rack, 'ODF-SUELTO', 'odf', 30, 1, null, v_suelto);

  select site_id into r from public.network_elements where id = v_suelto;
  if r.site_id = v_sitio then
    raise notice 'PASA · el ODF que estaba suelto quedo amarrado al sitio al montarlo';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ODF suelto sigue sin sitio';
  end if;

  -- ── 9 · y de ahi sale la cadena completa ────────────────────────────────
  select pp.id into v_pon from public.pon_ports pp
    join public.olt_cards ca on ca.id = pp.card_id
   where ca.device_id = v_olt and ca.slot_number = 1 and pp.port_number = 1;
  select op.id into v_pto from public.odf_ports op
   where op.odf_id = v_odf and op.tray_number = 1 and op.port_number = 1;

  v_msg := public.patchear(v_pon, v_pto, null, null, 'JMP-ARBOL-1', 'SC/APC');
  if v_msg like '%JMP-ARBOL-1%' then
    raise notice 'PASA · de la OLT recien dada de alta ya se patchea al ODF: %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el patcheo no tomo el latiguillo: %', v_msg;
  end if;

  select pon_patcheados into v_n from public.v_sitios_con_rack where id = v_sitio;
  if v_n = 1 then
    raise notice 'PASA · el resumen de la comunidad ya cuenta el PON patcheado';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el resumen cuenta % PON patcheados', v_n;
  end if;

  -- ── se recoge ───────────────────────────────────────────────────────────
  perform public.despatchear(v_pto);
  perform public.desmontar_del_rack(v_item, true);
  delete from public.rack_items where rack_id = v_rack;
  perform public.eliminar_elemento(v_suelto);
  perform public.eliminar_elemento(v_odf);
  delete from public.pon_ports pp using public.olt_cards ca
   where ca.id = pp.card_id and ca.device_id = v_olt;
  delete from public.olt_cards where device_id = v_olt;
  delete from public.network_devices where id = v_olt;
  perform public.eliminar_rack(v_rack);
  delete from public.network_sites where id = v_sitio;

  if v_falla = 0 then
    raise notice '── TODO BIEN · del sitio al puerto PON sin salir de una pantalla ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end $p$;
