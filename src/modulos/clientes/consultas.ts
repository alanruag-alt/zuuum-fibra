import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type {
  CargoCliente,
  ClienteResumen,
  FiltrosPadron,
  ResumenPadron,
  ServicioCliente,
  Zona,
} from '@/modulos/clientes/tipos';

export const POR_PAGINA = 50;

/**
 * Las consultas van contra la vista `v_clientes`, que ya trae la zona,
 * la mensualidad y el adeudo calculados.
 *
 * No hace falta filtrar por zona a mano: las políticas RLS de la base solo
 * devuelven los clientes que esta persona puede ver. Si un cobrador de
 * Velardeña abre esta pantalla, la base le manda 207 renglones, no 1,102.
 */

export async function listarClientes(f: FiltrosPadron): Promise<{
  clientes: ClienteResumen[];
  total: number;
}> {
  const supabase = await crearClienteServidor();
  const pagina = Math.max(1, f.pagina ?? 1);
  const desde = (pagina - 1) * POR_PAGINA;

  let q = supabase
    .from('v_clientes')
    .select('*', { count: 'exact' })
    .order('customer_code', { ascending: true })
    .range(desde, desde + POR_PAGINA - 1);

  if (f.buscar?.trim()) {
    const t = f.buscar.trim();
    // Busca por nombre, folio o teléfono a la vez.
    q = q.or(`full_name.ilike.%${t}%,customer_code.ilike.%${t}%,phone.ilike.%${t}%`);
  }
  if (f.zona) q = q.eq('zone_id', f.zona);
  if (f.estado) q = q.eq('status', f.estado);
  if (f.revisar === '1') q = q.eq('price_review_needed', true);

  const { data, count, error } = await q;
  if (error) throw new Error(`No se pudo leer el padrón: ${error.message}`);

  return { clientes: (data ?? []) as ClienteResumen[], total: count ?? 0 };
}

export async function resumenPadron(): Promise<ResumenPadron> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_clientes')
    .select('status, mensualidad, price_review_needed');

  if (error) throw new Error(`No se pudo leer el resumen: ${error.message}`);

  const filas = (data ?? []) as {
    status: string;
    mensualidad: number | null;
    price_review_needed: boolean;
  }[];

  return {
    total: filas.length,
    activos: filas.filter((c) => c.status === 'active').length,
    morosos: filas.filter((c) => c.status === 'overdue').length,
    suspendidos: filas.filter((c) => c.status === 'suspended').length,
    sinPrecio: filas.filter((c) => c.price_review_needed).length,
    mensualidad: filas
      .filter((c) => c.status === 'active')
      .reduce((s, c) => s + Number(c.mensualidad ?? 0), 0),
  };
}

export async function listarZonas(): Promise<Zona[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('zones').select('id, name, code').order('name');
  if (error) throw new Error(`No se pudieron leer las zonas: ${error.message}`);
  return (data ?? []) as Zona[];
}

export async function obtenerCliente(id: string): Promise<ClienteResumen | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('v_clientes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`No se pudo leer el cliente: ${error.message}`);
  return (data as ClienteResumen) ?? null;
}

export async function serviciosDelCliente(id: string): Promise<ServicioCliente[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('customer_services')
    .select(
      'id, network_type, status, custom_price, ip_address, wifi_ssid, activated_at, plan:service_plans(name, price, download_mbps)',
    )
    .eq('customer_id', id)
    .order('activated_at', { ascending: false });

  if (error) throw new Error(`No se pudieron leer los servicios: ${error.message}`);

  // Supabase devuelve la relación como arreglo cuando no puede probar que es única.
  return ((data ?? []) as unknown[]).map((fila) => {
    const f = fila as Record<string, unknown>;
    const plan = Array.isArray(f.plan) ? f.plan[0] : f.plan;
    return { ...f, plan: plan ?? null } as ServicioCliente;
  });
}

export async function cargosDelCliente(id: string, limite = 24): Promise<CargoCliente[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('charges')
    .select(
      'id, type, description, amount, balance, status, due_date, periodo:billing_periods(label)',
    )
    .eq('customer_id', id)
    .order('due_date', { ascending: false })
    .limit(limite);

  // Un técnico no tiene permiso de ver cargos: la base responde vacío o niega.
  // No es un error que deba tumbar la pantalla.
  if (error) return [];

  return ((data ?? []) as unknown[]).map((fila) => {
    const f = fila as Record<string, unknown>;
    const p = Array.isArray(f.periodo) ? f.periodo[0] : f.periodo;
    return { ...f, periodo: (p as { label?: string })?.label ?? null } as CargoCliente;
  });
}
