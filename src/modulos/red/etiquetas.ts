type Tono = 'ok' | 'aviso' | 'falla' | 'neutro' | 'marca';

export const TIPO_ELEMENTO: Record<string, string> = {
  nap: 'NAP',
  closure: 'Manga',
  splitter: 'Splitter',
  pole: 'Poste',
  hand_hole: 'Registro',
  other: 'Otro',
};

export const TIPO_DISPOSITIVO: Record<string, string> = {
  olt: 'OLT',
  router: 'Router',
  switch: 'Switch',
  sector: 'Sector',
  ap: 'Punto de acceso',
  server: 'Servidor',
  other: 'Otro',
};

export const TIPO_SITIO: Record<string, string> = {
  olt_site: 'Caseta de OLT',
  tower: 'Torre',
  pop: 'POP',
  other: 'Otro',
};

export const ESTADO_DISPOSITIVO: Record<string, { texto: string; tono: Tono }> = {
  online: { texto: 'Responde', tono: 'ok' },
  offline: { texto: 'No responde', tono: 'falla' },
  unknown: { texto: 'Sin sondear', tono: 'neutro' },
  maintenance: { texto: 'En mantenimiento', tono: 'aviso' },
};

export const SEMAFORO: Record<string, { texto: string; tono: Tono }> = {
  con_lugar: { texto: 'Con lugar', tono: 'ok' },
  por_llenarse: { texto: 'Por llenarse', tono: 'aviso' },
  lleno: { texto: 'Lleno', tono: 'falla' },
  sin_capacidad: { texto: 'Sin capacidad puesta', tono: 'neutro' },
};

export function etiqueta(
  mapa: Record<string, { texto: string; tono: Tono }>,
  clave: string | null,
): { texto: string; tono: Tono } {
  if (!clave) return { texto: '—', tono: 'neutro' };
  return mapa[clave] ?? { texto: clave, tono: 'neutro' };
}
