/**
 * Vocabulario del rack, en un archivo sin `server-only`.
 *
 * Lo usan la pantalla —que corre en el navegador— y las consultas del
 * servidor. Si viviera dentro de `racks.ts`, importar un rótulo arrastraría
 * el cliente de Supabase al navegador y la compilación se cae.
 */

export interface EstadoVisual {
  clave: string;
  rotulo: string;
  /** El icono va SIEMPRE junto al color: el color solo no informa a todos. */
  icono: string;
  punto: string;
  caja: string;
  texto: string;
}

/**
 * Los estados, con color Y con icono.
 *
 * Lo del icono no es adorno. Uno de cada doce hombres distingue mal el rojo
 * del verde, y esta pantalla se ve a las dos de la mañana en la pantalla de
 * un celular con el sol encima. Si el estado solo se dijera con color, para
 * esa persona y en esa luz la pantalla no dice nada.
 */
export const ESTADOS: EstadoVisual[] = [
  {
    clave: 'disponible',
    rotulo: 'Disponible',
    icono: '○',
    punto: 'bg-green-500',
    caja: 'border-green-300 bg-green-50',
    texto: 'text-exito',
  },
  {
    clave: 'en_linea',
    rotulo: 'Ocupado · en línea',
    icono: '▣',
    punto: 'bg-blue-500',
    caja: 'border-blue-300 bg-blue-50',
    texto: 'text-blue-700',
  },
  {
    clave: 'reservado',
    rotulo: 'Reservado',
    icono: '◇',
    punto: 'bg-amber-400',
    caja: 'border-amber-300 bg-amber-50',
    texto: 'text-aviso',
  },
  {
    clave: 'alarma',
    rotulo: 'Alarma',
    icono: '▲',
    punto: 'bg-red-500',
    caja: 'border-red-300 bg-red-50',
    texto: 'text-falla',
  },
  {
    clave: 'fuera_de_servicio',
    rotulo: 'Fuera de servicio',
    icono: '✕',
    punto: 'bg-marino-400',
    caja: 'border-marino-300 bg-marino-100',
    texto: 'text-marino-500',
  },
  {
    clave: 'sin_documentar',
    rotulo: 'Sin documentar',
    icono: '?',
    punto: 'bg-naranja-500',
    caja: 'border-naranja-300 bg-naranja-50',
    texto: 'text-naranja-700',
  },
];

export function estadoDe(clave: string): EstadoVisual {
  return ESTADOS.find((e) => e.clave === clave) ?? ESTADOS[5];
}

export const TIPOS_EQUIPO = [
  { clave: 'olt', rotulo: 'OLT', icono: '🛜', altura: 2 },
  { clave: 'odf', rotulo: 'ODF', icono: '🧷', altura: 1 },
  { clave: 'switch', rotulo: 'Switch', icono: '🔀', altura: 1 },
  { clave: 'router', rotulo: 'Router', icono: '🧭', altura: 1 },
  { clave: 'servidor', rotulo: 'Servidor', icono: '🖥️', altura: 1 },
  { clave: 'organizador', rotulo: 'Organizador de cables', icono: '➰', altura: 1 },
  { clave: 'ups', rotulo: 'UPS / respaldo', icono: '🔋', altura: 2 },
  { clave: 'patch', rotulo: 'Patch panel', icono: '🔌', altura: 1 },
  { clave: 'otro', rotulo: 'Otro', icono: '📦', altura: 1 },
];

/**
 * Los que se montan sueltos, sin dar de alta nada más.
 *
 * La OLT y el ODF NO están aquí a propósito: esos se dan de alta con sus
 * botones, porque nacen con tarjetas y con bandejas. Ofrecerlos en esta lista
 * dejaría montar una etiqueta que dice «OLT» sin OLT detrás, y el día que
 * alguien la busque en la pestaña de equipos no va a estar.
 */
export const TIPOS_SUELTOS = TIPOS_EQUIPO.filter((t) => t.clave !== 'olt' && t.clave !== 'odf');

export function tipoDe(clave: string) {
  return TIPOS_EQUIPO.find((t) => t.clave === clave) ?? TIPOS_EQUIPO[8];
}

/** Las alturas de catálogo. Se acepta cualquiera: hay gabinetes raros. */
export const ALTURAS_RACK = [6, 12, 24, 42, 48];

export const CONECTORES = ['SC/APC', 'SC/UPC', 'LC/APC', 'LC/UPC', 'FC/APC', 'ST'];
