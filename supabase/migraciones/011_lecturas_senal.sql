-- ============================================================================
-- 011 · Historial de señal  (particionado por mes)
-- ============================================================================
-- 206 CPE + 158 ONU leídos cada 5 minutos son ~105,000 renglones al día.
-- Dos medidas desde el principio:
--   1. Particionar por mes: borrar un mes viejo es instantáneo.
--   2. Guardar solo cuando la señal cambia más de 1 dBm.
-- Después de 90 días se resume a promedios por hora y se sueltan los crudos.
-- ============================================================================

create table public.device_readings (
  id                 uuid not null default extensions.gen_random_uuid(),
  org_id             uuid not null,
  device_id          uuid,
  equipment_unit_id  uuid,
  service_id         uuid,
  read_at            timestamptz not null default now(),
  source             text not null check (source in
                     ('uisp','snmp','telnet','adminolt','manual')),
  rx_power_dbm       numeric(6,2),
  tx_power_dbm       numeric(6,2),
  signal_dbm         numeric(6,2),
  noise_floor_dbm    numeric(6,2),
  ccq                numeric(5,2),
  uptime_seconds     bigint,
  status             text check (status in ('online','offline')),
  primary key (id, read_at)
) partition by range (read_at);

comment on table public.device_readings is
  'Particionada por mes. Sin llaves foráneas a propósito: en una tabla de este '
  'volumen cada verificación cuesta, y los datos los escribe solo el agente local.';

-- Crea la partición del mes que se le pida (y no truena si ya existe).
create or replace function public.crear_particion_lecturas(p_anio int, p_mes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ini date := make_date(p_anio, p_mes, 1);
  v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month')::date;
  v_nom text := format('device_readings_%s_%s', p_anio, lpad(p_mes::text, 2, '0'));
begin
  if to_regclass('public.' || v_nom) is not null then
    return;
  end if;
  execute format(
    'create table public.%I partition of public.device_readings for values from (%L) to (%L);',
    v_nom, v_ini, v_fin);
  execute format(
    'create index %I on public.%I (equipment_unit_id, read_at desc);',
    v_nom || '_equipo_idx', v_nom);
  execute format(
    'create index %I on public.%I (device_id, read_at desc);',
    v_nom || '_equipored_idx', v_nom);
end;
$$;

-- Resumen por hora: lo que queda cuando se sueltan los crudos.
create table public.device_readings_hourly (
  id                 uuid primary key default extensions.gen_random_uuid(),
  org_id             uuid not null,
  device_id          uuid,
  equipment_unit_id  uuid,
  hour               timestamptz not null,
  samples            integer not null,
  rx_avg             numeric(6,2),
  rx_min             numeric(6,2),
  rx_max             numeric(6,2),
  signal_avg         numeric(6,2),
  signal_min         numeric(6,2),
  offline_minutes    integer not null default 0,
  constraint hourly_unico unique nulls not distinct (equipment_unit_id, device_id, hour)
);

-- Resume y limpia lo más viejo que los días indicados.
create or replace function public.resumir_lecturas(p_dias int default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_corte timestamptz := now() - make_interval(days => p_dias);
  v_filas integer;
begin
  insert into public.device_readings_hourly
    (org_id, device_id, equipment_unit_id, hour, samples,
     rx_avg, rx_min, rx_max, signal_avg, signal_min, offline_minutes)
  select org_id, device_id, equipment_unit_id,
         date_trunc('hour', read_at), count(*),
         round(avg(rx_power_dbm), 2), min(rx_power_dbm), max(rx_power_dbm),
         round(avg(signal_dbm), 2),  min(signal_dbm),
         count(*) filter (where status = 'offline') * 5
    from public.device_readings
   where read_at < v_corte
   group by org_id, device_id, equipment_unit_id, date_trunc('hour', read_at)
  on conflict do nothing;

  get diagnostics v_filas = row_count;

  delete from public.device_readings where read_at < v_corte;
  return v_filas;
end;
$$;

comment on function public.resumir_lecturas is
  'Se corre una vez al día desde el agente local o un cron. Deja el detalle de '
  'los últimos 90 días y convierte lo viejo en promedios por hora.';

-- Particiones para arrancar: el mes actual y los tres siguientes.
do $$
declare i int;
begin
  for i in 0..3 loop
    perform public.crear_particion_lecturas(
      extract(year  from (current_date + make_interval(months => i)))::int,
      extract(month from (current_date + make_interval(months => i)))::int);
  end loop;
end $$;
