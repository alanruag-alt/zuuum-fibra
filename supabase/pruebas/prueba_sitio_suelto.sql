-- ============================================================================
-- Prueba · Lo que estorba se nombra, y lo suelto se ve
--
-- El caso es real y salió en Pedriceña: se quiso borrar la caseta y la base
-- contestó «tiene un equipo ahí» sin decir cuál. El equipo existía —una OLT
-- dada de alta ese mismo día, nunca montada en un rack— pero desde la
-- pantalla no aparecía en ningún lado.
--
-- Lo que se comprueba:
--   · que el recado NOMBRE lo que estorba
--   · que lo suelto se pueda listar, para poder enseñarlo
--   · que se pueda sacar del sitio, o montarlo, y entonces sí borrar
--   · que un elemento amarrado al sitio también estorbe (antes no contaba)
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

do $p$
declare
  v_zona   uuid;
  v_sitio  uuid;
  v_rack   uuid;
  v_olt    uuid;
  v_odf    uuid;
  v_item   uuid;
  v_falla  int := 0;
  v_n      int;
  v_msg    text;
  r        record;
begin
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── el caso de Pedriceña, tal cual ──────────────────────────────────────
  v_sitio := public.guardar_sitio(null, 'Caseta suelta', 'tower', v_zona,
                                  25.0925000, -103.7748000);

  -- Una OLT amarrada al sitio, con su tarjeta, y NUNCA montada en un rack.
  v_olt := public.guardar_dispositivo(null, 'huawei ma 5800 prueba', 'olt', v_sitio, v_zona,
                                      null, null, null);
  perform public.abrir_tarjeta(v_olt, 1, null, 8);

  -- ── 1 · el recado nombra lo que estorba ─────────────────────────────────
  begin
    perform public.eliminar_sitio(v_sitio);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro la caseta con una OLT adentro';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%huawei ma 5800 prueba%' then
      raise notice 'PASA · el recado dice CUAL equipo estorba: %', v_msg;
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · se niega pero no dice cual: %', v_msg;
    end if;
  end;

  -- ── 2 · lo suelto se puede listar ───────────────────────────────────────
  select count(*) into v_n from public.sueltos_del_sitio(v_sitio);
  if v_n = 1 then
    raise notice 'PASA · la caseta enseña 1 cosa suelta, sin gabinete';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la caseta enseña % sueltas', v_n;
  end if;

  select * into r from public.sueltos_del_sitio(v_sitio);
  if r.que = 'equipo' and r.nombre = 'huawei ma 5800 prueba' and r.detalle like '%1 tarjetas%' then
    raise notice 'PASA · dice que es, como se llama y que trae: %', r.detalle;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el renglon salio como «%» / «%» / «%»', r.que, r.nombre, r.detalle;
  end if;

  -- ── 3 · un elemento del sitio también estorba ───────────────────────────
  -- Antes solo se miraban los equipos: un ODF amarrado dejaba borrar el sitio
  -- y quedaba apuntando a uno que ya no existía.
  v_odf := public.guardar_elemento(p_codigo => 'ODF-SUELTA', p_tipo => 'odf', p_zona => v_zona);
  update public.network_elements set site_id = v_sitio where id = v_odf;

  begin
    perform public.eliminar_sitio(v_sitio);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro la caseta con un ODF amarrado';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%ODF-SUELTA%' and v_msg like '%2 cosas%' then
      raise notice 'PASA · el ODF amarrado tambien estorba, y las cuenta bien';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · el recado quedo mal: %', v_msg;
    end if;
  end;

  -- El recado no debe traer «s» sueltas de marcadores mal puestos.
  if v_msg not like '%)s%' and v_msg not like '%s)%' then
    raise notice 'PASA · el recado se lee limpio, sin letras sueltas';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el recado trae basura: %', v_msg;
  end if;

  select count(*) into v_n from public.sueltos_del_sitio(v_sitio);
  if v_n = 2 then
    raise notice 'PASA · ahora la caseta enseña las 2 cosas sueltas';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · enseña % sueltas', v_n;
  end if;

  -- ── 4 · una salida: montarlo en el gabinete ─────────────────────────────
  v_rack := public.guardar_rack(null, v_sitio, 'Rack de la suelta', 12, null, null);
  v_item := public.montar_en_rack(v_rack, 'huawei ma 5800 prueba', 'olt', 1, 2, v_olt);

  select count(*) into v_n from public.sueltos_del_sitio(v_sitio);
  if v_n = 1 then
    raise notice 'PASA · al montarla en el gabinete deja de estar suelta';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · siguen % sueltas', v_n;
  end if;

  -- ── 5 · la otra salida: sacarlo del sitio ───────────────────────────────
  v_msg := public.sacar_del_sitio(v_odf, 'elemento');
  if v_msg like '%ODF-SUELTA%' then
    raise notice 'PASA · %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no lo saco del sitio: %', v_msg;
  end if;

  select count(*) into v_n from public.sueltos_del_sitio(v_sitio);
  if v_n = 0 then
    raise notice 'PASA · ya no queda nada suelto en la caseta';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · quedan % sueltas', v_n;
  end if;

  -- ── 6 · lo montado NO se saca sin bajarlo antes ─────────────────────────
  begin
    perform public.sacar_del_sitio(v_olt, 'equipo');
    v_falla := v_falla + 1;
    raise notice 'FALLA · saco del sitio un equipo que sigue montado en el rack';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%gabinete%' then
      raise notice 'PASA · no deja sacar del sitio algo que sigue montado en el gabinete';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota sin explicar: %', v_msg;
    end if;
  end;

  -- ── 7 · vacía, la caseta sí se borra ────────────────────────────────────
  perform public.desmontar_del_rack(v_item, true);
  perform public.eliminar_rack(v_rack);
  delete from public.pon_ports pp using public.olt_cards ca
   where ca.id = pp.card_id and ca.device_id = v_olt;
  delete from public.olt_cards where device_id = v_olt;
  delete from public.network_devices where id = v_olt;

  v_msg := public.eliminar_sitio(v_sitio);
  if v_msg = 'Caseta suelta' then
    raise notice 'PASA · vacia si se borra';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no borro la caseta vacia: %', v_msg;
  end if;

  perform public.eliminar_elemento(v_odf);

  if v_falla = 0 then
    raise notice '── TODO BIEN · lo que estorba se nombra y lo suelto se ve ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end $p$;
