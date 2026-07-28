/**
 * Permisos del lado del navegador.
 *
 * IMPORTANTE: esto es solo para decidir qué se DIBUJA. La seguridad de verdad
 * está en las políticas RLS de PostgreSQL. Si alguien manipula esto desde la
 * consola del navegador, la base sigue negándole los datos.
 */

import { ROLES, type CodigoRol } from '@/lib/constantes';

/** Permisos que NUNCA puede tener un técnico, almacén o cliente,
 *  ni aunque el administrador se los quiera dar. */
export const PERMISOS_SENSIBLES = [
  'finance.read',
  'finance.write',
  'payments.read',
  'payments.create',
  'payments.cancel',
  'charges.read',
  'inventory.cost.read',
  'reports.financial',
] as const;

const ROLES_SIN_ACCESO_SENSIBLE: CodigoRol[] = [ROLES.TECNICO, ROLES.ALMACEN, ROLES.CLIENTE];

export interface SesionUsuario {
  id: string;
  nombre: string;
  correo: string;
  roles: CodigoRol[];
  permisos: string[];
  zonas: string[];
  alcanceTotal: boolean;
}

export function tienePermiso(sesion: SesionUsuario | null, permiso: string): boolean {
  if (!sesion) return false;
  if (esSensible(permiso) && sesion.roles.every((r) => ROLES_SIN_ACCESO_SENSIBLE.includes(r))) {
    return false;
  }
  return sesion.permisos.includes(permiso);
}

export function tieneAlgunPermiso(sesion: SesionUsuario | null, permisos: string[]): boolean {
  return permisos.some((p) => tienePermiso(sesion, p));
}

export function esSensible(permiso: string): boolean {
  return (PERMISOS_SENSIBLES as readonly string[]).includes(permiso);
}

export function puedeVerZona(sesion: SesionUsuario | null, zonaId: string): boolean {
  if (!sesion) return false;
  if (sesion.alcanceTotal) return true;
  return sesion.zonas.includes(zonaId);
}
