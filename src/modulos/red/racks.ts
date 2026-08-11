import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';

/**
 * El gabinete.
 *
 * Un sitio deja de ser una lista de equipos y pasa a ser lo que es: uno o
 * varios racks con sus unidades, y cada equipo ocupando las U que ocupa.
 * Sirve para saber si cabe la siguiente tarjeta antes de comprarla, y para
 * encontrar el equipo a las dos de la mañana sin abrir todas las puertas.
 */
export interface Rack {
  id: string;
  site_id: string;
  sitio: string;
  zona: string | null;
  name: string;
  units: number;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  equipos: number;
  ocupadas: number;
  libres: number;
}

export interface EquipoRack {
  id: string;
  rack_id: string;
  rack: string;
  rack_units: number;
  site_id: string;
  device_id: string | null;
  element_id: string | null;
  kind: string;
  label: string;
  vendor: string | null;
  model: string | null;
  serial: string | null;
  position: number;
  height: number;
  hasta: number;
  status: string;
  mgmt_ip: string | null;
  installed_at: string | null;
  responsable: string | null;
  notes: string | null;
  tarjetas: number;
  puertos_pon: number;
  pon_patcheados: number;
  puertos_odf: number;
  odf_libres: number;
}

export async function listarRacks(): Promise<Rack[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('v_racks').select('*').order('sitio').order('name');
  if (error) return [];
  return (data ?? []) as unknown as Rack[];
}

export async function listarEquiposRack(): Promise<EquipoRack[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_rack_items')
    .select('*')
    .order('rack')
    .order('position', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as EquipoRack[];
}

export interface SitioConRack {
  id: string;
  name: string;
  site_type: string;
  zone_id: string | null;
  zona: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  racks: number;
  unidades: number;
  ocupadas: number;
  olts: number;
  odfs: number;
  tarjetas: number;
  puertos_pon: number;
  pon_patcheados: number;
  puertos_odf: number;
  odf_libres: number;
}

/** Cada comunidad con su gabinete, para el selector de arriba. */
export async function listarSitiosConRack(): Promise<SitioConRack[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('v_sitios_con_rack').select('*').order('name');
  if (error) return [];
  return (data ?? []) as unknown as SitioConRack[];
}
