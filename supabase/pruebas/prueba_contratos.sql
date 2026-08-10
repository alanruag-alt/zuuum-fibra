-- ============================================================================
-- PRUEBAS DE CONTRATOS Y SITIOS · ZUUUM FIBRA
-- ----------------------------------------------------------------------------
-- Se corre después de prueba_seguridad.sql.
--   Ana = administradora   Beto = oficina   Carlos = técnico
--
-- OJO con el error que ya nos mordió tres veces: si una prueba «pasa» porque
-- RLS escondió la fila y la función recibió NULL, no probó nada. Por eso los
-- ids se resuelven ANTES de cambiar de rol, y cada prueba dice qué espera.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

grant usage on schema public, auth, extensions to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 1 · Generar el contrato de un servicio'
\echo '  Se espera: PASA · folio CT-CUE-0001, activo, amarrado al servicio'
\echo '════════════════════════════════════════════════════════════════'
select s.id as srv from public.customer_services s
  join public.customers c on c.id = s.customer_id
  join public.zones z on z.id = c.zone_id
 where z.code = 'CUE' order by c.customer_code limit 1
\gset

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_ct on commit drop as
  select * from public.generar_contrato(:'srv'::uuid, date '2026-08-01', 12);

  select case
           when ct.contract_number = 'CT-CUE-0001'
            and ct.status = 'active'
            and ct.end_date = date '2027-08-01'
            and s.contract_id = ct.id
           then 'PASA' else '>>> FALLA <<<' end as resultado,
         ct.contract_number, ct.status, ct.start_date, ct.end_date
    from public.contracts ct
    join public.customer_services s on s.contract_id = ct.id
   where ct.id = (select contrato_id from t_ct);
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 2 · Pedir dos veces el contrato del mismo servicio'
\echo '  Se espera: PASA · devuelve el mismo folio, no genera uno nuevo'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when count(*) = 1 and max(contract_number) = 'CT-CUE-0001'
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         count(*) as contratos_del_cliente
    from public.contracts ct
   where ct.customer_id = (select customer_id from public.customer_services
                            where id = :'srv'::uuid)
     and ct.id = (select contrato_id from public.generar_contrato(:'srv'::uuid));
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 3 · Un contrato activo sin firma sale marcado'
\echo '  Se espera: PASA · sin_firmar = true'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when v.sin_firmar then 'PASA' else '>>> FALLA <<<' end as resultado,
         v.contract_number, v.cliente, v.zona, v.mensualidad, v.sin_firmar
    from public.v_contratos v
   where v.contract_number = 'CT-CUE-0001';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 4 · Firmarlo'
\echo '  Se espera: PASA · signed_at con fecha y sin_firmar = false'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.firmar_contrato(ct.id) from public.contracts ct
   where ct.contract_number = 'CT-CUE-0001';

  select case when v.signed_at is not null and not v.sin_firmar
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         v.signed_at is not null as firmado, v.sin_firmar
    from public.v_contratos v
   where v.contract_number = 'CT-CUE-0001';
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 5 · Carlos (técnico) no puede generar contratos'
\echo '  Se espera: PASA · lo rechaza por permiso'
\echo '════════════════════════════════════════════════════════════════'
-- El id se resuelve AQUÍ, con permisos plenos. Si se resolviera adentro,
-- RLS le daría NULL a Carlos y la función fallaría por otra razón: la prueba
-- pasaría sin haber probado el permiso.
-- psql no sustituye variables dentro de un bloque $$ ... $$, así que el id
-- viaja en una tabla temporal. Las temporales no llevan RLS, y de todos modos
-- se llenó antes de cambiar de rol.
drop table if exists t_srv2;
create temporary table t_srv2 as
select s.id from public.customer_services s
  join public.customers c on c.id = s.customer_id
  join public.zones z on z.id = c.zone_id
 where z.code = 'CUE' and s.contract_id is null
 order by c.customer_code limit 1;
grant select on t_srv2 to authenticated;

do $$
declare v_msg text; v_srv uuid;
begin
  select id into v_srv from t_srv2;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.generar_contrato(v_srv);
    raise notice '>>> FALLA <<< Carlos generó un contrato';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%permiso%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 6 · Cancelar sin motivo'
\echo '  Se espera: PASA · lo rechaza'
\echo '════════════════════════════════════════════════════════════════'
do $$
declare v_msg text; v_id uuid;
begin
  select id into v_id from public.contracts where contract_number = 'CT-CUE-0001';
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.cancelar_contrato(v_id, '   ');
    raise notice '>>> FALLA <<< canceló sin decir por qué';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%por qué%' then
      raise notice 'PASA · rechazado: %', v_msg;
    else
      raise notice '>>> FALLA <<< se cayó por otra razón: %', v_msg;
    end if;
  end;
end $$;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 7 · Cancelar el papel NO corta el servicio'
\echo '  Se espera: PASA · contrato cancelado, servicio sigue activo'
\echo '════════════════════════════════════════════════════════════════'
-- Lo que importa no es que el servicio esté activo, sino que cancelar el
-- papel no le haya movido nada. Se guarda cómo estaba y se compara.
select s.status as antes from public.customer_services s where s.id = :'srv'::uuid
\gset

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select public.cancelar_contrato(ct.id, 'Se rehizo con otro plan')
    from public.contracts ct where ct.contract_number = 'CT-CUE-0001';

  select case when ct.status = 'cancelled'
               and s.status = :'antes'
               and s.contract_id is null
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         ct.status as contrato, :'antes' as servicio_antes, s.status as servicio_ahora
    from public.contracts ct, public.customer_services s
   where ct.contract_number = 'CT-CUE-0001' and s.id = :'srv'::uuid;
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 8 · Después de cancelar, se puede generar uno nuevo'
\echo '  Se espera: PASA · folio CT-CUE-0002'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select case when contract_number = 'CT-CUE-0002' then 'PASA' else '>>> FALLA <<<' end
           as resultado,
         contract_number
    from public.generar_contrato(:'srv'::uuid);
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 9 · Un sitio con su equipo, y uno caído'
\echo '  Se espera: PASA · dispositivos 2, caídos 1'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  create temporary table t_sitio on commit drop as
  select public.guardar_sitio(null, 'Cerro de Velardeña', 'tower',
                              (select id from public.zones where code = 'VEL'),
                              25.0700, -103.7100) as id;

  select public.guardar_dispositivo(null, 'Sector norte 5GHz', 'sector',
                                    (select id from t_sitio), null,
                                    '10.10.0.2', 'Mimosa', 'C5c');
  select public.guardar_dispositivo(null, 'Sector sur 5GHz', 'sector',
                                    (select id from t_sitio), null,
                                    '10.10.0.3', 'Mimosa', 'C5c');

  -- Uno se cae. El estado no lo pone una persona: lo va a poner el agente
  -- local cuando el ping deje de contestar.
  update public.network_devices set status = 'offline'
   where mgmt_ip = '10.10.0.3'::inet;

  select case when v.dispositivos = 2 and v.caidos = 1
              then 'PASA' else '>>> FALLA <<<' end as resultado,
         v.name, v.zona, v.dispositivos, v.caidos
    from public.v_sitios v where v.id = (select id from t_sitio);
commit;

-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'PRUEBA 10 · Beto (oficina) no ve contratos de zonas que no son suyas'
\echo '  Se espera: PASA · cero contratos de Cuencamé'
\echo '════════════════════════════════════════════════════════════════'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select case when count(*) = 0 then 'PASA' else '>>> FALLA <<<' end as resultado,
         count(*) as contratos_de_cuencame
    from public.v_contratos where zona = 'Cuencamé';
commit;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'FIN DE LAS PRUEBAS DE CONTRATOS Y SITIOS'
\echo '════════════════════════════════════════════════════════════════'
