-- ============================================================================
-- Prueba · Las NAP y las cajas van sobre la fibra
--
-- Lo que se está comprobando no es que la función corra, sino que la regla no
-- se pueda brincar: ni capturando de frente, ni arrastrando en el mapa, ni
-- editando después. Una regla que solo se cumple por una de las tres puertas
-- no es una regla.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

do $prueba$
declare
  v_org    uuid;
  v_zona   uuid;
  v_cable  uuid;
  v_nap    uuid;
  v_caja   uuid;
  v_falla  int := 0;
  v_msg    text;
  r        record;
  f        record;

  -- Una recta de un kilómetro hacia el oriente, en una calle que no usa
  -- ninguna otra prueba: si dos pruebas tienden cable por la misma calle, los
  -- postes de una se pegan al cable de la otra y el resultado ya no dice nada.
  c_ruta jsonb := '[[24.850000,-103.700000],[24.850000,-103.690000]]'::jsonb;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_zona from public.zones where code = 'CUE';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  -- ── preparación ──────────────────────────────────────────────────────────
  v_cable := public.guardar_cable(
    p_codigo => 'CAB-SOBRE-FIBRA', p_tipo => 'adss', p_hilos => 12, p_zona => v_zona);
  perform public.guardar_trazo(v_cable, c_ruta);

  -- ── 1 · sobre la línea: entra ────────────────────────────────────────────
  -- Justo a la mitad del cable, corrido tres metros al lado. Tres metros es
  -- el error normal de un GPS de celular: tiene que pasar.
  begin
    v_nap := public.guardar_elemento(
      p_codigo => 'NAP-FIBRA-01', p_tipo => 'nap', p_zona => v_zona,
      p_capacidad => 8, p_lat => 24.850027, p_lon => -103.695000);
    raise notice 'PASA · una NAP sobre la linea si entra';
  exception when others then
    v_falla := v_falla + 1;
    raise notice 'FALLA · rechazo una NAP que si estaba sobre la fibra: %', sqlerrm;
  end;

  -- ── 2 · queda pegada a la línea, no donde cayó el clic ────────────────────
  select latitude, cable_id, cable_pos_m into r
    from public.network_elements where id = v_nap;

  if r.latitude = 24.850000 and r.cable_id = v_cable then
    raise notice 'PASA · quedo pegada al cable, en el metro %', round(r.cable_pos_m);
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · no se pego a la linea (lat=% cable=%)', r.latitude, r.cable_id;
  end if;

  -- ── 3 · lejos de toda fibra: no entra ────────────────────────────────────
  -- Medio kilómetro al oriente, que es como estar en otra calle.
  begin
    perform public.guardar_elemento(
      p_codigo => 'NAP-FIBRA-02', p_tipo => 'nap', p_zona => v_zona,
      p_capacidad => 8, p_lat => 24.855000, p_lon => -103.695000);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo poner una NAP en el aire';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%no pasa ninguna fibra%' then
      raise notice 'PASA · rechaza la NAP lejos de la fibra, y dice a cuanto quedo';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · la rechazo, pero con un recado raro: %', v_msg;
    end if;
  end;

  -- ── 4 · una caja de empalme sigue la misma regla ─────────────────────────
  begin
    perform public.guardar_elemento(
      p_codigo => 'CAJA-FIBRA-02', p_tipo => 'closure', p_zona => v_zona,
      p_lat => 24.855000, p_lon => -103.695000);
    v_falla := v_falla + 1;
    raise notice 'FALLA · a la caja si la dejo en el aire';
  exception when others then
    raise notice 'PASA · la caja de empalme obedece la misma regla';
  end;

  -- ── 5 · sin coordenadas tampoco ──────────────────────────────────────────
  begin
    perform public.guardar_elemento(
      p_codigo => 'NAP-FIBRA-03', p_tipo => 'nap', p_zona => v_zona,
      p_capacidad => 8);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo capturar una NAP sin coordenadas';
  exception when others then
    raise notice 'PASA · una NAP sin coordenadas no entra';
  end;

  -- ── 6 · el ODF NO entra en la regla ──────────────────────────────────────
  -- Vive dentro de la caseta, donde el cable ya termino. Si la regla lo
  -- alcanzara, no se podria capturar la caseta.
  begin
    perform public.guardar_elemento(
      p_codigo => 'ODF-FIBRA', p_tipo => 'odf', p_zona => v_zona,
      p_lat => 24.855000, p_lon => -103.695000);
    raise notice 'PASA · el ODF se puede poner donde sea';
  exception when others then
    v_falla := v_falla + 1;
    raise notice 'FALLA · le aplico la regla al ODF: %', sqlerrm;
  end;

  -- ── 7 · arrastrar en el mapa tampoco la saca ─────────────────────────────
  begin
    perform public.mover_elemento(v_nap, 24.855000, -103.695000);
    v_falla := v_falla + 1;
    raise notice 'FALLA · el arrastre saco la NAP de la fibra';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%no pasa ninguna fibra%' then
      raise notice 'PASA · arrastrarla fuera de la fibra no se puede';
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · rechazo el arrastre con otro error: %', v_msg;
    end if;
  end;

  -- Y sigue donde estaba.
  select longitude into r from public.network_elements where id = v_nap;
  if r.longitude = -103.695000 then
    raise notice 'PASA · despues del rechazo se quedo donde estaba';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el rechazo la movio de todos modos';
  end if;

  -- ── 8 · moverla a otro punto de la misma fibra sí se puede ───────────────
  begin
    v_msg := public.mover_elemento(v_nap, 24.850020, -103.692000);
    select cable_pos_m into r from public.network_elements where id = v_nap;
    if round(r.cable_pos_m) between 780 and 830 then
      raise notice 'PASA · se movio a lo largo de la fibra, ahora en el metro %',
                   round(r.cable_pos_m);
    else
      v_falla := v_falla + 1;
      raise notice 'FALLA · se movio pero el metro no cuadra: %', r.cable_pos_m;
    end if;
  exception when others then
    v_falla := v_falla + 1;
    raise notice 'FALLA · no dejo moverla sobre su propia fibra: %', sqlerrm;
  end;

  -- ── 9 · borrar el trazo avisa a quien deja suelto ────────────────────────
  v_msg := public.borrar_trazo(v_cable);
  if v_msg like '%1 caja quedó suelta%' then
    raise notice 'PASA · avisa que dejo una caja suelta al borrar el trazo';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · borro el trazo sin avisar: %', v_msg;
  end if;

  select cable_id into r from public.network_elements where id = v_nap;
  if r.cable_id is null then
    raise notice 'PASA · la NAP ya no cuelga de ningun cable';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · quedo colgando de un cable sin trazo';
  end if;

  -- ── 10 · sin ningún cable dibujado, el recado es otro ────────────────────
  begin
    perform public.guardar_elemento(
      p_codigo => 'NAP-FIBRA-04', p_tipo => 'nap', p_zona => v_zona,
      p_capacidad => 8, p_lat => 24.850000, p_lon => -103.695000);
    v_falla := v_falla + 1;
    raise notice 'FALLA · dejo poner una NAP sin cables dibujados';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%ningún cable con su trazo%' then
      raise notice 'PASA · sin trazos dice que hay que dibujar la ruta primero';
    else
      raise notice 'PASA · la rechaza (recado: %)', left(v_msg, 60);
    end if;
  end;

  -- ── 11 · el repaso pega lo que ya estaba bien ────────────────────────────
  perform public.guardar_trazo(v_cable, c_ruta);
  for f in select * from public.repasar_sobre_fibra() loop
    if f.codigo = 'NAP-FIBRA-01' and f.quedo like 'pegada a%' then
      raise notice 'PASA · el repaso volvio a pegar % (%)', f.codigo, f.quedo;
    end if;
  end loop;

  select cable_id into r from public.network_elements where id = v_nap;
  if r.cable_id = v_cable then
    raise notice 'PASA · quedo colgada otra vez de su cable';
  else
    v_falla := v_falla + 1;
    raise notice 'FALLA · el repaso no la volvio a colgar';
  end if;

  -- ── limpieza ─────────────────────────────────────────────────────────────
  delete from public.network_elements
   where code in ('NAP-FIBRA-01','CAJA-FIBRA-02','ODF-FIBRA');
  perform public.eliminar_cable(v_cable);

  if v_falla = 0 then
    raise notice '── TODO BIEN · la fibra manda, por las tres puertas ──';
  else
    raise exception '── % PRUEBAS FALLARON ──', v_falla;
  end if;
end;
$prueba$;
