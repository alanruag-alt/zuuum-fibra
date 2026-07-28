/** Utilidades de presentación. Todo en español de México. */

const PESOS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const PESOS_CENTAVOS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

const NUMERO = new Intl.NumberFormat('es-MX');

export function pesos(valor: number | null | undefined, conCentavos = false): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return conCentavos ? PESOS_CENTAVOS.format(valor) : PESOS.format(valor);
}

export function numero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return NUMERO.format(valor);
}

export function porcentaje(parte: number, total: number): string {
  if (!total) return '—';
  return `${Math.round((parte / total) * 100)}%`;
}

export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Potencia óptica: verde entre -25 y -8 dBm, según el plan maestro. */
export function semaforoOptico(dbm: number | null | undefined): 'ok' | 'aviso' | 'falla' | 'sin' {
  if (dbm === null || dbm === undefined || Number.isNaN(dbm)) return 'sin';
  if (dbm >= -25 && dbm <= -8) return 'ok';
  if (dbm >= -27 && dbm < -25) return 'aviso';
  return 'falla';
}
