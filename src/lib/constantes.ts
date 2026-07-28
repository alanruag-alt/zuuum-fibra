/**
 * Constantes del sistema.
 *
 * Los valores de negocio (día de corte, tolerancia, cargos) NO viven aquí:
 * viven en la tabla `settings` de la base, para que se puedan cambiar sin
 * volver a compilar. Aquí solo va lo estructural.
 */

export const APP_NOMBRE = 'ZUUUM FIBRA';

/** Los siete roles del plan maestro. */
export const ROLES = {
  PROPIETARIO: 'owner',
  ADMIN: 'admin',
  OFICINA: 'office',
  SUPERVISOR: 'supervisor',
  TECNICO: 'technician',
  ALMACEN: 'warehouse',
  CLIENTE: 'customer',
} as const;

export type CodigoRol = (typeof ROLES)[keyof typeof ROLES];

export const NOMBRE_ROL: Record<CodigoRol, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  office: 'Oficina y cobranza',
  supervisor: 'Supervisor',
  technician: 'Técnico',
  warehouse: 'Almacén',
  customer: 'Cliente',
};

/** Estados de un cliente. */
export const ESTADO_CLIENTE = {
  ACTIVO: 'active',
  SUSPENDIDO: 'suspended',
  MOROSO: 'overdue',
  BAJA: 'cancelled',
} as const;

export type EstadoCliente = (typeof ESTADO_CLIENTE)[keyof typeof ESTADO_CLIENTE];

export const NOMBRE_ESTADO_CLIENTE: Record<EstadoCliente, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  overdue: 'Moroso',
  cancelled: 'Baja',
};

/** Rutas públicas: no piden sesión. */
export const RUTAS_PUBLICAS = ['/entrar', '/recuperar'];
