import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Comentario, Orden, Prospecto, Ticket } from '@/modulos/campo/tipos';
import type { Persona } from '@/modulos/admin/tipos';

export async function listarProspectos(estado?: string): Promise<Prospecto[]> {
  const supabase = await crearClienteServidor();
  let q = supabase.from('v_prospectos').select('*').order('created_at', { ascending: false });
  if (estado) q = q.eq('status', estado);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Prospecto[];
}

export async function listarOrdenes(estado?: string, limite = 100): Promise<Orden[]> {
  const supabase = await crearClienteServidor();
  let q = supabase
    .from('v_ordenes')
    .select('*')
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limite);

  if (estado === 'abiertas') q = q.in('status', ['draft', 'scheduled', 'in_progress']);
  else if (estado) q = q.eq('status', estado);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Orden[];
}

export async function obtenerOrden(id: string): Promise<Orden | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('v_ordenes').select('*').eq('id', id).maybeSingle();
  if (error) return null;
  return (data as Orden) ?? null;
}

export async function listarTickets(estado?: string, limite = 100): Promise<Ticket[]> {
  const supabase = await crearClienteServidor();
  let q = supabase
    .from('v_tickets')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(limite);

  if (estado === 'abiertos') q = q.in('status', ['open', 'assigned', 'in_progress', 'waiting']);
  else if (estado) q = q.eq('status', estado);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Ticket[];
}

export async function obtenerTicket(id: string): Promise<Ticket | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('v_tickets').select('*').eq('id', id).maybeSingle();
  if (error) return null;
  return (data as Ticket) ?? null;
}

export async function comentariosDeTicket(id: string): Promise<Comentario[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('ticket_comments')
    .select('id, body, is_internal, created_at, autor:profiles(full_name)')
    .eq('ticket_id', id)
    .order('created_at');

  if (error) return [];

  return ((data ?? []) as Record<string, unknown>[]).map((c) => {
    const a = Array.isArray(c.autor) ? c.autor[0] : c.autor;
    return {
      id: c.id as string,
      body: c.body as string,
      is_internal: Boolean(c.is_internal),
      created_at: c.created_at as string,
      autor: (a as { full_name?: string })?.full_name ?? null,
    };
  });
}

/** Quiénes pueden recibir una orden: los que trabajan en campo. */
export async function tecnicosDisponibles(): Promise<Persona[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_personas')
    .select('*')
    .eq('is_active', true)
    .order('full_name');

  if (error) return [];

  // Se ofrecen los que hacen trabajo de campo. La base valida de todos modos,
  // así que esto es comodidad, no seguridad.
  const deCampo = new Set(['technician', 'supervisor', 'warehouse', 'admin', 'owner']);
  return ((data ?? []) as Persona[]).filter((p) => !p.rol_codigo || deCampo.has(p.rol_codigo));
}
