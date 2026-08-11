type Tono = 'ok' | 'aviso' | 'falla' | 'neutro' | 'marca';

/** El color real de cada hilo, para poder pintarlo y no solo nombrarlo. */
export const COLOR_HILO: Record<string, string> = {
  Azul: '#1e5fd0',
  Naranja: '#f2820c',
  Verde: '#1a9e3e',
  Café: '#7a4a1e',
  Gris: '#808a95',
  Blanco: '#eef2f6',
  Rojo: '#e0202a',
  Negro: '#22262e',
  Amarillo: '#f2c40c',
  Violeta: '#8e44ad',
  Rosa: '#ff6fae',
  Aqua: '#24c4c4',
};

export const ESTADO_HILO: Record<string, { texto: string; tono: Tono }> = {
  disponible: { texto: 'Disponible', tono: 'ok' },
  fusionado: { texto: 'Fusionado', tono: 'marca' },
  en_servicio: { texto: 'En servicio', tono: 'marca' },
  reservado: { texto: 'Reservado', tono: 'aviso' },
  danado: { texto: 'Dañado', tono: 'falla' },
  cortado: { texto: 'Cortado', tono: 'falla' },
  sin_identificar: { texto: 'Sin identificar', tono: 'neutro' },
};

export const TIPO_CABLE: Record<string, string> = {
  adss: 'ADSS (aéreo)',
  armado: 'Armado',
  canalizado: 'Canalizado',
  drop: 'Drop',
  otro: 'Otro',
};

export const TIPO_EMPALME: Record<string, string> = {
  fusion: 'Fusión',
  mecanico: 'Empalme mecánico',
  conector: 'Conector',
  paso: 'De paso',
};

export const ESTADO_FUSION: Record<string, { texto: string; tono: Tono }> = {
  activa: { texto: 'Activa', tono: 'ok' },
  inactiva: { texto: 'Inactiva', tono: 'neutro' },
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
};

export const ESTADO_PUERTO: Record<string, { texto: string; tono: Tono }> = {
  libre: { texto: 'Libre', tono: 'ok' },
  ocupado: { texto: 'Ocupado', tono: 'marca' },
  reservado: { texto: 'Reservado', tono: 'aviso' },
  danado: { texto: 'Dañado', tono: 'falla' },
};

export const SEMAFORO_RX: Record<string, { texto: string; tono: Tono }> = {
  bien: { texto: 'Señal bien', tono: 'ok' },
  al_limite: { texto: 'Al límite', tono: 'aviso' },
  mal: { texto: 'Señal baja', tono: 'falla' },
};

export function etiqueta(
  mapa: Record<string, { texto: string; tono: Tono }>,
  clave: string | null,
): { texto: string; tono: Tono } {
  if (!clave) return { texto: '—', tono: 'neutro' };
  return mapa[clave] ?? { texto: clave, tono: 'neutro' };
}

/** «Hilo 14 · Verde · tubo 2» — como se dice en la calle. */
export function nombreHilo(numero: number, color: string, tubo: number): string {
  return `Hilo ${numero} · ${color}${tubo > 1 ? ` · tubo ${tubo}` : ''}`;
}
