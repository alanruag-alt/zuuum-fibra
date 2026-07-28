/** Un cliente que debe. Sale de la vista `v_morosos`. */
export interface Moroso {
  customer_id: string;
  customer_code: string;
  full_name: string;
  phone: string | null;
  zone_id: string;
  zona: string;
  adeudo: number;
  vence_desde: string | null;
  dias_vencido: number | null;
  servicios_activos: number;
}

/** Cómo va la cobranza de una zona en un periodo. Sale de `v_cobranza_zona`. */
export interface CobranzaZona {
  zone_id: string;
  zona: string;
  period_id: string;
  periodo: string;
  cargos: number;
  pagados: number;
  pendientes: number;
  esperado: number;
  cobrado: number;
  por_cobrar: number;
}

export interface PeriodoCobranza {
  id: string;
  year: number;
  month: number;
  label: string;
  due_date: string;
  grace_end_date: string;
  cutoff_date: string;
  status: string;
  generated_at: string | null;
}

/** Un pago ya registrado. */
export interface PagoRegistrado {
  id: string;
  receipt_number: string;
  amount: number;
  method: string;
  paid_at: string;
  status: string;
  reference: string | null;
  cliente: string | null;
  customer_code: string | null;
  zona: string | null;
  recibio: string | null;
}

export interface ResumenCobranza {
  morosos: number;
  adeudoTotal: number;
  cobradoHoy: number;
  pagosHoy: number;
  masDe30Dias: number;
}

/** Lo que devuelve la función `registrar_pago` de la base. */
export interface ResultadoCobro {
  payment_id: string;
  receipt_number: string;
  aplicado: number;
  saldo_a_favor: number;
  cargos_pagados: number;
  ya_existia: boolean;
}

export interface FiltrosMorosos {
  buscar?: string;
  zona?: string;
  dias?: string;
  pagina?: number;
}
