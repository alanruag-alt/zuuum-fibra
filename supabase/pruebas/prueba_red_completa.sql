-- ============================================================================
-- Prueba · La red FTTH completa, de la OLT al cliente
--
-- Se arma una red chiquita pero real, con todas las piezas:
--
--   Sitio Caseta → OLT VSOL → tarjeta 1 → PON 1/2 → ODF-PR bandeja 1 puerto 5
--   → troncal TR-PRUEBA hilo 1 → caja CE-PRUEBA → splitter SPL-PRUEBA 1x8
--   → salida 3 → NAP-PRUEBA puerto 6 → un cliente de verdad
--
-- Y luego se le pega a cada validación a ver si aguanta. Una regla que nunca
-- se probó negando algo no es una regla: es una intención.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

do $prueba$
declare
  v_zona   uuid;
  v_sitio  uuid;
  v_olt    uuid;
  v_tar    uuid;
  v_pon    uuid;
  v_pon2   uuid;
  v_odf    uuid;
  v_p5     uuid;
  v_p6     uuid;
  v_cable  uuid;
  v_h1     uuid;
  v_h2     uuid;
  v_h3     uuid;
  v_caja   uuid;
  v_spl    uuid;
  v_sal3   uuid;
  v_nap    uuid;
  v_np6    uuid;
  v_srv    uuid;
  v_falla  int := 0;
  v_msg    text;
  v_n      int;
  r        record;
  v_ruta   text := '';
begin
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── se arma la red ───────────────────────────────────────────────────────
  v_sitio := public.guardar_sitio(null, 'Caseta de prueba', 'olt_site', v_zona,
                                  24.8700000, -103.7000000);
  v_olt := public.guardar_dispositivo(null, 'OLT-PRUEBA', 'olt', v_sitio, v_zona,
                                      null, 'VSOL', 'V1600D');
  v_tar := public.abrir_tarjeta(v_olt, 1, 'GPON 8', 8);

  select id into v_pon  from public.pon_ports where card_id = v_tar and port_number = 2;
  select id into v_pon2 from public.pon_ports where card_id = v_tar and port_number = 3;

  if v_pon is null then
    v_falla := v_falla + 1;
    raise notice 'FALLA · la tarjeta no creo sus puertos PON';
  else
    select count(*) into v_n from public.pon_ports where card_id = v_tar;
    if v_n = 8 then
      raise notice 'PASA · la tarjeta nacio con sus 8 puertos PON';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · la tarjeta trae % puertos en vez de 8', v_n;
    end if;
  end if;

  v_odf := public.guardar_elemento(p_codigo => 'ODF-PR', p_tipo => 'odf',
                                   p_nombre => 'ODF de la caseta', p_zona => v_zona,
                                   p_lat => 24.8700000, p_lon => -103.7000000);
  update public.network_elements set site_id = v_sitio where id = v_odf;

  v_n := public.abrir_puertos_odf(v_odf, 1, 12);
  if v_n = 12 then
    raise notice 'PASA · el ODF abrio su bandeja de 12 puertos';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el ODF abrio % puertos', v_n;
  end if;

  select id into v_p5 from public.odf_ports where odf_id = v_odf and port_number = 5;
  select id into v_p6 from public.odf_ports where odf_id = v_odf and port_number = 6;

  -- ── 1 · el latiguillo PON → ODF ──────────────────────────────────────────
  v_msg := public.patchear(v_pon, v_p5);
  raise notice 'PASA · %', v_msg;

  -- Validación 1 · el mismo PON en otro puerto: no.
  begin
    perform public.patchear(v_pon, v_p6);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo patchear el mismo PON dos veces';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%ya está patcheado%' then
      raise notice 'PASA · un PON no se conecta dos veces, y dice donde esta el otro';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · lo rechazo con otro error: %', v_msg;
    end if;
  end;

  -- Validación 2 · otro PON en un puerto ocupado: no.
  begin
    perform public.patchear(v_pon2, v_p5);
    v_falla := v_falla + 1;
    raise notice 'FALLA · metio dos PON en el mismo puerto del ODF';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%ya tiene otro PON%' then
      raise notice 'PASA · un puerto del ODF aguanta una sola conexion';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · lo rechazo con otro error: %', v_msg;
    end if;
  end;

  -- ── 2 · el cable arranca del ODF ─────────────────────────────────────────
  v_cable := public.guardar_cable(null, 'TR-PRUEBA', 'adss', 12, v_zona);
  perform public.guardar_trazo(v_cable,
    '[[24.8700000,-103.7000000],[24.8700000,-103.6900000]]'::jsonb);

  select id into v_h1 from public.fiber_strands where cable_id = v_cable and strand_number = 1;
  select id into v_h2 from public.fiber_strands where cable_id = v_cable and strand_number = 2;
  select id into v_h3 from public.fiber_strands where cable_id = v_cable and strand_number = 3;

  v_msg := public.arrancar_cable(v_p5, v_h1);
  raise notice 'PASA · %', v_msg;

  -- Validación 3 · el mismo hilo saliendo de dos puertos: no.
  begin
    perform public.arrancar_cable(v_p6, v_h1);
    v_falla := v_falla + 1;
    raise notice 'FALLA · el mismo hilo arranca en dos puertos';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%ya sale de%' then
      raise notice 'PASA · un hilo tiene un solo origen';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · otro error: %', v_msg;
    end if;
  end;

  -- ── 3 · la caja y el splitter ────────────────────────────────────────────
  v_caja := public.guardar_elemento(p_codigo => 'CE-PRUEBA', p_tipo => 'closure',
                                    p_zona => v_zona,
                                    p_lat => 24.8700000, p_lon => -103.6950000);

  -- Validación 4 · splitter sin caja: no.
  begin
    perform public.abrir_splitter('SPL-HUERFANO', null, '1x8');
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo poner un splitter sin caja';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%va la caja%' then
      raise notice 'PASA · primero la caja, luego el splitter';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · otro error: %', v_msg;
    end if;
  end;

  v_spl := public.abrir_splitter('SPL-PRUEBA', v_caja, '1x8');

  -- Validación 5 · ocho salidas, ni una más.
  select count(*) into v_n from public.splitter_ports where splitter_id = v_spl;
  if v_n = 8 then
    raise notice 'PASA · el 1x8 nacio con ocho salidas';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el 1x8 tiene % salidas', v_n;
  end if;

  -- Validación 6 · cada salida con su estado.
  select count(*) into v_n from public.splitter_ports
   where splitter_id = v_spl and status = 'disponible';
  if v_n = 8 then
    raise notice 'PASA · las ocho salidas nacen disponibles';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · % salidas disponibles', v_n;
  end if;

  -- El hilo 1 entra al splitter.
  v_msg := public.alimentar_splitter(v_spl, v_h1);
  raise notice 'PASA · %', v_msg;

  -- Validación 3 otra vez · ese hilo ya se lo comió el splitter, así que una
  -- NAP de verdad tampoco lo puede usar. Se prueba contra una NAP real y no
  -- contra el ODF: si el rechazo viniera de «eso no es una NAP», la prueba
  -- estaría pasando por la razón equivocada y la validación 3 quedaría sin
  -- probar.
  declare v_otra uuid;
  begin
    v_otra := public.guardar_elemento(p_codigo => 'NAP-CHOQUE', p_tipo => 'nap',
                                      p_zona => v_zona, p_capacidad => 4,
                                      p_lat => 24.8700000, p_lon => -103.6940000);
    begin
      perform public.alimentar_nap(v_otra, v_h1);
      v_falla := v_falla + 1;
      raise notice 'FALLA · uso el mismo hilo para el splitter Y para una NAP';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like '%ya alimenta%' and v_msg like '%SPL-PRUEBA%' then
        raise notice 'PASA · el hilo ya es del splitter, y lo dice por su nombre';
      else
        v_falla := v_falla + 1;
        raise notice 'FALLA · otro error: %', v_msg;
      end if;
    end;
    perform public.eliminar_elemento(v_otra);
  end;

  -- ── 4 · la NAP colgada de una salida ─────────────────────────────────────
  v_nap := public.guardar_elemento(p_codigo => 'NAP-PRUEBA-RED', p_tipo => 'nap',
                                   p_zona => v_zona, p_capacidad => 8,
                                   p_lat => 24.8700000, p_lon => -103.6930000);

  select id into v_sal3 from public.splitter_ports
   where splitter_id = v_spl and port_number = 3;

  v_msg := public.alimentar_nap(v_nap, null, v_sal3);
  raise notice 'PASA · %', v_msg;

  -- Validación 7 · la NAP dice su cuenta.
  select puertos, ocupados, disponibles into r from public.v_naps where id = v_nap;
  if r.puertos = 8 and r.ocupados = 0 and r.disponibles = 8 then
    raise notice 'PASA · la NAP dice 8 puertos, 0 ocupados, 8 disponibles';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la cuenta de la NAP no cuadra: % % %',
                 r.puertos, r.ocupados, r.disponibles;
  end if;

  -- ── 5 · el cliente ───────────────────────────────────────────────────────
  select s.id into v_srv from public.customer_services s
    join public.customers c on c.id = s.customer_id
    join public.zones z on z.id = c.zone_id
   where z.code = 'CUE' limit 1;

  -- Validación 9 · el cliente no se cuelga del troncal.
  begin
    perform public.exigir_terminal_de_cliente(v_caja);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo colgar un cliente de una caja de empalme';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%se conecta en una NAP%' then
      raise notice 'PASA · el cliente va en una NAP, no en el troncal';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · otro error: %', v_msg;
    end if;
  end;

  perform public.asignar_puerto_nap(v_nap, 6, v_srv, -21.5);
  select id into v_np6 from public.nap_ports where element_id = v_nap and port_number = 6;
  raise notice 'PASA · el cliente quedo en el puerto 6 de la NAP';

  -- ── 6 · la ruta completa ─────────────────────────────────────────────────
  for r in select * from public.ruta_de_servicio(v_srv) loop
    v_ruta := v_ruta || r.que || ' ';
  end loop;

  raise notice 'RUTA · %', v_ruta;

  if v_ruta like 'sitio olt pon odf hilo splitter salida nap puerto_nap cliente%' then
    raise notice 'PASA · la ruta va del sitio al cliente, en orden y completa';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la ruta no salio como debe';
  end if;

  -- ── 7 · a quien le pega si truena el PON ─────────────────────────────────
  select count(*) into v_n from public.clientes_de_pon(v_pon);
  if v_n = 1 then
    raise notice 'PASA · el PON sabe que trae 1 cliente colgando';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el PON reporta % clientes', v_n;
  end if;

  -- ── 8 · validación 10 · no dejar rutas truncas ───────────────────────────
  begin
    perform public.eliminar_elemento(v_nap);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro una NAP con cliente';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%cliente conectado%' then
      raise notice 'PASA · no borra una NAP con cliente';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · otro error: %', v_msg;
    end if;
  end;

  begin
    perform public.eliminar_elemento(v_caja);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro la caja con el splitter adentro';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%adentro está%' then
      raise notice 'PASA · no borra una caja con splitter adentro';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · otro error: %', v_msg;
    end if;
  end;

  begin
    perform public.eliminar_splitter(v_spl);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro el splitter con salidas conectadas';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%salida%' then
      raise notice 'PASA · no borra un splitter con salidas ocupadas';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · otro error: %', v_msg;
    end if;
  end;

  begin
    perform public.eliminar_elemento(v_odf);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro el ODF con puertos ocupados';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    -- Desde la 043 el recado dice CUÁL puerto y qué trae, en vez de solo
    -- «tiene N puertos ocupados». Se exige eso: de eso se trataba el arreglo.
    if v_msg like '%bandeja%puerto%' and v_msg like '%OLT-PRUEBA%' then
      raise notice 'PASA · no borra un ODF ocupado, y dice cual puerto y que trae';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · otro error: %', v_msg;
    end if;
  end;

  -- ── 9 · validación 8 · la caja por dentro ────────────────────────────────
  select count(*) into v_n from public.v_caja_por_dentro where caja_id = v_caja;
  if v_n >= 1 then
    raise notice 'PASA · la caja se puede ver por dentro';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · la caja no enseña nada';
  end if;

  -- ── 10 · quitar el latiguillo avisa ──────────────────────────────────────
  v_msg := public.despatchear(v_p5);
  if v_msg like '%se queda sin señal%' then
    raise notice 'PASA · quitar el latiguillo avisa que el cable se queda sin luz';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · lo quito sin avisar: %', v_msg;
  end if;

  if v_falla = 0 then
    raise notice '── TODO BIEN · la red se traza de la OLT al cliente ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end;
$prueba$;
