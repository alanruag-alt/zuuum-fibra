import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Articulo, Equipo, Movimiento, Sucursal } from '@/modulos/almacen/tipos';

export async function listarArticulos(): Promise<Articulo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_inventario')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name');

  if (error) return [];
  return (data ?? []) as Articulo[];
}

export async function listarEquipos(filtro?: {
  buscar?: string;
  estado?: string;
}): Promise<Equipo[]> {
  const supabase = await crearClienteServidor();
  let q = supabase.from('v_equipos').select('*').limit(300);

  if (filtro?.estado) q = q.eq('status', filtro.estado);

  const b = filtro?.buscar?.trim();
  if (b) {
    // La serie se guarda limpia y en mayúsculas. Se busca igual, para que dé
    // lo mismo cómo venga del lector o de la etiqueta.
    const limpio = b.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    q = q.or(
      `serial_number.ilike.%${limpio}%,gpon_serial.ilike.%${limpio}%,cliente.ilike.%${b}%,customer_code.ilike.%${b}%`,
    );
  }

  const { data, error } = await q.order('serial_number');
  if (error) return [];
  return (data ?? []) as Equipo[];
}

export async function listarMovimientos(limite = 80): Promise<Movimiento[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_movimientos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) return [];
  return (data ?? []) as Movimiento[];
}

export async function listarSucursales(): Promise<Sucursal[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, type')
    .eq('is_active', true)
    .order('name');

  if (error) return [];
  return (data ?? []) as Sucursal[];
}
