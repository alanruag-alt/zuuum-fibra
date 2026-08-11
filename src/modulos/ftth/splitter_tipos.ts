/**
 * Tipos y etiquetas del splitter.
 *
 * Viven aparte de las consultas porque las pantallas del navegador los
 * necesitan, y el archivo de consultas es «server-only»: importarlo desde un
 * componente de cliente truena la compilación. Los tipos son gratis —se borran
 * al compilar— pero las listas de textos no.
 */
export interface Splitter {
  id: string;
  code: string;
  ratio: string;
  housing_id: string;
  caja: string;
  tipo_caja: string;
  sitio: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  loss_db: number | null;
  power_in_dbm: number | null;
  installed_at: string | null;
  responsable: string | null;
  notes: string | null;
  is_active: boolean;
  salidas: number;
  usadas: number;
  libres: number;
  danadas: number;
  entrada: string | null;
}

export interface SalidaSplitter {
  id: string;
  splitter_id: string;
  splitter: string;
  ratio: string;
  caja: string;
  port_number: number;
  status: string;
  power_dbm: number | null;
  notes: string | null;
  cable: string | null;
  strand_number: number | null;
  color_hilo: string | null;
  nap: string | null;
  puerto_nap: number | null;
}

export interface CajaParaSplitter {
  id: string;
  code: string;
  tipo: string;
  zona: string | null;
}

/** Las razones que existen en catálogo. De aquí salen las salidas. */
export const RAZONES = ['1x2', '1x4', '1x8', '1x16', '1x32', '1x64', '2x8', '2x16', '2x32'];

export const ESTADO_SALIDA: Record<string, { texto: string; tono: string }> = {
  disponible: { texto: 'Disponible', tono: 'ok' },
  utilizada: { texto: 'Utilizada', tono: 'marca' },
  reservada: { texto: 'Reservada', tono: 'aviso' },
  danada: { texto: 'Dañada', tono: 'falla' },
};

export const TIPO_CAJA: Record<string, string> = {
  closure: 'caja de empalme',
  nap: 'NAP',
  odf: 'ODF',
};
