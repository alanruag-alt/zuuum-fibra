import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { CajaParaSplitter, SalidaSplitter, Splitter } from '@/modulos/ftth/splitter_tipos';

export async function listarSplitters(): Promise<Splitter[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('v_splitters').select('*').order('code');
  if (error) return [];
  return (data ?? []) as unknown as Splitter[];
}

export async function salidasDe(splitter: string): Promise<SalidaSplitter[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_salidas_splitter')
    .select('*')
    .eq('splitter_id', splitter)
    .order('port_number');
  if (error) return [];
  return (data ?? []) as unknown as SalidaSplitter[];
}

/** Las cajas donde cabe un splitter: empalme, NAP o el ODF del rack. */
export async function cajasParaSplitter(): Promise<CajaParaSplitter[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from('v_elementos_red')
    .select('id, code, element_type, zona')
    .in('element_type', ['closure', 'nap', 'odf'])
    .eq('is_active', true)
    .order('code');

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((e) => ({
    id: e.id as string,
    code: e.code as string,
    tipo: e.element_type as string,
    zona: (e.zona as string) ?? null,
  }));
}
