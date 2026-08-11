import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';

/**
 * El sitio por dentro.
 *
 * Todo lo que vive en la caseta: la OLT con sus tarjetas, cada puerto PON, y
 * el ODF con sus bandejas. Es la parte de la red que uno ve parado adentro,
 * y hasta ahora era la única que el sistema no sabía.
 */
export interface SitioRed {
  id: string;
  name: string;
  type: string;
  zona: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  olts: number;
  tarjetas: number;
  puertos_pon: number;
  pon_patcheados: number;
  odfs: number;
  puertos_odf: number;
  odf_libres: number;
}

export interface Tarjeta {
  id: string;
  device_id: string;
  olt: string;
  vendor: string | null;
  model: string | null;
  sitio: string | null;
  slot_number: number;
  card_type: string | null;
  port_count: number;
  status: string;
  puertos: number;
  patcheados: number;
}

export interface PuertoPon {
  id: string;
  card_id: string;
  olt: string;
  site_id: string | null;
  sitio: string | null;
  slot_number: number;
  port_number: number;
  etiqueta: string;
  max_onus: number;
  used_onus: number;
  status: string;
  odf_port_id: string | null;
  odf: string | null;
  tray_number: number | null;
  odf_port_number: number | null;
  cable: string | null;
  strand_number: number | null;
  color_hilo: string | null;
}

export interface PuertoOdf {
  id: string;
  odf_id: string;
  odf: string;
  site_id: string | null;
  sitio: string | null;
  tray_number: number;
  port_number: number;
  connector: string | null;
  status: string;
  power_dbm: number | null;
  notes: string | null;
  installed_at: string | null;
  pon_port_id: string | null;
  olt: string | null;
  pon: string | null;
  out_strand_id: string | null;
  cable: string | null;
  strand_number: number | null;
  color_hilo: string | null;
  /** La etiqueta del latiguillo que va de la OLT a este puerto. */
  jumper_code: string | null;
  responsable: string | null;
}

export async function listarSitiosRed(): Promise<SitioRed[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('v_sitio_red').select('*').order('name');
  if (error) return [];
  return (data ?? []) as unknown as SitioRed[];
}

export async function listarTarjetas(sitio?: string): Promise<Tarjeta[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_tarjetas')
    .select('*')
    .order('olt')
    .order('slot_number');
  if (error) return [];
  const filas = (data ?? []) as unknown as Tarjeta[];
  return sitio ? filas.filter((t) => t.sitio) : filas;
}

export async function listarPuertosPon(): Promise<PuertoPon[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_puertos_pon')
    .select('*')
    .order('olt')
    .order('slot_number')
    .order('port_number');
  if (error) return [];
  return (data ?? []) as unknown as PuertoPon[];
}

export async function listarPuertosOdf(): Promise<PuertoOdf[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_puertos_odf')
    .select('*')
    .order('odf')
    .order('tray_number')
    .order('port_number');
  if (error) return [];
  return (data ?? []) as unknown as PuertoOdf[];
}

/** Los hilos que todavía no tienen de dónde salir, para el desplegable. */
export async function hilosSinOrigen(): Promise<{ id: string; etiqueta: string; cable: string }[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from('v_hilos')
    .select('id, cable, strand_number, color, status')
    .in('status', ['disponible', 'reservado'])
    .order('cable')
    .order('strand_number')
    .limit(600);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((h) => ({
    id: h.id as string,
    cable: h.cable as string,
    etiqueta: `${h.cable} · hilo ${h.strand_number} (${h.color})`,
  }));
}
