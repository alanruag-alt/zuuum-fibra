export interface ElementoRed {
  id: string;
  element_type: string;
  code: string;
  name: string | null;
  zone_id: string | null;
  zona: string | null;
  parent_element_id: string | null;
  capacity: number | null;
  used_ports: number;
  latitude: number | null;
  longitude: number | null;
  split_ratio: string | null;
  notes: string | null;
  is_active: boolean;
  servicios: number;
  ocupacion_pct: number | null;
  semaforo: 'lleno' | 'por_llenarse' | 'con_lugar' | 'sin_capacidad';
}

export interface Dispositivo {
  id: string;
  name: string;
  device_type: string;
  status: string;
  mgmt_ip: string | null;
  vendor: string | null;
  model: string | null;
  is_active: boolean;
  zone_id: string | null;
  zona: string | null;
  sitio: string | null;
  tarjetas: number;
  onus: number;
  cupo_onus: number;
}

export interface Sitio {
  id: string;
  name: string;
  type: string;
  zone_id: string | null;
  zona: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation_m: number | null;
  height_m: number | null;
  access_notes: string | null;
  is_active: boolean;
  dispositivos: number;
  caidos: number;
}

/** Un punto cualquiera para el mapa. */
export interface Punto {
  id: string;
  clase: 'sitio' | 'elemento' | 'cliente';
  nombre: string;
  detalle: string | null;
  lat: number;
  lon: number;
  tono: 'ok' | 'aviso' | 'falla' | 'neutro' | 'marca';
}
