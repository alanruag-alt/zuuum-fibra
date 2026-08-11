/**
 * Vocabulario de la caja, sin `server-only`.
 *
 * Lo comparten la pantalla del diagrama —que corre en el navegador— y las
 * consultas del servidor.
 */

export interface CableEnCaja {
  cable_id: string;
  codigo: string;
  /** llega · sale · pasa. El que «pasa» es el que se derivó sobre su línea. */
  papel: string;
  hilos: number;
  metros: number | null;
  enganchado: boolean;
}

export interface HiloEnCaja {
  hilo_id: string;
  cable_id: string;
  cable: string;
  numero: number;
  color: string;
  tubo: number | null;
  estado: string;
  cortado_aqui: boolean;
  viene_de: string | null;
  va_a: string | null;
  fusion_id: string | null;
  par_id: string | null;
  par_texto: string | null;
  termina_en: string | null;
}

export interface FusionDeCaja {
  caja: string;
  cable_entra: string | null;
  tubo_entra: number | null;
  hilo_entra: number | null;
  color_entra: string | null;
  tipo: string;
  cable_sale: string | null;
  tubo_sale: number | null;
  hilo_sale: number | null;
  color_sale: string | null;
  termina_en: string | null;
  perdida_db: number | null;
  estado: string;
  responsable: string | null;
  fecha: string | null;
  observaciones: string | null;
}

export const PAPEL_CABLE: Record<string, { texto: string; icono: string }> = {
  llega: { texto: 'Llega a la caja', icono: '→' },
  sale: { texto: 'Sale de la caja', icono: '←' },
  pasa: { texto: 'Pasa por la calle', icono: '↔' },
};
