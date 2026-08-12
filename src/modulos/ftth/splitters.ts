import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { SalidaSplitter, Splitter } from '@/modulos/ftth/splitter_tipos';

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
