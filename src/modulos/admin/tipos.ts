export interface Persona {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  employee_code: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  rol_codigo: string | null;
  rol: string | null;
  alcance: string | null;
  zonas: number;
  zonas_cobra: number;
  zonas_nombres: string | null;
  permisos_especiales: number;
}

export interface Rol {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scope_type: string;
  permisos: number;
}

export interface Permiso {
  id: string;
  code: string;
  module: string;
  name: string;
  description: string | null;
  is_sensitive: boolean;
}

/** Permiso de una persona: de dónde le viene y si trae excepción. */
export interface PermisoDePersona extends Permiso {
  porRol: boolean;
  excepcion: boolean | null;
  efectivo: boolean;
}

export interface ZonaDetalle {
  id: string;
  name: string;
  code: string;
  network_type: string;
  is_active: boolean;
  clientes: number;
  activos: number;
  ingreso: number;
}

export interface ZonaDeUsuario {
  zone_id: string;
  can_collect: boolean;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  price: number;
  download_mbps: number | null;
  upload_mbps: number | null;
  network_type: string;
  is_legacy: boolean;
  visible_for_sale: boolean;
  is_active: boolean;
  notes: string | null;
  contratados: number;
}

export interface Ajuste {
  key: string;
  value: unknown;
  value_type: string;
  category: string;
  name: string;
  description: string | null;
  updated_at: string;
}

export interface MovimientoAuditoria {
  id: string;
  table_name: string;
  action: string;
  record_id: string | null;
  created_at: string;
  quien: string | null;
  cambios: Record<string, unknown> | null;
}
