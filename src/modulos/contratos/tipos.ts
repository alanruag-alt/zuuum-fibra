export interface Contrato {
  id: string;
  contract_number: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  signed_at: string | null;
  pdf_url: string | null;
  created_at: string;
  customer_id: string;
  cliente: string | null;
  customer_code: string | null;
  telefono: string | null;
  zone_id: string | null;
  zona: string | null;
  plan: string | null;
  precio_plan: number | null;
  servicio_id: string | null;
  estado_servicio: string | null;
  network_type: string | null;
  mensualidad: number | null;
  sin_firmar: boolean;
}

/** Un servicio activo que todavía no tiene contrato. */
export interface SinContrato {
  id: string;
  customer_id: string;
  cliente: string;
  customer_code: string;
  zona: string;
  plan: string;
  mensualidad: number;
  network_type: string;
  desde: string | null;
}
