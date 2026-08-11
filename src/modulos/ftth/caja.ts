import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { CableEnCaja, FusionDeCaja, HiloEnCaja } from '@/modulos/ftth/caja_tipos';

/**
 * La caja por dentro.
 *
 * Todo lo que hace falta para dibujar el interior: qué cables llegan, qué
 * hilos trae cada uno, de dónde vienen y a dónde van. El trabajo real de una
 * caja de empalme es pegar un hilo con otro, y eso se ve.
 */
export async function cablesEnCaja(caja: string): Promise<CableEnCaja[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('cables_en_caja', { p_caja: caja });
  if (error) return [];
  return (data ?? []) as unknown as CableEnCaja[];
}

export async function hilosEnCaja(caja: string): Promise<HiloEnCaja[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('hilos_en_caja', { p_caja: caja });
  if (error) return [];
  return (data ?? []) as unknown as HiloEnCaja[];
}

export async function fusionesDeCaja(caja: string): Promise<FusionDeCaja[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('fusiones_de_caja', { p_caja: caja });
  if (error) return [];
  return (data ?? []) as unknown as FusionDeCaja[];
}

export async function clientesDeCaja(caja: string) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('clientes_de_caja', { p_caja: caja });
  if (error) return [];
  return (data ?? []) as unknown as {
    contrato: string | null;
    cliente: string | null;
    telefono: string | null;
    direccion: string | null;
    nap: string | null;
    puerto: number | null;
    rx_dbm: number | null;
    estado: string | null;
  }[];
}

/** Los splitters y las NAP que viven en esta caja: los otros destinos del hilo. */
export async function destinosEnCaja(caja: string) {
  const supabase = await crearClienteServidor();

  const [{ data: spl }, { data: naps }] = await Promise.all([
    supabase.from('v_splitters').select('id, code, ratio, entrada').eq('housing_id', caja),
    supabase.from('v_naps').select('id, code, feed_strand_id').eq('id', caja),
  ]);

  return {
    splitters: ((spl ?? []) as unknown as Record<string, unknown>[]).map((s) => ({
      id: s.id as string,
      code: s.code as string,
      ratio: (s.ratio as string) ?? null,
      alimentado: !!s.entrada,
    })),
    naps: ((naps ?? []) as unknown as Record<string, unknown>[]).map((n) => ({
      id: n.id as string,
      code: n.code as string,
      alimentado: !!n.feed_strand_id,
    })),
  };
}

/** Las cajas donde se puede entrar a empalmar: de empalme, y las NAP. */
export async function listarCajasDeEmpalme() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_elementos_red')
    .select('id, code, name, element_type, zona, is_active')
    .in('element_type', ['closure', 'nap'])
    .eq('is_active', true)
    .order('code');

  if (error) return [];
  return (data ?? []) as unknown as {
    id: string;
    code: string;
    name: string | null;
    element_type: string;
    zona: string | null;
  }[];
}
