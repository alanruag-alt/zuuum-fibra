import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type {
  CobranzaZona,
  FiltrosMorosos,
  Moroso,
  PagoRegistrado,
  PeriodoCobranza,
  ResumenCobranza,
} from '@/modulos/cobranza/tipos';

export const POR_PAGINA = 50;

/**
 * Igual que en clientes: aquí no se filtra por zona a mano.
 *
 * Las políticas RLS ya hacen que un cobrador de Velardeña vea solo sus morosos
 * y solo sus pagos. Si algún día alguien quita ese filtro de la interfaz por
 * error, la base sigue sin enseñarle lo que no le toca.
 */

export async function listarMorosos(f: FiltrosMorosos): Promise<{
  morosos: Moroso[];
  total: number;
}> {
  const supabase = await crearClienteServidor();
  const pagina = Math.max(1, f.pagina ?? 1);
  const desde = (pagina - 1) * POR_PAGINA;

  let q = supabase
    .from('v_morosos')
    .select('*', { count: 'exact' })
    .order('dias_vencido', { ascending: false })
    .range(desde, desde + POR_PAGINA - 1);

  if (f.buscar?.trim()) {
    const t = f.buscar.trim();
    q = q.or(`full_name.ilike.%${t}%,customer_code.ilike.%${t}%,phone.ilike.%${t}%`);
  }
  if (f.zona) q = q.eq('zone_id', f.zona);
  if (f.dias) q = q.gte('dias_vencido', Number(f.dias));

  const { data, count, error } = await q;
  if (error) throw new Error(`No se pudo leer la lista de morosos: ${error.message}`);

  return { morosos: (data ?? []) as Moroso[], total: count ?? 0 };
}

export async function resumenCobranza(): Promise<ResumenCobranza> {
  const supabase = await crearClienteServidor();

  const [{ data: morosos }, { data: pagos }] = await Promise.all([
    supabase.from('v_morosos').select('adeudo, dias_vencido'),
    supabase
      .from('payments')
      .select('amount, status, paid_at')
      .eq('status', 'applied')
      .gte('paid_at', inicioDeHoy()),
  ]);

  const filas = (morosos ?? []) as { adeudo: number | null; dias_vencido: number | null }[];
  const hoy = (pagos ?? []) as { amount: number | null }[];

  return {
    morosos: filas.length,
    adeudoTotal: filas.reduce((s, m) => s + Number(m.adeudo ?? 0), 0),
    masDe30Dias: filas.filter((m) => (m.dias_vencido ?? 0) > 30).length,
    cobradoHoy: hoy.reduce((s, p) => s + Number(p.amount ?? 0), 0),
    pagosHoy: hoy.length,
  };
}

export async function cobranzaPorZona(periodoId?: string): Promise<CobranzaZona[]> {
  const supabase = await crearClienteServidor();
  let q = supabase.from('v_cobranza_zona').select('*').order('zona');
  if (periodoId) q = q.eq('period_id', periodoId);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as CobranzaZona[];
}

export async function listarPeriodos(limite = 12): Promise<PeriodoCobranza[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('billing_periods')
    .select('id, year, month, label, due_date, grace_end_date, cutoff_date, status, generated_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(limite);

  if (error) return [];
  return (data ?? []) as PeriodoCobranza[];
}

export async function ultimosPagos(limite = 25): Promise<PagoRegistrado[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, receipt_number, amount, method, paid_at, status, reference, ' +
        'cliente:customers(full_name, customer_code), zona:zones(name), recibio:profiles(full_name)',
    )
    .order('paid_at', { ascending: false })
    .limit(limite);

  if (error) return [];

  return ((data ?? []) as unknown[]).map((fila) => {
    const f = fila as Record<string, unknown>;
    const uno = <T>(v: unknown): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : ((v as T) ?? null);

    const cliente = uno<{ full_name?: string; customer_code?: string }>(f.cliente);
    const zona = uno<{ name?: string }>(f.zona);
    const recibio = uno<{ full_name?: string }>(f.recibio);

    return {
      id: f.id as string,
      receipt_number: f.receipt_number as string,
      amount: Number(f.amount ?? 0),
      method: f.method as string,
      paid_at: f.paid_at as string,
      status: f.status as string,
      reference: (f.reference as string) ?? null,
      cliente: cliente?.full_name ?? null,
      customer_code: cliente?.customer_code ?? null,
      zona: zona?.name ?? null,
      recibio: recibio?.full_name ?? null,
    } satisfies PagoRegistrado;
  });
}

export async function pagosDelCliente(id: string, limite = 24): Promise<PagoRegistrado[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('payments')
    .select('id, receipt_number, amount, method, paid_at, status, reference')
    .eq('customer_id', id)
    .order('paid_at', { ascending: false })
    .limit(limite);

  // Un técnico no ve dinero. Vacío, no error.
  if (error) return [];

  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    id: f.id as string,
    receipt_number: f.receipt_number as string,
    amount: Number(f.amount ?? 0),
    method: f.method as string,
    paid_at: f.paid_at as string,
    status: f.status as string,
    reference: (f.reference as string) ?? null,
    cliente: null,
    customer_code: null,
    zona: null,
    recibio: null,
  }));
}

/** Cuántos servicios activos hay: es a cuántos les va a llegar el cargo del mes. */
export async function serviciosActivos(): Promise<number> {
  const supabase = await crearClienteServidor();
  const { count, error } = await supabase
    .from('customer_services')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) return 0;
  return count ?? 0;
}

/** Medianoche de hoy, en formato que entiende PostgREST. */
function inicioDeHoy(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
