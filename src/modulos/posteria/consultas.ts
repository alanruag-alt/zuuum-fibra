import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Plano, Poste } from '@/modulos/posteria/tipos';

export async function listarPostes(cableId?: string): Promise<Poste[]> {
  const supabase = await crearClienteServidor();
  let q = supabase
    .from('v_postes')
    .select('*')
    .eq('is_active', true)
    .order('cable', { nullsFirst: false })
    .order('sort_order', { nullsFirst: false })
    .limit(3000);

  if (cableId) q = q.eq('cable_id', cableId);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Poste[];
}

export async function listarPlanos(): Promise<Plano[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('cfe_plans')
    .select('id, name, zone_id, config, updated_at')
    .order('name');

  if (error) return [];
  return (data ?? []) as Plano[];
}

export async function obtenerPlano(id: string): Promise<Plano | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('cfe_plans')
    .select('id, name, zone_id, config, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (error) return null;
  return (data as Plano) ?? null;
}
