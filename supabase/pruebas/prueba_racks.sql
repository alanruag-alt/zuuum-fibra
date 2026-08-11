-- ============================================================================
-- Prueba · Racks: el sitio por dentro, unidad por unidad
--
-- Se arma un gabinete de 42U, se monta la OLT y el ODF donde van, y luego se
-- intenta hacer todo lo que en campo sale mal: encimar dos equipos, poner uno
-- que se sale por arriba, repetir una serie, bajarle la altura al rack con
-- equipo colgando, y desmontar una OLT que trae puertos patcheados.
--
-- Ninguna de esas se detiene desde la pantalla: se detienen desde la base.
-- Por eso la prueba las intenta a mano, sin pasar por la aplicación.
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
  v_olt   uuid;
  v_tar   uuid;
  v_odf   uuid;
  v_pon   uuid;
  v_p3    uuid;
  v_rack  uuid;
  v_i_olt uuid;
  v_i_odf uuid;
  v_i_org uuid;
  v_falla int := 0;
  v_n     int;
  v_msg   text;
  r       record;
begin
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── se arma el sitio ────────────────────────────────────────────────────
  v_sitio := public.guardar_sitio(null, 'Caseta del rack', 'olt_site', v_zona,
                                  24.8850000, -103.7100000);
  v_olt := public.guardar_dispositivo(null, 'OLT-RACK', 'olt', v_sitio, v_zona,
                                      null, 'Huawei', 'EA5800');
  v_tar := public.abrir_tarjeta(v_olt, 1, 'GPON 8', 8);
  select id into v_pon from public.pon_ports where card_id = v_tar and port_number = 1;

  v_odf := public.guardar_elemento(p_codigo => 'ODF-RACK', p_tipo => 'odf',
                                   p_nombre => 'ODF de la caseta', p_zona => v_zona,
                                   p_lat => 24.8850000, p_lon => -103.7100000);
  update public.network_elements set site_id = v_sitio where id = v_odf;
  perform public.abrir_puertos_odf(v_odf, 1, 12);
  select id into v_p3 from public.odf_ports where odf_id = v_odf and port_number = 3;

  -- ── 1 · el gabinete nace y se conoce ────────────────────────────────────
  v_rack := public.guardar_rack(null, v_sitio, 'Rack A', 42, 'Pared norte', null);

  select * into r from public.v_racks where id = v_rack;
  if r.units = 42 and r.equipos = 0 and r.libres = 42 then
    raise notice 'PASA · Rack A nacio de 42U con las 42 libres';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el rack dice %U, % equipos, % libres', r.units, r.equipos, r.libres;
  end if;

  -- Dos racks con el mismo nombre en el mismo sitio: no.
  begin
    perform public.guardar_rack(null, v_sitio, 'Rack A', 42, null, null);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo dos racks llamados igual en el mismo sitio';
  exception when unique_violation then
    raise notice 'PASA · no deja dos racks con el mismo nombre en un sitio';
  end;

  -- ── 2 · se monta la OLT y el ODF ────────────────────────────────────────
  -- La OLT de 2U en la 36: ocupa la 36 y la 37.
  v_i_olt := public.montar_en_rack(v_rack, 'OLT-RACK', 'olt', 36, 2, v_olt, null,
                                   'Huawei', 'EA5800', 'SN-OLT-001', '10.10.0.2');
  v_i_odf := public.montar_en_rack(v_rack, 'ODF-RACK', 'odf', 40, 1, null, v_odf,
                                   null, null, 'SN-ODF-001');

  select * into r from public.v_rack_items where id = v_i_olt;
  if r.position = 36 and r.hasta = 37 and r.puertos_pon = 8 then
    raise notice 'PASA · la OLT quedo en U36-U37 y el rack ya sabe que trae 8 puertos PON';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la OLT quedo en U%-U% con % PON', r.position, r.hasta, r.puertos_pon;
  end if;

  select * into r from public.v_rack_items where id = v_i_odf;
  if r.puertos_odf = 12 and r.odf_libres = 12 then
    raise notice 'PASA · el ODF montado arrastra sus 12 puertos, los 12 libres';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ODF dice % puertos, % libres', r.puertos_odf, r.odf_libres;
  end if;

  select * into r from public.v_racks where id = v_rack;
  if r.ocupadas = 3 and r.libres = 39 then
    raise notice 'PASA · el contador de capacidad va en 3 ocupadas y 39 libres';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el contador dice % ocupadas y % libres', r.ocupadas, r.libres;
  end if;

  -- ── 3 · VALIDACIÓN · dos equipos no se enciman ──────────────────────────
  -- Un switch de 1U en la 37, que es la segunda U de la OLT.
  begin
    perform public.montar_en_rack(v_rack, 'SW-RACK', 'switch', 37, 1);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo encimar un equipo sobre la segunda U de la OLT';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%OLT-RACK%' then
      raise notice 'PASA · no deja encimar, y dice cual estorba: %', v_msg;
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota pero no dice cual estorba: %', v_msg;
    end if;
  end;

  -- Y tampoco por debajo: uno de 3U en la 34 llegaría a la 36.
  begin
    perform public.montar_en_rack(v_rack, 'UPS-RACK', 'ups', 34, 3);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo encimar por abajo';
  exception when others then
    raise notice 'PASA · tampoco deja que uno alto alcance a otro por abajo';
  end;

  -- Pegado, sin encimarse, sí debe entrar: 3U que terminan en la 35.
  v_i_org := public.montar_en_rack(v_rack, 'ORG-RACK', 'organizador', 33, 3);
  select count(*) into v_n from public.rack_items where rack_id = v_rack;
  if v_n = 3 then
    raise notice 'PASA · pegado pero sin encimar (U33-U35, la OLT en la 36) si entra';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el rack quedo con % equipos', v_n;
  end if;

  -- ── 4 · VALIDACIÓN · no se sale del gabinete ────────────────────────────
  -- posición + altura - 1 ≤ capacidad. Un 4U en la 41 llegaría a la 44.
  begin
    perform public.montar_en_rack(v_rack, 'SRV-RACK', 'servidor', 41, 4);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo montar un equipo que se sale por arriba';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%U44%' and v_msg like '%U39%' then
      raise notice 'PASA · no cabe, y dice hasta donde llegaria y donde si empieza';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota pero el recado no orienta: %', v_msg;
    end if;
  end;

  -- La U0 tampoco existe.
  begin
    perform public.montar_en_rack(v_rack, 'SRV-RACK', 'servidor', 0, 1);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo montar en la U0';
  exception when others then
    raise notice 'PASA · la U0 no existe; las unidades empiezan en la 1';
  end;

  -- ── 5 · VALIDACIÓN · la serie no se repite ──────────────────────────────
  begin
    perform public.montar_en_rack(v_rack, 'OTRA-OLT', 'olt', 10, 2, null, null,
                                  'Huawei', 'EA5800', 'sn-olt-001');
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo dos equipos con la misma serie';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%OLT-RACK%' then
      raise notice 'PASA · la serie repetida rebota aunque venga en minusculas, y dice de quien es';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota pero no dice de quien es la serie: %', v_msg;
    end if;
  end;

  -- ── 6 · mover de lugar ──────────────────────────────────────────────────
  v_msg := public.mover_en_rack(v_i_olt, 20);
  select position, height into r from public.rack_items where id = v_i_olt;
  if r.position = 20 then
    raise notice 'PASA · %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la OLT no se movio, sigue en la U%', r.position;
  end if;

  -- Moverlo encima de otro: rebota y el otro no se mueve.
  begin
    perform public.mover_en_rack(v_i_olt, 34);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo arrastrar la OLT encima del organizador';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%ORG-RACK%' then
      raise notice 'PASA · al arrastrar encima rebota y nombra al que estorba';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota sin nombrar al que estorba: %', v_msg;
    end if;
  end;

  select position into v_n from public.rack_items where id = v_i_olt;
  if v_n = 20 then
    raise notice 'PASA · el rebote no dejo la OLT a medias: sigue en la U20';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la OLT quedo en la U% despues del rebote', v_n;
  end if;

  perform public.mover_en_rack(v_i_olt, 36);

  -- ── 7 · VALIDACIÓN · no se achica el rack con equipo colgando ───────────
  begin
    update public.racks set units = 38 where id = v_rack;
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo bajar el rack a 38U con el ODF en la 40';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%ODF-RACK%' and v_msg like '%U40%' then
      raise notice 'PASA · no deja achicar el rack, y dice quien quedaria fuera y en que U';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota pero no dice quien estorba: %', v_msg;
    end if;
  end;

  -- Agrandarlo siempre se puede.
  update public.racks set units = 48 where id = v_rack;
  select units into v_n from public.racks where id = v_rack;
  if v_n = 48 then
    raise notice 'PASA · agrandar el gabinete si se puede, sin preguntar';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no dejo agrandar el rack';
  end if;
  update public.racks set units = 42 where id = v_rack;

  -- ── 8 · el jumper PON → ODF ─────────────────────────────────────────────
  v_msg := public.patchear(v_pon, v_p3);
  update public.odf_ports set jumper_code = 'JMP-014' where id = v_p3;

  select * into r from public.v_rack_items where id = v_i_olt;
  if r.pon_patcheados = 1 then
    raise notice 'PASA · el rack ve el patcheo: la OLT trae 1 PON conectado al ODF';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el rack dice % PON patcheados', r.pon_patcheados;
  end if;

  select jumper_code into v_msg from public.odf_ports where id = v_p3;
  if v_msg = 'JMP-014' then
    raise notice 'PASA · el latiguillo quedo etiquetado en el puerto del ODF';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el puerto no guardo la etiqueta del latiguillo';
  end if;

  -- ── 9 · VALIDACIÓN · avisar antes de bajar equipo conectado ─────────────
  begin
    perform public.desmontar_del_rack(v_i_olt);
    v_falla := v_falla + 1;
    raise notice 'FALLA · bajo la OLT sin avisar que trae PON patcheados';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%OLT-RACK%' and v_msg like '%PON%' then
      raise notice 'PASA · avisa antes de bajar una OLT con PON patcheados';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota pero no explica: %', v_msg;
    end if;
  end;

  begin
    perform public.desmontar_del_rack(v_i_odf);
    v_falla := v_falla + 1;
    raise notice 'FALLA · bajo el ODF sin avisar que trae puertos ocupados';
  exception when others then
    raise notice 'PASA · avisa antes de bajar un ODF con puertos con fibra';
  end;

  -- Confirmando sí se baja, y el patcheo se queda como está.
  v_msg := public.desmontar_del_rack(v_i_olt, true);
  select count(*) into v_n from public.odf_ports where pon_port_id = v_pon;
  if v_n = 1 then
    raise notice 'PASA · confirmando si baja, y el patcheo no se borro solo';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · al bajar la OLT se perdio el patcheo';
  end if;

  -- ── 10 · VALIDACIÓN · no se borra un rack con equipo montado ────────────
  begin
    perform public.eliminar_rack(v_rack);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro el rack con equipos adentro';
  exception when others then
    raise notice 'PASA · no deja borrar un rack que todavia trae equipos montados';
  end;

  perform public.desmontar_del_rack(v_i_odf, true);
  perform public.desmontar_del_rack(v_i_org);
  v_msg := public.eliminar_rack(v_rack);
  if v_msg = 'Rack A' then
    raise notice 'PASA · vacio si se borra';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no borro el rack vacio';
  end if;

  -- ── se recoge ───────────────────────────────────────────────────────────
  perform public.despatchear(v_p3);
  perform public.eliminar_elemento(v_odf);
  delete from public.pon_ports where card_id = v_tar;
  delete from public.olt_cards where id = v_tar;
  delete from public.network_devices where id = v_olt;
  delete from public.network_sites where id = v_sitio;

  if v_falla = 0 then
    raise notice '── TODO BIEN · el rack no deja encimar, ni desbordar, ni bajar a ciegas ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end $p$;
