/** Un punto dibujable sobre el mapa. */
export interface PuntoMapa {
  id: string;
  clase: 'nap' | 'caja' | 'odf' | 'sitio' | 'poste';
  nombre: string;
  detalle: string | null;
  lat: number;
  lon: number;
  color: string;
  /**
   * La ficha que se enseña al darle clic.
   *
   * Se arma aquí, del lado del servidor, y no en el mapa: cada clase tiene
   * datos distintos —una NAP tiene puertos, un poste tiene vano— y meter esa
   * decisión en la pantalla la llenaría de condiciones.
   */
  ficha: { que: string; dato: string }[];
  /** Qué se le pide borrar a la base cuando se borra desde el mapa. */
  borrarComo: 'elemento' | 'sitio' | 'poste';
  /** Los cables que salen o llegan a este punto, dichos en corto. */
  cables?: string[];
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
