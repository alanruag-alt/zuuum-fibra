import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';

export interface ResumenTablero {
  clientesTotal: number;
  clientesActivos: number;
  morosos: number;
  suspendidos: number;
  sinPrecio: number;
  mensualidad: number;
  zonas: number;
  hayDatos: boolean;
}

export interface FilaZona {
  id: string;
  nombre: string;
  clientes: number;
  mensualidad: number;
  morosos: number;
}

export interface FilaPeriodo {
  periodo: string;
  cargos: number;
  pagados: number;
  esperado: number;
  cobrado: number;
}

/**
 * Todo sale de la base con las políticas RLS puestas: cada quien ve lo suyo.
 * Si algo falla —por ejemplo un técnico que no tiene permiso de cobranza—
 * se devuelve vacío en lugar de tumbar la pantalla.
 */
export async function resumenTablero(): Promise<ResumenTablero> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_clientes')
    .select('status, mensualidad, price_review_needed, zone_id');

  if (error) {
    return {
      clientesTotal: 0,
      clientesActivos: 0,
      morosos: 0,
      suspendidos: 0,
      sinPrecio: 0,
      mensualidad: 0,
      zonas: 0,
      hayDatos: false,
    };
  }

  const filas = (data ?? []) as {
    status: string;
    mensualidad: number | null;
    price_review_needed: boolean;
    zone_id: string;
  }[];

  return {
    clientesTotal: filas.length,
    clientesActivos: filas.filter((c) => c.status === 'active').length,
    morosos: filas.filter((c) => c.status === 'overdue').length,
    suspendidos: filas.filter((c) => c.status === 'suspended').length,
    sinPrecio: filas.filter((c) => c.price_review_needed).length,
    mensualidad: filas
      .filter((c) => c.status === 'active')
      .reduce((s, c) => s + Number(c.mensualidad ?? 0), 0),
    zonas: new Set(filas.map((c) => c.zone_id)).size,
    hayDatos: filas.length > 0,
  };
}

export async function clientesPorZona(): Promise<FilaZona[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_clientes')
    .select('zone_id, zona, status, mensualidad');
  if (error) return [];

  const filas = (data ?? []) as {
    zone_id: string;
    zona: string;
    status: string;
    mensualidad: number | null;
  }[];

  const mapa = new Map<string, FilaZona>();
  for (const f of filas) {
    const z = mapa.get(f.zone_id) ?? {
      id: f.zone_id,
      nombre: f.zona,
      clientes: 0,
      mensualidad: 0,
      morosos: 0,
    };
    z.clientes += 1;
    if (f.status === 'active') z.mensualidad += Number(f.mensualidad ?? 0);
    if (f.status === 'overdue' || f.status === 'suspended') z.morosos += 1;
    mapa.set(f.zone_id, z);
  }
  return [...mapa.values()].sort((a, b) => b.clientes - a.clientes);
}

export async function cobranzaPorPeriodo(limite = 8): Promise<FilaPeriodo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_cobranza_zona')
    .select('periodo, cargos, pagados, esperado, cobrado');
  // Sin permiso de cobranza esto viene vacío, y está bien.
  if (error) return [];

  const filas = (data ?? []) as {
    periodo: string | null;
    cargos: number;
    pagados: number;
    esperado: number;
    cobrado: number;
  }[];

  const mapa = new Map<string, FilaPeriodo>();
  for (const f of filas) {
    if (!f.periodo) continue;
    const p = mapa.get(f.periodo) ?? {
      periodo: f.periodo,
      cargos: 0,
      pagados: 0,
      esperado: 0,
      cobrado: 0,
    };
    p.cargos += Number(f.cargos ?? 0);
    p.pagados += Number(f.pagados ?? 0);
    p.esperado += Number(f.esperado ?? 0);
    p.cobrado += Number(f.cobrado ?? 0);
    mapa.set(f.periodo, p);
  }
  return [...mapa.values()].sort((a, b) => (a.periodo < b.periodo ? 1 : -1)).slice(0, limite);
}
