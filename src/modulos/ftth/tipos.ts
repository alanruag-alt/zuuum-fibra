export interface Cable {
  id: string;
  code: string;
  cable_type: string;
  fiber_count: number;
  zone_id: string | null;
  zona: string | null;
  de: string | null;
  a: string | null;
  desde_lat: number | null;
  desde_lon: number | null;
  hasta_lat: number | null;
  hasta_lon: number | null;
  puntos_trazo: number;
  postes: number;
  length_m: number | null;
  plan_color: string | null;
  notes: string | null;
  is_active: boolean;
  hilos: number;
  libres: number;
  en_servicio: number;
  lastimados: number;
}

export interface Hilo {
  id: string;
  cable_id: string;
  cable: string;
  strand_number: number;
  tube_number: number;
  color: string;
  status: string;
  notes: string | null;
  fusiones: number;
}

export interface Fusion {
  id: string;
  closure_id: string;
  caja: string;
  caja_nombre: string | null;
  zona: string | null;
  splice_type: string;
  loss_db: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  cable_entra: string | null;
  hilo_entra: number | null;
  color_entra: string | null;
  in_strand_id: string;
  cable_sale: string | null;
  hilo_sale: number | null;
  color_sale: string | null;
  out_strand_id: string | null;
  destino: string | null;
  destino_tipo: string | null;
  to_element_id: string | null;
}

export interface PuertoNap {
  id: string;
  element_id: string;
  nap: string;
  zona: string | null;
  port_number: number;
  status: string;
  rx_dbm: number | null;
  notes: string | null;
  service_id: string | null;
  customer_id: string | null;
  cliente: string | null;
  customer_code: string | null;
  semaforo_rx: 'bien' | 'al_limite' | 'mal' | null;
}

/** Un salto del recorrido de la luz. */
export interface Salto {
  salto: number;
  hilo_id: string;
  cable: string;
  cable_id: string;
  numero: number;
  tubo: number;
  color: string;
  estado: string;
  caja: string | null;
  caja_id: string | null;
  tipo_union: string | null;
  perdida_db: number | null;
  destino: string | null;
  destino_id: string | null;
  metros: number | null;
}

export interface Impacto {
  tipo: 'cable' | 'caja';
  id: string;
  elemento: string;
  zona: string | null;
  clientes_afectados: number;
  naps_afectadas: number;
}
