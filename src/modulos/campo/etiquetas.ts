/** Todo en español, en un solo lugar. */

type Tono = 'ok' | 'aviso' | 'falla' | 'neutro' | 'marca';

export const ESTADO_PROSPECTO: Record<string, { texto: string; tono: Tono }> = {
  new: { texto: 'Nuevo', tono: 'marca' },
  contacted: { texto: 'Contactado', tono: 'aviso' },
  quoted: { texto: 'Cotizado', tono: 'aviso' },
  scheduled: { texto: 'Agendado', tono: 'ok' },
  converted: { texto: 'Ya es cliente', tono: 'ok' },
  lost: { texto: 'Se perdió', tono: 'neutro' },
};

export const COBERTURA: Record<string, { texto: string; tono: Tono }> = {
  unknown: { texto: 'Por revisar', tono: 'neutro' },
  covered: { texto: 'Hay cobertura', tono: 'ok' },
  needs_build: { texto: 'Hay que tender', tono: 'aviso' },
  no_coverage: { texto: 'Sin cobertura', tono: 'falla' },
};

export const MOTIVO_PERDIDA: Record<string, string> = {
  no_coverage: 'No hay cobertura',
  price: 'Por el precio',
  competitor: 'Se fue con otro',
  no_answer: 'Nunca contestó',
  other: 'Otro',
};

export const TIPO_ORDEN: Record<string, string> = {
  installation: 'Instalación',
  relocation: 'Cambio de domicilio',
  removal: 'Retiro',
  maintenance: 'Mantenimiento',
  repair: 'Reparación',
};

export const ESTADO_ORDEN: Record<string, { texto: string; tono: Tono }> = {
  draft: { texto: 'Borrador', tono: 'neutro' },
  scheduled: { texto: 'Agendada', tono: 'marca' },
  in_progress: { texto: 'En curso', tono: 'aviso' },
  completed: { texto: 'Terminada', tono: 'ok' },
  cancelled: { texto: 'Cancelada', tono: 'neutro' },
};

export const PRIORIDAD: Record<string, { texto: string; tono: Tono }> = {
  low: { texto: 'Baja', tono: 'neutro' },
  normal: { texto: 'Normal', tono: 'neutro' },
  high: { texto: 'Alta', tono: 'aviso' },
  urgent: { texto: 'Urgente', tono: 'falla' },
};

export const CATEGORIA_TICKET: Record<string, string> = {
  no_service: 'Sin servicio',
  slow: 'Va lento',
  intermittent: 'Se va y viene',
  equipment: 'Equipo',
  billing: 'Cobranza',
  other: 'Otro',
};

export const ESTADO_TICKET: Record<string, { texto: string; tono: Tono }> = {
  open: { texto: 'Abierto', tono: 'falla' },
  assigned: { texto: 'Asignado', tono: 'aviso' },
  in_progress: { texto: 'En curso', tono: 'aviso' },
  waiting: { texto: 'Esperando', tono: 'neutro' },
  resolved: { texto: 'Resuelto', tono: 'ok' },
  closed: { texto: 'Cerrado', tono: 'neutro' },
};

export const CAUSA: Record<string, string> = {
  fiber_cut: 'Fibra cortada',
  dirty_connector: 'Conector sucio',
  equipment_failure: 'Falló el equipo',
  power: 'Se fue la luz',
  configuration: 'Mala configuración',
  customer_side: 'Cosa del cliente',
  false_alarm: 'Falsa alarma',
  other: 'Otra',
};

export function etiqueta(
  mapa: Record<string, { texto: string; tono: Tono }>,
  clave: string | null,
): { texto: string; tono: Tono } {
  if (!clave) return { texto: '—', tono: 'neutro' };
  return mapa[clave] ?? { texto: clave, tono: 'neutro' };
}
