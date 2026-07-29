import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';

export interface Recibo {
  id: string;
  receipt_number: string;
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string;
  status: string;
  notes: string | null;
  cliente: string;
  customer_code: string;
  telefono: string | null;
  zona: string;
  recibio: string;
  aplicaciones: { concepto: string; periodo: string | null; monto: number }[];
  saldo_a_favor: number;
}

export interface MesCobrado {
  periodo: string;
  year: number;
  month: number;
  esperado: number;
  cobrado: number;
  cargos: number;
  pagados: number;
}

export interface IngresoZona {
  zona: string;
  clientes: number;
  activos: number;
  mensualidad: number;
  adeudo: number;
}

export interface CausaFalla {
  causa: string;
  cuantos: number;
  horas_promedio: number;
}

/** Un recibo completo, con el desglose de a qué se aplicó el dinero. */
export async function obtenerRecibo(pagoId: string): Promise<Recibo | null> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, receipt_number, amount, method, reference, paid_at, status, notes, ' +
        'cliente:customers(full_name, customer_code, phone), zona:zones(name), recibio:profiles(full_name)',
    )
    .eq('id', pagoId)
    .maybeSingle();

  if (error || !data) return null;

  const f = data as unknown as Record<string, unknown>;
  const uno = <T>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : ((v as T) ?? null));
  const cli = uno<{ full_name?: string; customer_code?: string; phone?: string }>(f.cliente);

  const { data: apps } = await supabase
    .from('payment_allocations')
    .select('amount, charges(type, description, billing_periods(label))')
    .eq('payment_id', pagoId);

  // El tipo que infiere Supabase para una relación anidada de dos niveles no
  // le cuadra a TypeScript, así que se pasa por `unknown` a propósito y se lee
  // a mano. Lo que importa lo valida la base, no el tipo de aquí.
  const aplicaciones = ((apps ?? []) as unknown as Record<string, unknown>[]).map((a) => {
    const ch = uno<Record<string, unknown>>(a.charges);
    const per = uno<{ label?: string }>(ch?.billing_periods);
    return {
      concepto: (ch?.description as string) ?? CONCEPTO[(ch?.type as string) ?? ''] ?? 'Cargo',
      periodo: per?.label ?? null,
      monto: Number(a.amount ?? 0),
    };
  });

  const total = Number(f.amount ?? 0);
  const aplicado = aplicaciones.reduce((s, a) => s + a.monto, 0);

  return {
    id: f.id as string,
    receipt_number: f.receipt_number as string,
    amount: total,
    method: f.method as string,
    reference: (f.reference as string) ?? null,
    paid_at: f.paid_at as string,
    status: f.status as string,
    notes: (f.notes as string) ?? null,
    cliente: cli?.full_name ?? '—',
    customer_code: cli?.customer_code ?? '—',
    telefono: cli?.phone ?? null,
    zona: uno<{ name?: string }>(f.zona)?.name ?? '—',
    recibio: uno<{ full_name?: string }>(f.recibio)?.full_name ?? '—',
    aplicaciones,
    saldo_a_favor: total - aplicado,
  };
}

const CONCEPTO: Record<string, string> = {
  monthly: 'Mensualidad',
  reconnection: 'Reconexión',
  installation: 'Instalación',
  equipment_loss: 'Equipo no devuelto',
  other: 'Otro',
};

/** Cómo se cobró cada mes: lo esperado contra lo que de verdad entró. */
export async function cobranzaPorMes(meses = 12): Promise<MesCobrado[]> {
  const supabase = await crearClienteServidor();

  const { data: periodos } = await supabase
    .from('billing_periods')
    .select('id, label, year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(meses);

  const lista = (periodos ?? []) as { id: string; label: string; year: number; month: number }[];
  if (lista.length === 0) return [];

  const { data: cargos } = await supabase
    .from('charges')
    .select('period_id, amount, balance, status')
    .in(
      'period_id',
      lista.map((p) => p.id),
    );

  const filas = (cargos ?? []) as {
    period_id: string;
    amount: number;
    balance: number;
    status: string;
  }[];

  return lista
    .map((p) => {
      const mios = filas.filter((c) => c.period_id === p.id);
      const esperado = mios.reduce((s, c) => s + Number(c.amount ?? 0), 0);
      const pendiente = mios.reduce((s, c) => s + Number(c.balance ?? 0), 0);
      return {
        periodo: p.label,
        year: p.year,
        month: p.month,
        esperado,
        // Lo cobrado es lo esperado menos lo que sigue debiéndose. Sale de los
        // saldos, no de sumar pagos: así los cargos cancelados no inflan el número.
        cobrado: esperado - pendiente,
        cargos: mios.length,
        pagados: mios.filter((c) => c.status === 'paid').length,
      };
    })
    .reverse();
}

export async function ingresoPorZona(): Promise<IngresoZona[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_clientes')
    .select('zona, status, mensualidad, adeudo');

  if (error) return [];

  const filas = (data ?? []) as {
    zona: string;
    status: string;
    mensualidad: number | null;
    adeudo: number | null;
  }[];

  const mapa = new Map<string, IngresoZona>();
  for (const c of filas) {
    const z = mapa.get(c.zona) ?? {
      zona: c.zona,
      clientes: 0,
      activos: 0,
      mensualidad: 0,
      adeudo: 0,
    };
    z.clientes += 1;
    if (c.status === 'active') {
      z.activos += 1;
      z.mensualidad += Number(c.mensualidad ?? 0);
    }
    z.adeudo += Number(c.adeudo ?? 0);
    mapa.set(c.zona, z);
  }

  return [...mapa.values()].sort((a, b) => b.mensualidad - a.mensualidad);
}

/** Por qué se cae la red. Es lo que dice dónde invertir. */
export async function causasDeFalla(): Promise<CausaFalla[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_tickets')
    .select('root_cause, horas_abierto')
    .not('root_cause', 'is', null);

  if (error) return [];

  const filas = (data ?? []) as { root_cause: string; horas_abierto: number }[];
  const mapa = new Map<string, { n: number; horas: number }>();

  for (const t of filas) {
    const v = mapa.get(t.root_cause) ?? { n: 0, horas: 0 };
    v.n += 1;
    v.horas += Number(t.horas_abierto ?? 0);
    mapa.set(t.root_cause, v);
  }

  return [...mapa.entries()]
    .map(([causa, v]) => ({
      causa,
      cuantos: v.n,
      horas_promedio: Math.round(v.horas / v.n),
    }))
    .sort((a, b) => b.cuantos - a.cuantos);
}
