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

export interface Suelto {
  id: string;
  /** 'equipo' (network_devices) o 'elemento' (network_elements). */
  que: 'equipo' | 'elemento';
  nombre: string;
  tipo: string;
  detalle: string | null;
  activo: boolean;
  alta: string;
}

/**
 * Lo que pertenece a la caseta pero no está en ningún gabinete.
 *
 * Si esto no se enseña, existe y estorba sin que nadie pueda tocarlo: es
 * exactamente lo que pasó al querer borrar SITE PEDRISEÑA.
 */
export async function sueltosDelSitio(sitio: string): Promise<Suelto[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('sueltos_del_sitio', { p_sitio: sitio });
  if (error) return [];
  return (data ?? []) as unknown as Suelto[];
}

export interface EnLaCaseta {
  item_id: string | null;
  ref_id: string;
  que: 'equipo' | 'elemento';
  kind: string;
  label: string;
  vendor: string | null;
  model: string | null;
  serial: string | null;
  mgmt_ip: string | null;
  rack: string | null;
  /** Nulo cuando el equipo pertenece a la caseta pero no está montado. */
  posicion: number | null;
  hasta: number | null;
  estado: string;
  tarjetas: number;
  puertos_pon: number;
  pon_patcheados: number;
  puertos_odf: number;
  odf_libres: number;
}

/**
 * Las OLT y los ODF de una caseta, montados o no.
 *
 * Con `sitio` en nulo devuelve los huérfanos: los que no pertenecen a ninguna
 * caseta. Antes esta pantalla los sacaba de `rack_items` —o sea, solo lo
 * montado— y todo lo demás quedaba invisible aunque siguiera contando para
 * las validaciones.
 */
export async function equiposDeLaCaseta(sitio: string | null): Promise<EnLaCaseta[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('equipos_de_la_caseta', { p_sitio: sitio });
  if (error) return [];
  return (data ?? []) as unknown as EnLaCaseta[];
}

/** Lo que existe pero no pertenece a ninguna caseta. */
export async function sinCaseta(): Promise<Suelto[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('sin_caseta');
  if (error) return [];
  return (data ?? []) as unknown as Suelto[];
}
