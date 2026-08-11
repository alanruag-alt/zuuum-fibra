-- ============================================================================
-- Prueba · La caja por dentro
--
-- Un troncal llega a la caja y un ramal sale de ella. Adentro se empalman los
-- hilos, que es todo el trabajo de una caja de empalme. La prueba comprueba
-- que el dibujo diga la verdad y que la base se niegue a lo que en campo
-- deja gente sin señal:
--
--   · empalmar un hilo consigo mismo
--   · empalmar dos hilos que YA vienen alimentados
--   · empalmar algo que ya tiene un empalme en esa misma caja
--   · quitar del dibujo un cable que tiene empalmes adentro
--
-- Y que al soltar el empalme los dos hilos vuelvan a quedar libres.
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
  v_pon   uuid;
  v_odf   uuid;
  v_p1    uuid;
  v_caja  uuid;
  v_nap   uuid;
  v_nap2  uuid;
  v_tr    uuid;
  v_ram   uuid;
  v_t1    uuid;
  v_t2    uuid;
  v_r1    uuid;
  v_r2    uuid;
  v_fus   uuid;
  v_falla int := 0;
  v_n     int;
  v_msg   text;
  r       record;
begin
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── se arma el tramo ────────────────────────────────────────────────────
  v_tr := public.guardar_cable(null, 'TR-DENTRO', 'adss', 12, v_zona);
  perform public.guardar_trazo(
    v_tr, '[[24.8300000,-103.6500000],[24.8300000,-103.6400000]]'::jsonb, 'reemplazar');

  -- La caja va SOBRE la línea del troncal, como debe ser.
  v_caja := public.guardar_elemento(
    p_codigo => 'CE-DENTRO', p_tipo => 'closure', p_nombre => 'Caja de la prueba',
    p_zona => v_zona, p_lat => 24.8300000, p_lon => -103.6450000);

  v_ram := public.guardar_cable(null, 'RAM-DENTRO', 'adss', 6, v_zona);
  perform public.guardar_trazo(
    v_ram, '[[24.8300000,-103.6450000],[24.8340000,-103.6450000]]'::jsonb, 'reemplazar');
  update public.fiber_cables set from_id = v_caja where id = v_ram;
  update public.fiber_cables set to_id   = v_caja where id = v_tr;

  select id into v_t1 from public.fiber_strands where cable_id = v_tr  and strand_number = 1;
  select id into v_t2 from public.fiber_strands where cable_id = v_tr  and strand_number = 2;
  select id into v_r1 from public.fiber_strands where cable_id = v_ram and strand_number = 1;
  select id into v_r2 from public.fiber_strands where cable_id = v_ram and strand_number = 2;

  -- ── 1 · el dibujo sabe qué cables entran ────────────────────────────────
  select count(*) into v_n from public.cables_en_caja(v_caja);
  if v_n = 2 then
    raise notice 'PASA · la caja dibuja sus 2 cables: el que llega y el que sale';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la caja dibuja % cables', v_n;
  end if;

  select papel into v_msg from public.cables_en_caja(v_caja) where codigo = 'TR-DENTRO';
  if v_msg = 'llega' then
    raise notice 'PASA · distingue el que llega del que sale';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · TR-DENTRO aparece como «%»', v_msg;
  end if;

  select count(*) into v_n from public.hilos_en_caja(v_caja);
  if v_n = 18 then
    raise notice 'PASA · se pueden tocar los 18 hilos: 12 del troncal y 6 del ramal';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el dibujo trae % hilos', v_n;
  end if;

  -- ── 2 · un hilo no se empalma consigo mismo ─────────────────────────────
  begin
    perform public.empalmar(v_caja, v_t1, v_t1);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo empalmar un hilo consigo mismo';
  exception when others then
    raise notice 'PASA · un hilo no se empalma consigo mismo';
  end;

  -- ── 3 · el empalme de verdad ────────────────────────────────────────────
  -- Al troncal se le da luz desde el ODF, para que la base sepa cuál de los
  -- dos es el que alimenta.
  v_sitio := public.guardar_sitio(null, 'Caseta de la caja', 'olt_site', v_zona,
                                  24.8300000, -103.6500000);
  v_olt := public.guardar_dispositivo(null, 'OLT-DENTRO', 'olt', v_sitio, v_zona,
                                      null, 'VSOL', 'V1600D');
  v_tar := public.abrir_tarjeta(v_olt, 1, 'GPON 8', 8);
  select id into v_pon from public.pon_ports where card_id = v_tar and port_number = 1;

  v_odf := public.guardar_elemento(p_codigo => 'ODF-DENTRO', p_tipo => 'odf',
                                   p_zona => v_zona,
                                   p_lat => 24.8300000, p_lon => -103.6500000);
  update public.network_elements set site_id = v_sitio where id = v_odf;
  perform public.abrir_puertos_odf(v_odf, 1, 4);
  select id into v_p1 from public.odf_ports where odf_id = v_odf and port_number = 1;
  perform public.patchear(v_pon, v_p1);
  perform public.arrancar_cable(v_p1, v_t1);

  v_msg := public.empalmar(v_caja, v_r1, v_t1, 'fusion', 0.04);
  if v_msg like '%TR-DENTRO hilo 1%RAM-DENTRO hilo 1%' then
    raise notice 'PASA · la base adivino la direccion sola: %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el empalme quedo al reves: %', v_msg;
  end if;

  -- Se soltaron en el orden contrario a propósito: el técnico arrastra del
  -- ramal al troncal, y aun así el que alimenta debe ser el troncal.
  select fusion_id, par_texto into r from public.hilos_en_caja(v_caja)
   where cable = 'TR-DENTRO' and numero = 1;
  v_fus := r.fusion_id;
  if r.par_texto like 'RAM-DENTRO hilo 1%' then
    raise notice 'PASA · el diagrama dice con que hilo quedo pegado: %', r.par_texto;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el diagrama dice «%»', r.par_texto;
  end if;

  select estado into v_msg from public.hilos_en_caja(v_caja)
   where cable = 'RAM-DENTRO' and numero = 1;
  if v_msg = 'fusionado' then
    raise notice 'PASA · el hilo del ramal ya no aparece disponible';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el hilo del ramal quedo en «%»', v_msg;
  end if;

  -- ── 4 · no se empalma dos veces en la misma caja ────────────────────────
  begin
    perform public.empalmar(v_caja, v_t1, v_r2);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo empalmar dos veces el mismo hilo en la misma caja';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%CE-DENTRO%' then
      raise notice 'PASA · no deja doble empalme, y dice en que caja esta el anterior';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota sin decir donde: %', v_msg;
    end if;
  end;

  -- ── 5 · dos hilos ya alimentados no se empalman ─────────────────────────
  -- Al hilo 2 del troncal se le da luz también; al 2 del ramal se le da luz
  -- desde el 2 del troncal. Empalmar los dos alimentados apagaría a alguien.
  perform public.arrancar_cable(
    (select id from public.odf_ports where odf_id = v_odf and port_number = 2), v_t2);
  perform public.empalmar(v_caja, v_t2, v_r2);

  begin
    perform public.empalmar(v_caja, v_r1, v_r2);
    v_falla := v_falla + 1;
    raise notice 'FALLA · empalmo dos hilos que ya venian alimentados';
  exception when others then
    raise notice 'PASA · no empalma dos hilos que ya traen luz: eso apaga a alguien';
  end;

  -- ── 6 · no se quita del dibujo un cable con empalmes ────────────────────
  begin
    perform public.soltar_cable_de_caja(v_caja, v_ram);
    v_falla := v_falla + 1;
    raise notice 'FALLA · quito del dibujo un cable con empalmes adentro';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%RAM-DENTRO%' then
      raise notice 'PASA · no deja quitar del dibujo un cable con empalmes, y lo nombra';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota sin nombrarlo: %', v_msg;
    end if;
  end;

  -- ── 7 · la hoja de la caja ──────────────────────────────────────────────
  select count(*) into v_n from public.fusiones_de_caja(v_caja);
  if v_n = 2 then
    raise notice 'PASA · la hoja de la caja saca los 2 empalmes';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la hoja saca % renglones', v_n;
  end if;

  select * into r from public.fusiones_de_caja(v_caja)
   where cable_entra = 'TR-DENTRO' and hilo_entra = 1;
  if r.cable_sale = 'RAM-DENTRO' and r.hilo_sale = 1 and r.perdida_db = 0.04
     and r.color_entra is not null and r.responsable is not null then
    raise notice 'PASA · el renglon trae los dos cables, los dos hilos con color, la perdida y quien lo hizo';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el renglon salio incompleto: % / % / %',
      r.cable_sale, r.perdida_db, r.responsable;
  end if;

  -- ── 8 · soltar el empalme deja los hilos libres ─────────────────────────
  v_msg := public.soltar_empalme(v_fus);
  if v_msg like '%TR-DENTRO%' and v_msg like '%RAM-DENTRO%' then
    raise notice 'PASA · %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el recado al soltar no dice que se desconecto: %', v_msg;
  end if;

  select estado, va_a into r from public.hilos_en_caja(v_caja)
   where cable = 'RAM-DENTRO' and numero = 1;
  if r.estado = 'disponible' and r.va_a is null then
    raise notice 'PASA · el hilo del ramal volvio a quedar libre y sin destino';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el hilo quedo en «%» con destino «%»', r.estado, r.va_a;
  end if;

  -- El troncal sigue alimentado por el ODF: soltar el empalme no lo apaga.
  select viene_de into v_msg from public.hilos_en_caja(v_caja)
   where cable = 'TR-DENTRO' and numero = 1;
  if v_msg like '%ODF-DENTRO%' then
    raise notice 'PASA · el troncal sigue viniendo del ODF: soltar el empalme no lo apago';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el troncal se quedo sin fuente: «%»', v_msg;
  end if;

  -- ── 9 · terminar un hilo en una NAP ─────────────────────────────────────
  v_nap := public.guardar_elemento(
    p_codigo => 'NAP-DENTRO', p_tipo => 'nap', p_zona => v_zona,
    p_lat => 24.8340000, p_lon => -103.6450000, p_capacidad => 8);

  v_msg := public.terminar_hilo(v_caja, v_r1, v_nap);
  select va_a into v_msg from public.hilos_en_caja(v_caja)
   where cable = 'RAM-DENTRO' and numero = 1;
  if v_msg like '%NAP-DENTRO%' then
    raise notice 'PASA · el hilo se puede terminar en la NAP arrastrandolo hasta ella';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el hilo no quedo alimentando la NAP: «%»', v_msg;
  end if;

  -- Alimentar el troncal hacia ese mismo hilo SÍ se puede, y es lo normal:
  -- ODF → troncal → empalme → ramal → NAP. Es la cadena completa.
  v_msg := public.empalmar(v_caja, v_t1, v_r1);
  select viene_de into v_msg from public.hilos_en_caja(v_caja)
   where cable = 'RAM-DENTRO' and numero = 1;
  if v_msg like '%CE-DENTRO%' then
    raise notice 'PASA · la cadena queda completa: ODF, troncal, empalme, ramal, NAP';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ramal no quedo alimentado por el empalme: «%»', v_msg;
  end if;

  -- Pero ese hilo ya no alimenta una segunda NAP: es de una sola.
  v_nap2 := public.guardar_elemento(
    p_codigo => 'NAP-DENTRO-2', p_tipo => 'nap', p_zona => v_zona,
    p_lat => 24.8342000, p_lon => -103.6450000, p_capacidad => 8);

  begin
    perform public.terminar_hilo(v_caja, v_r1, v_nap2);
    v_falla := v_falla + 1;
    raise notice 'FALLA · el mismo hilo quedo alimentando dos NAP';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%NAP-DENTRO%' and v_msg not like '%des %' then
      raise notice 'PASA · un hilo alimenta una sola NAP, y el recado ya se lee bien';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota pero el recado esta mal escrito: %', v_msg;
    end if;
  end;

  -- ── se recoge ───────────────────────────────────────────────────────────
  perform public.eliminar_elemento(v_nap2);
  update public.network_elements set feed_strand_id = null where id = v_nap;
  perform public.eliminar_elemento(v_nap);
  delete from public.fiber_splices where closure_id = v_caja;
  perform public.despatchear(v_p1);
  perform public.soltar_cable(v_p1);
  perform public.soltar_cable(
    (select id from public.odf_ports where odf_id = v_odf and port_number = 2));
  perform public.eliminar_elemento(v_odf);
  delete from public.pon_ports where card_id = v_tar;
  delete from public.olt_cards where id = v_tar;
  delete from public.network_devices where id = v_olt;
  delete from public.network_sites where id = v_sitio;
  update public.fiber_cables set from_id = null, to_id = null where id in (v_tr, v_ram);
  update public.fiber_strands set status = 'disponible' where cable_id in (v_tr, v_ram);
  delete from public.closure_cables where closure_id = v_caja;
  perform public.eliminar_cable(v_ram);
  perform public.eliminar_cable(v_tr);
  perform public.eliminar_elemento(v_caja);

  if v_falla = 0 then
    raise notice '── TODO BIEN · la caja se ve por dentro y no deja empalmar de mas ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end $p$;
