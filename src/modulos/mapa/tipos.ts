/** Un punto dibujable sobre el mapa. */
export interface PuntoMapa {
  id: string;
  clase: 'nap' | 'caja' | 'odf' | 'sitio' | 'poste';
  nombre: string;
  detalle: string | null;
  lat: number;
  lon: number;
  color: string;
}

/** El recorrido de un cable. */
export interface TrazoMapa {
  id: string;
  codigo: string;
  color: string | null;
  puntos: [number, number][];
}

export interface VistaZona {
  lat: number;
  lon: number;
  zoom: number;
}

/** Cuencamé, por si una zona todavía no tiene nada capturado. */
export const VISTA_POR_DEFECTO: VistaZona = { lat: 24.873207, lon: -103.697078, zoom: 15 };
