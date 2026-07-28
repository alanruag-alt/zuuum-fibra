/** Lo que devuelve la vista `v_clientes` de la base. */
export interface ClienteResumen {
  id: string;
  customer_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  price_review_needed: boolean;
  zone_id: string;
  zona: string;
  zona_codigo: string;
  servicios_activos: number;
  mensualidad: number;
  adeudo: number;
  ultimo_pago: string | null;
}

export interface Zona {
  id: string;
  name: string;
  code: string;
}

export interface FiltrosPadron {
  buscar?: string;
  zona?: string;
  estado?: string;
  revisar?: string;
  pagina?: number;
}

export interface ResumenPadron {
  total: number;
  activos: number;
  morosos: number;
  suspendidos: number;
  sinPrecio: number;
  mensualidad: number;
}

/** Un servicio contratado, con su plan. */
export interface ServicioCliente {
  id: string;
  network_type: string;
  status: string;
  custom_price: number | null;
  ip_address: string | null;
  wifi_ssid: string | null;
  activated_at: string | null;
  plan: { name: string; price: number; download_mbps: number | null } | null;
}

/** Un cargo del historial de cobranza. */
export interface CargoCliente {
  id: string;
  type: string;
  description: string | null;
  amount: number;
  balance: number;
  status: string;
  due_date: string | null;
  periodo: string | null;
}
