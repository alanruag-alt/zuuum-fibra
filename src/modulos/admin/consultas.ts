import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type {
  Ajuste,
  MovimientoAuditoria,
  Permiso,
  PermisoDePersona,
  Persona,
  Plan,
  Rol,
  ZonaDeUsuario,
  ZonaDetalle,
} from '@/modulos/admin/tipos';

export async function listarPersonas(): Promise<Persona[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_personas')
    .select('*')
    .order('is_active', { ascending: false })
    .order('full_name');

  if (error) return [];
  return (data ?? []) as Persona[];
}

export async function obtenerPersona(id: string): Promise<Persona | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('v_personas').select('*').eq('id', id).maybeSingle();
  if (error) return null;
  return (data as Persona) ?? null;
}

export async function listarRoles(): Promise<Rol[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('roles')
    .select('id, code, name, description, scope_type, role_permissions(count)')
    .eq('is_active', true)
    .order('name');

  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    scope_type: r.scope_type as string,
    permisos: Number((r.role_permissions as { count: number }[])?.[0]?.count ?? 0),
  }));
}

export async function listarPermisos(): Promise<Permiso[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('permissions')
    .select('id, code, module, name, description, is_sensitive')
    .order('module')
    .order('code');

  if (error) return [];
  return (data ?? []) as Permiso[];
}

/**
 * Los permisos de una persona, diciendo de dónde le viene cada uno.
 *
 * Es la pantalla que contesta "¿por qué este señor puede ver los pagos?" sin
 * que nadie tenga que abrir la base.
 */
export async function permisosDePersona(userId: string): Promise<PermisoDePersona[]> {
  const supabase = await crearClienteServidor();

  const [todos, { data: rolFilas }, { data: excepciones }] = await Promise.all([
    listarPermisos(),
    supabase
      .from('user_roles')
      .select('role_id, roles(role_permissions(permission_id))')
      .eq('user_id', userId),
    supabase.from('user_permissions').select('permission_id, granted').eq('user_id', userId),
  ]);

  const delRol = new Set<string>();
  for (const fila of (rolFilas ?? []) as Record<string, unknown>[]) {
    const rol = Array.isArray(fila.roles) ? fila.roles[0] : fila.roles;
    const rps = (rol as { role_permissions?: { permission_id: string }[] })?.role_permissions ?? [];
    rps.forEach((rp) => delRol.add(rp.permission_id));
  }

  const exc = new Map<string, boolean>();
  for (const e of (excepciones ?? []) as { permission_id: string; granted: boolean }[]) {
    exc.set(e.permission_id, e.granted);
  }

  return todos.map((p) => {
    const porRol = delRol.has(p.id);
    const excepcion = exc.has(p.id) ? (exc.get(p.id) as boolean) : null;
    return {
      ...p,
      porRol,
      excepcion,
      efectivo: excepcion === null ? porRol : excepcion,
    };
  });
}

export async function zonasDePersona(userId: string): Promise<ZonaDeUsuario[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('user_zones')
    .select('zone_id, can_collect')
    .eq('user_id', userId);

  if (error) return [];
  return (data ?? []) as ZonaDeUsuario[];
}

export async function listarZonasDetalle(): Promise<ZonaDetalle[]> {
  const supabase = await crearClienteServidor();

  const [{ data: zonas }, { data: clientes }] = await Promise.all([
    supabase.from('zones').select('id, name, code, network_type, is_active').order('name'),
    supabase.from('v_clientes').select('zone_id, status, mensualidad'),
  ]);

  const filas = (clientes ?? []) as {
    zone_id: string;
    status: string;
    mensualidad: number | null;
  }[];

  return ((zonas ?? []) as Record<string, unknown>[]).map((z) => {
    const mios = filas.filter((c) => c.zone_id === z.id);
    return {
      id: z.id as string,
      name: z.name as string,
      code: z.code as string,
      network_type: z.network_type as string,
      is_active: Boolean(z.is_active),
      clientes: mios.length,
      activos: mios.filter((c) => c.status === 'active').length,
      ingreso: mios
        .filter((c) => c.status === 'active')
        .reduce((s, c) => s + Number(c.mensualidad ?? 0), 0),
    };
  });
}

export async function listarPlanes(): Promise<Plan[]> {
  const supabase = await crearClienteServidor();

  const [{ data: planes }, { data: servicios }] = await Promise.all([
    supabase
      .from('service_plans')
      .select(
        'id, code, name, price, download_mbps, upload_mbps, network_type, is_legacy, visible_for_sale, is_active, notes',
      )
      .order('price', { ascending: false }),
    supabase.from('customer_services').select('plan_id').eq('status', 'active'),
  ]);

  const cuenta = new Map<string, number>();
  for (const s of (servicios ?? []) as { plan_id: string }[]) {
    cuenta.set(s.plan_id, (cuenta.get(s.plan_id) ?? 0) + 1);
  }

  return ((planes ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    code: p.code as string,
    name: p.name as string,
    price: Number(p.price ?? 0),
    download_mbps: p.download_mbps === null ? null : Number(p.download_mbps),
    upload_mbps: p.upload_mbps === null ? null : Number(p.upload_mbps),
    network_type: p.network_type as string,
    is_legacy: Boolean(p.is_legacy),
    visible_for_sale: Boolean(p.visible_for_sale),
    is_active: Boolean(p.is_active),
    notes: (p.notes as string) ?? null,
    contratados: cuenta.get(p.id as string) ?? 0,
  }));
}

export async function listarAjustes(): Promise<Ajuste[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('settings')
    .select('key, value, value_type, category, name, description, updated_at')
    .order('category')
    .order('key');

  if (error) return [];
  return (data ?? []) as Ajuste[];
}

export async function listarAuditoria(limite = 100): Promise<MovimientoAuditoria[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, table_name, action, record_id, created_at, user_id, old_values, new_values')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) return [];

  const filas = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(filas.map((f) => f.user_id as string).filter(Boolean))];

  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data: gente } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    for (const p of (gente ?? []) as { id: string; full_name: string }[]) {
      nombres.set(p.id, p.full_name);
    }
  }

  return filas.map((f) => ({
    id: String(f.id),
    table_name: f.table_name as string,
    action: f.action as string,
    record_id: (f.record_id as string) ?? null,
    created_at: f.created_at as string,
    quien: f.user_id ? (nombres.get(f.user_id as string) ?? 'alguien que ya no está') : null,
    cambios: soloLoQueCambio(
      f.old_values as Record<string, unknown> | null,
      f.new_values as Record<string, unknown> | null,
    ),
  }));
}

/**
 * De un update, quedarse solo con los campos que de verdad cambiaron.
 *
 * Sin esto la auditoría enseña las 30 columnas del renglón cada vez que
 * alguien toca una, y encontrar el cambio real se vuelve un juego de "busca
 * las diferencias".
 */
function soloLoQueCambio(
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!antes) return despues;
  if (!despues) return { eliminado: true };

  const cambios: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(despues)) {
    if (k === 'updated_at' || k === 'updated_by') continue;
    if (JSON.stringify(antes[k]) !== JSON.stringify(v)) {
      cambios[k] = { antes: antes[k], ahora: v };
    }
  }
  return Object.keys(cambios).length > 0 ? cambios : null;
}
