-- ============================================================================
-- Prueba · Las dos puertas que el recado prometía
--
-- Al querer borrar la OLT «huawei ma 5800» la base contestó que tenía una
-- tarjeta capturada y que, si ya no estaba en servicio, la marcara como «ya
-- no se usa». Ese botón nunca existió, y tampoco había forma de quitarle la
-- tarjeta: el recado mandaba a dos salidas y las dos estaban cerradas.
--
-- Lo que se comprueba:
--   · que el recado nombre el slot y diga las dos salidas
--   · que se pueda quitar una tarjeta, con sus puertos
--   · que NO se pueda quitar si algún PON sigue patcheado, y los nombre
--   · que se pueda dar de baja sin borrar, y volver a dar de alta
--   · que NO se pueda dar de baja algo que sigue dando servicio
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
  v_olt   uuid;
  v_tar   uuid;
  v_odf   uuid;
  v_pon   uuid;
  v_pto   uuid;
  v_falla int := 0;
  v_n     int;
  v_msg   text;
begin
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── se arma el caso de la OLT capturada de mas ──────────────────────────
  v_olt := public.guardar_dispositivo(null, 'OLT-DOS-PUERTAS', 'olt', null, v_zona);
  v_tar := public.abrir_tarjeta(v_olt, 1, 'gpon', 16);
  select pp.id into v_pon from public.pon_ports pp
   where pp.card_id = v_tar and pp.port_number = 1;

  v_odf := public.guardar_elemento(p_codigo => 'ODF-DOS-PUERTAS', p_tipo => 'odf', p_zona => v_zona);
  perform public.abrir_puertos_odf(v_odf, 1, 12);
  select op.id into v_pto from public.odf_ports op
   where op.odf_id = v_odf and op.tray_number = 1 and op.port_number = 1;
  perform public.patchear(v_pon, v_pto);

  -- ── 1 · el recado nombra el slot y dice las dos salidas ─────────────────
  begin
    perform public.eliminar_dispositivo(v_olt);
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro la OLT con su tarjeta';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%slot 1%' and v_msg like '%quitar%' and v_msg like '%ya no se usa%' then
      raise notice 'PASA · el recado nombra el slot y dice las dos salidas';
      raise notice '       %', v_msg;
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · el recado quedo corto: %', v_msg;
    end if;
  end;

  -- ── 2 · la tarjeta no se quita con el latiguillo puesto ─────────────────
  begin
    perform public.eliminar_tarjeta(v_tar);
    v_falla := v_falla + 1;
    raise notice 'FALLA · quito la tarjeta con un PON patcheado';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%ODF-DOS-PUERTAS%' and v_msg like '%vaciar%' then
      raise notice 'PASA · no la quita con el latiguillo puesto, y dice a donde va y como soltarlo';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota sin orientar: %', v_msg;
    end if;
  end;

  -- ── 3 · tampoco se da de baja la OLT con el PON patcheado ───────────────
  begin
    perform public.ya_no_se_usa(v_olt, 'equipo', false);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dio de baja una OLT con un PON patcheado';
  exception when others then
    v_msg := SQLERRM;
    if v_msg like '%patcheados%' then
      raise notice 'PASA · no da de baja una OLT que sigue patcheada al ODF';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rebota por otra razon: %', v_msg;
    end if;
  end;

  -- ── 4 · se vacia el puerto y entonces si ────────────────────────────────
  perform public.vaciar_puerto_odf(v_pto);

  v_msg := public.ya_no_se_usa(v_olt, 'equipo', false);
  if v_msg like '%ya no se usa%' and v_msg like '%historia%' then
    raise notice 'PASA · %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el recado al dar de baja quedo corto: %', v_msg;
  end if;

  select count(*) into v_n
    from public.network_devices where id = v_olt and is_active = false;
  if v_n = 1 then
    raise notice 'PASA · quedo dada de baja, pero NO borrada: sigue existiendo';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no quedo dada de baja';
  end if;

  -- Y se puede revivir, que es la mitad de la gracia.
  v_msg := public.ya_no_se_usa(v_olt, 'equipo', true);
  select count(*) into v_n
    from public.network_devices where id = v_olt and is_active = true;
  if v_n = 1 then
    raise notice 'PASA · y se puede volver a poner en servicio: %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no revivio';
  end if;

  -- ── 5 · la otra puerta: quitar la tarjeta ───────────────────────────────
  select count(*) into v_n from public.pon_ports where card_id = v_tar;
  if v_n = 16 then
    raise notice 'PASA · la tarjeta trae sus 16 puertos antes de quitarla';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · trae % puertos', v_n;
  end if;

  v_msg := public.eliminar_tarjeta(v_tar);
  if v_msg like '%slot 1%' then
    raise notice 'PASA · %', v_msg;
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no quito la tarjeta: %', v_msg;
  end if;

  select count(*) into v_n from public.pon_ports where card_id = v_tar;
  if v_n = 0 then
    raise notice 'PASA · se fueron sus puertos con ella, sin dejar huerfanos';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · quedaron % puertos sueltos', v_n;
  end if;

  -- ── 6 · y sin tarjetas, la OLT si se borra ──────────────────────────────
  v_msg := public.eliminar_dispositivo(v_olt);
  if v_msg = 'OLT-DOS-PUERTAS' then
    raise notice 'PASA · sin tarjetas, la OLT si se borra';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no borro la OLT: %', v_msg;
  end if;

  -- ── se recoge ───────────────────────────────────────────────────────────
  perform public.eliminar_elemento(v_odf);

  if v_falla = 0 then
    raise notice '── TODO BIEN · las dos puertas que el recado prometia estan abiertas ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end $p$;
