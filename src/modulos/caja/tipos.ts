/** Una caja, como la muestra la vista `v_corte_caja`. */
export interface Caja {
  id: string;
  collector_id: string;
  cobrador: string;
  zone_id: string | null;
  zona: string | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  pagos: number;
  efectivo_esperado: number;
  transferencias: number;
  efectivo_declarado: number | null;
  diferencia: number | null;
}

/** Alguien a quien se le puede entregar la caja. */
export interface Persona {
  id: string;
  full_name: string;
}

/** Un servicio al que le tocaría el corte del día 11. */
export interface PorCortar {
  service_id: string;
  customer_code: string;
  cliente: string;
  zona: string;
  adeudo: number;
  suspendido: boolean;
}

export interface ResumenCaja {
  abiertas: number;
  porVerificar: number;
  efectivoEnCalle: number;
  diferenciasDelDia: number;
}
