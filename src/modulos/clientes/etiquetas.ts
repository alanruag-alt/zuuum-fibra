/** Traducciones y colores de los estados. Un solo lugar, para que no se desincronicen. */

export const ESTADO_CLIENTE: Record<
  string,
  { texto: string; tono: 'ok' | 'aviso' | 'falla' | 'neutro' }
> = {
  active: { texto: 'Activo', tono: 'ok' },
  overdue: { texto: 'Moroso', tono: 'aviso' },
  suspended: { texto: 'Suspendido', tono: 'falla' },
  cancelled: { texto: 'Baja', tono: 'neutro' },
};

export const ESTADO_SERVICIO: Record<
  string,
  { texto: string; tono: 'ok' | 'aviso' | 'falla' | 'neutro' }
> = {
  active: { texto: 'Activo', tono: 'ok' },
  pending: { texto: 'Pendiente', tono: 'aviso' },
  suspended: { texto: 'Suspendido', tono: 'falla' },
  cancelled: { texto: 'Cancelado', tono: 'neutro' },
};

export const TIPO_RED: Record<string, string> = {
  ftth: 'Fibra',
  wisp: 'Inalámbrico',
};

export const TIPO_CARGO: Record<string, string> = {
  monthly: 'Mensualidad',
  reconnection: 'Reconexión',
  installation: 'Instalación',
  equipment_loss: 'Equipo no devuelto',
  other: 'Otro',
};

export const ESTADO_CARGO: Record<
  string,
  { texto: string; tono: 'ok' | 'aviso' | 'falla' | 'neutro' }
> = {
  paid: { texto: 'Pagado', tono: 'ok' },
  pending: { texto: 'Pendiente', tono: 'aviso' },
  partial: { texto: 'Parcial', tono: 'aviso' },
  cancelled: { texto: 'Cancelado', tono: 'neutro' },
};

export function etiquetaEstadoCliente(estado: string) {
  return ESTADO_CLIENTE[estado] ?? { texto: estado, tono: 'neutro' as const };
}

export function etiquetaEstadoServicio(estado: string) {
  return ESTADO_SERVICIO[estado] ?? { texto: estado, tono: 'neutro' as const };
}

export function etiquetaEstadoCargo(estado: string) {
  return ESTADO_CARGO[estado] ?? { texto: estado, tono: 'neutro' as const };
}
