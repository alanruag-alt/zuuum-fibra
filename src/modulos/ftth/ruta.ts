import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';

/** Un renglón de la ruta: qué es, cómo se llama y qué hay que saber de él. */
export interface PasoRuta {
  paso: number;
  que: string;
  nombre: string;
  detalle: string | null;
  ref_id: string | null;
}

/**
 * Cómo se dibuja cada paso.
 *
 * El icono y el color no son adorno: cuando alguien mira esta pantalla está
 * buscando dónde se rompe la cadena, y el renglón amarillo de «pendiente» es
 * justo lo que tiene que saltar a la vista.
 */
export const PASO: Record<string, { titulo: string; icono: string; tono: string }> = {
  sitio: { titulo: 'Sitio', icono: '🏢', tono: 'marca' },
  olt: { titulo: 'OLT', icono: '🗄️', tono: 'marca' },
  pon: { titulo: 'Puerto PON', icono: '🔌', tono: 'marca' },
  odf: { titulo: 'ODF', icono: '🧷', tono: 'neutro' },
  hilo: { titulo: 'Hilo de fibra', icono: '🧵', tono: 'neutro' },
  caja: { titulo: 'Caja de empalme', icono: '📦', tono: 'neutro' },
  splitter: { titulo: 'Splitter', icono: '🔱', tono: 'neutro' },
  salida: { titulo: 'Salida del splitter', icono: '↳', tono: 'neutro' },
  nap: { titulo: 'NAP', icono: '📡', tono: 'ok' },
  puerto_nap: { titulo: 'Puerto', icono: '🔟', tono: 'ok' },
  cliente: { titulo: 'Cliente', icono: '🏠', tono: 'ok' },
  pendiente: { titulo: 'Falta capturar', icono: '⚠️', tono: 'aviso' },
};

export async function rutaDeServicio(servicio: string): Promise<PasoRuta[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('ruta_de_servicio', { p_servicio: servicio });
  if (error) return [];
  return (data ?? []) as unknown as PasoRuta[];
}

export async function rutaDeCliente(cliente: string): Promise<PasoRuta[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('ruta_de_cliente', { p_cliente: cliente });
  if (error) return [];
  return (data ?? []) as unknown as PasoRuta[];
}

export interface ClienteDePon {
  cliente: string;
  codigo: string | null;
  nap: string;
  puerto: number;
  servicio_id: string;
}

export async function clientesDePon(pon: string): Promise<ClienteDePon[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('clientes_de_pon', { p_pon: pon });
  if (error) return [];
  return (data ?? []) as unknown as ClienteDePon[];
}

/** Para el buscador: clientes con servicio, con lo mínimo para elegir uno. */
export async function clientesParaRuta(
  busqueda: string,
): Promise<{ id: string; nombre: string; codigo: string | null; zona: string | null }[]> {
  if (busqueda.trim().length < 2) return [];

  const supabase = await crearClienteServidor();
  const q = `%${busqueda.trim()}%`;
  const { data } = await supabase
    .from('v_clientes')
    .select('id, full_name, customer_code, zona')
    .or(`full_name.ilike.${q},customer_code.ilike.${q}`)
    .limit(20);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((c) => ({
    id: c.id as string,
    nombre: c.full_name as string,
    codigo: (c.customer_code as string) ?? null,
    zona: (c.zona as string) ?? null,
  }));
}
