import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';

/** Un servicio al que le tocaría el corte del día 11. */
export interface PorCortar {
  service_id: string;
  customer_code: string;
  cliente: string;
  zona: string;
  adeudo: number;
  suspendido: boolean;
}

export interface AdeudoMenor {
  customer_id: string;
  customer_code: string;
  full_name: string;
  zona: string;
  vencido: number;
  dias_vencido: number | null;
}

/**
 * Simula el corte: devuelve la lista sin tocar nada.
 *
 * Si el periodo todavía no llega a su día de corte, la base contesta con un
 * error a propósito. Aquí eso no es una falla: es la respuesta correcta, y se
 * devuelve como aviso en vez de tumbar la pantalla.
 */
export async function simularCorte(
  periodoId: string,
): Promise<{ lista: PorCortar[]; aviso: string | null }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('suspender_vencidos', {
    p_period: periodoId,
    p_simular: true,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('todavía no llega') || m.includes('todavia no llega')) {
      return { lista: [], aviso: 'Todavía no llega el día de corte de este mes.' };
    }
    if (m.includes('no tienes permiso')) {
      return { lista: [], aviso: 'No tienes permiso para suspender servicios.' };
    }
    return { lista: [], aviso: error.message };
  }

  const lista = ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    service_id: f.service_id as string,
    customer_code: f.customer_code as string,
    cliente: f.cliente as string,
    zona: f.zona as string,
    adeudo: Number(f.adeudo ?? 0),
    suspendido: Boolean(f.suspendido),
  }));

  return { lista, aviso: null };
}

/** Los que deben tan poco que no vale la pena cortarlos. */
export async function adeudosMenores(): Promise<AdeudoMenor[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_adeudos_menores')
    .select('customer_id, customer_code, full_name, zona, vencido, dias_vencido')
    .order('vencido', { ascending: false });

  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    customer_id: f.customer_id as string,
    customer_code: f.customer_code as string,
    full_name: f.full_name as string,
    zona: (f.zona as string) ?? '—',
    vencido: Number(f.vencido ?? 0),
    dias_vencido: f.dias_vencido === null ? null : Number(f.dias_vencido),
  }));
}
