import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Caja, Persona, ResumenCaja } from '@/modulos/caja/tipos';

/**
 * Las RLS deciden qué cajas ve cada quien: el cobrador la suya, la oficina
 * todas las de sus zonas. Aquí no se filtra a mano.
 */

export async function listarCajas(limite = 30): Promise<Caja[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_corte_caja')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(limite);

  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(aCaja);
}

/** La caja abierta de quien está viendo la pantalla, si trae una. */
export async function miCajaAbierta(): Promise<Caja | null> {
  const supabase = await crearClienteServidor();
  const { data: sesion } = await supabase.auth.getUser();
  const yo = sesion?.user?.id;
  if (!yo) return null;

  const { data, error } = await supabase
    .from('v_corte_caja')
    .select('*')
    .eq('collector_id', yo)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return aCaja(data as Record<string, unknown>);
}

export async function resumenCaja(): Promise<ResumenCaja> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_corte_caja')
    .select('status, efectivo_esperado, diferencia, closed_at');

  if (error) return { abiertas: 0, porVerificar: 0, efectivoEnCalle: 0, diferenciasDelDia: 0 };

  const filas = (data ?? []) as {
    status: string;
    efectivo_esperado: number | null;
    diferencia: number | null;
    closed_at: string | null;
  }[];

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return {
    abiertas: filas.filter((c) => c.status === 'open').length,
    porVerificar: filas.filter((c) => c.status === 'delivered').length,
    // Lo que anda cobrado pero todavía no entregado. Es el número que importa
    // a media tarde: cuánto dinero de la empresa está en la calle.
    efectivoEnCalle: filas
      .filter((c) => c.status === 'open' || c.status === 'closed')
      .reduce((s, c) => s + Number(c.efectivo_esperado ?? 0), 0),
    diferenciasDelDia: filas
      .filter((c) => c.closed_at && new Date(c.closed_at) >= hoy)
      .reduce((s, c) => s + Number(c.diferencia ?? 0), 0),
  };
}

/** A quién se le puede entregar la caja. */
export async function personasParaEntregar(): Promise<Persona[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name');

  if (error) return [];
  return (data ?? []) as Persona[];
}

function aCaja(f: Record<string, unknown>): Caja {
  return {
    id: f.id as string,
    collector_id: f.collector_id as string,
    cobrador: (f.cobrador as string) ?? '—',
    zone_id: (f.zone_id as string) ?? null,
    zona: (f.zona as string) ?? null,
    opened_at: f.opened_at as string,
    closed_at: (f.closed_at as string) ?? null,
    status: f.status as string,
    pagos: Number(f.pagos ?? 0),
    efectivo_esperado: Number(f.efectivo_esperado ?? 0),
    transferencias: Number(f.transferencias ?? 0),
    efectivo_declarado: f.efectivo_declarado === null ? null : Number(f.efectivo_declarado),
    diferencia: f.diferencia === null ? null : Number(f.diferencia),
  };
}
