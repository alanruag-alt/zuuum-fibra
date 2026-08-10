export interface Articulo {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  is_serialized: boolean;
  min_stock: number;
  brand: string | null;
  model: string | null;
  is_active: boolean;
  existencia: number;
  equipos_libres: number;
  equipos_instalados: number;
  /** Solo llega con permiso de finanzas. Si no, viene null. */
  costo: number | null;
}

export interface Equipo {
  id: string;
  serial_number: string;
  gpon_serial: string | null;
  mac_address: string | null;
  brand: string | null;
  model: string | null;
  status: string;
  location_type: string | null;
  install_count: number;
  installed_at: string | null;
  notes: string | null;
  customer_id: string | null;
  cliente: string | null;
  customer_code: string | null;
  zona: string | null;
  articulo: string | null;
  sku: string | null;
}

export interface Movimiento {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  articulo: string | null;
  sku: string | null;
  serial_number: string | null;
  from_type: string | null;
  to_type: string | null;
  quien: string | null;
}

export interface Sucursal {
  id: string;
  name: string;
  type: string;
}
