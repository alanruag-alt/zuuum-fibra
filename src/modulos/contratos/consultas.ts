import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Contrato, SinContrato } from '@/modulos/contratos/tipos';

export async function listarContratos(estado?: string): Promise<Contrato[]> {
  const supabase = await crearClienteServidor();
  let q = supabase.from('v_contratos').select('*').order('created_at', { ascending: false });
  if (estado) q = q.eq('status', estado);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Contrato[];
}

/**
 * Los servicios activos sin papel.
 *
 * Es la lista que de verdad importa: 1,102 clientes se cargaron desde los
 * Excel y ninguno trae contrato firmado. Esta pantalla existe para irlos
 * bajando de esa lista, no para presumir los que ya están.
 */
export async function serviciosSinContrato(limite = 200): Promise<SinContrato[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('customer_services')
    .select(
      'id, customer_id, network_type, custom_price, activated_at, ' +
        'cliente:customers(full_name, customer_code, zone_id, zones(name)), ' +
        'plan:service_plans(name, price)',
    )
    .is('contract_id', null)
    .eq('status', 'active')
    .limit(limite);

  if (error) return [];

  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((s) => {
      const c = (Array.isArray(s.cliente) ? s.cliente[0] : s.cliente) as
        | {
            full_name?: string;
            customer_code?: string;
            zones?: { name?: string } | { name?: string }[];
          }
        | undefined;
      const p = (Array.isArray(s.plan) ? s.plan[0] : s.plan) as
        | { name?: string; price?: number }
        | undefined;
      const z = Array.isArray(c?.zones) ? c?.zones[0] : c?.zones;

      return {
        id: s.id as string,
        customer_id: s.customer_id as string,
        cliente: c?.full_name ?? '—',
        customer_code: c?.customer_code ?? '—',
        zona: z?.name ?? '—',
        plan: p?.name ?? '—',
        mensualidad: Number(s.custom_price ?? p?.price ?? 0),
        network_type: (s.network_type as string) ?? 'ftth',
        desde: (s.activated_at as string) ?? null,
      };
    })
    .sort((a, b) => a.zona.localeCompare(b.zona) || a.customer_code.localeCompare(b.customer_code));
}
