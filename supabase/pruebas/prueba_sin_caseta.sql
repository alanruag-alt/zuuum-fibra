-- ============================================================================
-- Prueba · Nada queda sin puerta
--
-- El caso exacto de ODFPEDRI1: un ODF que no pertenece a ninguna caseta, con
-- un puerto ocupado por el PON de una OLT que tampoco está montada. La base
-- se negaba a borrarlo diciendo «tiene 1 puertos ocupados» sin decir cuál, y
-- no existía ninguna pantalla desde donde desconectarlo.
--
-- Lo que se comprueba:
--   · que el recado diga QUÉ ocupa el puerto, con bandeja, puerto y de dónde
--   · que lo huérfano se pueda listar, para poder enseñarlo
--   · que un puerto se pueda vaciar de un solo movimiento
--   · que se le pueda asignar caseta, y que herede coordenadas
--   · que la caseta enseñe sus equipos aunque NO estén montados en un rack
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
  v_pto   uuid;
  v_cable uuid;
  v_hilo  uuid;
  v_falla int := 0;
  v_n     int;
  v_msg   text;
  r       record;
begin
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── se arma el caso: todo huérfano, nada montado ────────────────────────
  v_olt := public.guardar_dispositivo(null, 'OLT-HUERFANA', 'olt', null, v_zona);
  v_tar := public.abrir_tarjeta(v_olt, 1, null, 8);
  select pp.id into v_pon from public.pon_ports pp where pp.card_id = v_tar and pp.port_number = 1;

  v_odf := public.guardar_elemento(p_codigo => 'ODF-HUERFANO', p_tipo => 'odf', p_zona => v_zona);
  perform public.abrir_puertos_odf(v_odf, 1, 12);
  select op.id into v_pto from public.odf_ports op
   where op.odf_id = v_odf and op.tray_number = 1 and op.port_number = 1;

  perform public.patchear(v_pon, v_pto);

  v_cable := public.guardar_cable(null, 'CB-HUERFANO', 'adss', 12, v_zona);
  select s.id into v_hilo from public.fiber_strands s
   where s.cable_id = v_cable and s.strand_number = 1;
  perform public.arrancar_cable(v_pto, v_hilo);

  -- ── 1 · el recado dice QUÉ ocupa el puerto ──────────────────────────────
  begin
    perform public.eliminar_elemento(v_odf);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro el ODF con un puerto ocupado';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%bandeja 1 puerto 1%' and v_msg like '%OLT-HUERFANA%'
       and v_msg like '%CB-HUERFANO%' then
      raise notice 'PASA · el recado dice el puerto, de donde le entra y a donde sale';
      raise notice '       %', v_msg;
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · el recado sigue siendo ciego: %', v_msg;
    end if;
  end;

  -- ── 2 · lo huérfano se puede listar ─────────────────────────────────────
  select count(*) into v_n from public.sin_caseta();
  if v_n >= 2 then
    raise notice 'PASA · la OLT y el ODF sin caseta si se pueden listar';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · sin_caseta() devolvio %', v_n;
  end if;

  select * into r from public.sin_caseta() where nombre = 'ODF-HUERFANO';
  if r.detalle like '%1 de 12 puertos ocupados%' then
    raise notice 'PASA · dice cuantos puertos trae ocupados: %', r.detalle;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el detalle salio «%»', r.detalle;
  end if;

  -- ── 3 · la caseta enseña sus equipos aunque no esten montados ───────────
  -- Aquí estaba la raíz: la pantalla los sacaba de rack_items, o sea, solo lo
  -- montado. Con el sitio en nulo salen los huérfanos.
  select count(*) into v_n from public.equipos_de_la_caseta(null);
  if v_n >= 2 then
    raise notice 'PASA · la OLT y el ODF salen aunque no esten en ningun gabinete';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · equipos_de_la_caseta(null) devolvio %', v_n;
  end if;

  select * into r from public.equipos_de_la_caseta(null) where label = 'OLT-HUERFANA';
  if r.posicion is null and r.tarjetas = 1 and r.puertos_pon = 8 and r.pon_patcheados = 1 then
    raise notice 'PASA · la OLT sale sin U pero con sus 8 PON y 1 patcheado';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la OLT salio con U% y % PON', r.posicion, r.puertos_pon;
  end if;

  select count(*) into v_n from public.puertos_odf_de_la_caseta(null);
  if v_n = 12 then
    raise notice 'PASA · los 12 puertos del ODF huerfano si se pueden tocar';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · se ven % puertos', v_n;
  end if;

  select count(*) into v_n from public.puertos_pon_de_la_caseta(null);
  if v_n = 8 then
    raise notice 'PASA · los 8 PON de la OLT huerfana tambien';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · se ven % PON', v_n;
  end if;

  -- ── 4 · vaciar el puerto de un solo movimiento ──────────────────────────
  v_msg := public.vaciar_puerto_odf(v_pto);
  if v_msg like '%latiguillo%' and v_msg like '%cable%' then
    raise notice 'PASA · %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el recado al vaciar quedo corto: %', v_msg;
  end if;

  select status, pon_port_id, out_strand_id into r from public.odf_ports where id = v_pto;
  if r.status = 'libre' and r.pon_port_id is null and r.out_strand_id is null then
    raise notice 'PASA · el puerto quedo limpio de los dos lados';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el puerto quedo en «%»', r.status;
  end if;

  -- Vaciar uno que ya estaba libre no truena, nada más lo dice.
  v_msg := public.vaciar_puerto_odf(v_pto);
  if v_msg like '%ya estaba libre%' then
    raise notice 'PASA · vaciar uno que ya estaba libre no truena';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · %', v_msg;
  end if;

  -- ── 5 · asignarle caseta, y que herede coordenadas ──────────────────────
  v_sitio := public.guardar_sitio(null, 'Caseta que recoge', 'olt_site', v_zona,
                                  25.0925000, -103.7748000);

  v_msg := public.asignar_a_sitio(v_odf, 'elemento', v_sitio);
  if v_msg like '%Caseta que recoge%' then
    raise notice 'PASA · %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no le asigno caseta: %', v_msg;
  end if;

  select site_id, latitude into r from public.network_elements where id = v_odf;
  if r.site_id = v_sitio and r.latitude = 25.0925000 then
    raise notice 'PASA · quedo en la caseta y heredo sus coordenadas para el mapa';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · quedo sin sitio o sin coordenadas';
  end if;

  -- Y ahora sale en ESA caseta, aunque siga sin gabinete.
  select count(*) into v_n from public.equipos_de_la_caseta(v_sitio);
  if v_n = 1 then
    raise notice 'PASA · ya sale en su caseta, aunque siga sin gabinete';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la caseta enseña % equipos', v_n;
  end if;

  select count(*) into v_n from public.sin_caseta() where nombre = 'ODF-HUERFANO';
  if v_n = 0 then
    raise notice 'PASA · y ya no aparece entre los huerfanos';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · sigue apareciendo como huerfano';
  end if;

  -- ── 6 · vacio, el ODF si se borra ───────────────────────────────────────
  v_msg := public.eliminar_elemento(v_odf);
  if v_msg = 'ODF-HUERFANO' then
    raise notice 'PASA · con el puerto libre, el ODF si se borra';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no borro el ODF: %', v_msg;
  end if;

  -- ── se recoge ───────────────────────────────────────────────────────────
  update public.fiber_strands set status = 'disponible' where cable_id = v_cable;
  perform public.eliminar_cable(v_cable);
  delete from public.pon_ports where card_id = v_tar;
  delete from public.olt_cards where id = v_tar;
  delete from public.network_devices where id = v_olt;
  delete from public.network_sites where id = v_sitio;

  if v_falla = 0 then
    raise notice '── TODO BIEN · nada queda sin puerta ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end $p$;
