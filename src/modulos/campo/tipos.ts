export interface Prospecto {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  zone_id: string;
  zona: string;
  address_text: string | null;
  coverage_status: string;
  status: string;
  lost_reason: string | null;
  notes: string | null;
  converted_customer_id: string | null;
  created_at: string;
  plan_interes: string | null;
  precio_interes: number | null;
  dias_desde_alta: number;
}

export interface Orden {
  id: string;
  order_number: string;
  type: string;
  status: string;
  priority: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  description: string | null;
  zone_id: string;
  zona: string;
  customer_id: string | null;
  cliente: string | null;
  customer_code: string | null;
  telefono: string | null;
  service_id: string | null;
  tecnicos: string | null;
  fotos: number;
  lecturas: number;
  firmas: number;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  category: string;
  priority: string;
  status: string;
  subject: string | null;
  description: string | null;
  root_cause: string | null;
  opened_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  zone_id: string;
  zona: string;
  customer_id: string | null;
  cliente: string | null;
  customer_code: string | null;
  telefono: string | null;
  assigned_to: string | null;
  atiende: string | null;
  comentarios: number;
  horas_abierto: number;
}

export interface Comentario {
  id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  autor: string | null;
}
