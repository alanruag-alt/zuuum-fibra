import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Cable, Fusion, Hilo, Impacto, PuertoNap, Salto } from '@/modulos/ftth/tipos';

export async function listarCables(): Promise<Cable[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_cables')
    .select('*')
    .order('is_active', { ascending: false })
    .order('code');

  if (error) return [];
  return (data ?? []) as Cable[];
}

export async function hilosDe(cableId: string): Promise<Hilo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_hilos')
    .select('*')
    .eq('cable_id', cableId)
    .order('strand_number');

  if (error) return [];
  return (data ?? []) as Hilo[];
}

/**
 * Todos los hilos, para poder elegirlos al capturar una fusión.
 *
 * Se traen los disponibles y los ya fusionados: los segundos hacen falta para
 * corregir una captura, y esconderlos obligaría a borrar para poder arreglar.
 */
export async function hilosParaFusionar(): Promise<Hilo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_hilos')
    .select('*')
    .in('status', ['disponible', 'fusionado', 'reservado'])
    .order('cable')
    .order('strand_number')
    .limit(3000);

  if (error) return [];
  return (data ?? []) as Hilo[];
}

export async function listarFusiones(cajaId?: string): Promise<Fusion[]> {
  const supabase = await crearClienteServidor();
  let q = supabase.from('v_fusiones').select('*').order('caja').order('hilo_entra');
  if (cajaId) q = q.eq('closure_id', cajaId);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Fusion[];
}

export async function puertosDe(napId: string): Promise<PuertoNap[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_puertos_nap')
    .select('*')
    .eq('element_id', napId)
    .order('port_number');

  if (error) return [];
  return (data ?? []) as PuertoNap[];
}

export async function todosLosPuertos(): Promise<PuertoNap[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_puertos_nap')
    .select('*')
    .order('nap')
    .order('port_number')
    .limit(2000);

  if (error) return [];
  return (data ?? []) as PuertoNap[];
}

export async function impactoDeCorte(): Promise<Impacto[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_impacto_corte')
    .select('*')
    .order('clientes_afectados', { ascending: false });

  if (error) return [];
  return (data ?? []) as Impacto[];
}

export async function trazarHilo(hiloId: string): Promise<Salto[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('trazar_hilo', { p_hilo: hiloId });
  if (error) return [];
  return (data ?? []) as Salto[];
}

export async function trazarCliente(
  clienteId: string,
): Promise<{ saltos: Salto[]; error: string | null }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('trazar_cliente', { p_cliente: clienteId });
  if (error) return { saltos: [], error: error.message };
  return { saltos: (data ?? []) as Salto[], error: null };
}

/** Las cajas de empalme y splitters, que es donde viven las fusiones. */
export async function listarCajas() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_elementos_red')
    .select('*')
    .in('element_type', ['closure', 'splitter', 'odf'])
    .order('code');

  if (error) return [];
  return data ?? [];
}

export async function listarNaps() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_elementos_red')
    .select('*')
    .eq('element_type', 'nap')
    .order('code');

  if (error) return [];
  return data ?? [];
}
