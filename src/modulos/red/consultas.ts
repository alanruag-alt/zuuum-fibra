import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Dispositivo, ElementoRed, Punto, Sitio, Trazo } from '@/modulos/red/tipos';

export async function listarElementos(tipos?: string[]): Promise<ElementoRed[]> {
  const supabase = await crearClienteServidor();
  let q = supabase.from('v_elementos_red').select('*').order('code');
  if (tipos?.length) q = q.in('element_type', tipos);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as ElementoRed[];
}

export async function listarDispositivos(tipos?: string[]): Promise<Dispositivo[]> {
  const supabase = await crearClienteServidor();
  let q = supabase.from('v_dispositivos').select('*').order('name');
  if (tipos?.length) q = q.in('device_type', tipos);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Dispositivo[];
}

export async function listarSitios(): Promise<Sitio[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_sitios')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name');

  if (error) return [];
  return (data ?? []) as Sitio[];
}

/**
 * Los puntos del mapa.
 *
 * No se dibujan los 1,102 clientes: en un pueblo salen todos encimados y no se
 * entiende nada. Se dibuja la infraestructura —torres, casetas, NAP— que es lo
 * que uno necesita ver cuando algo se cayó y hay que ir a arreglarlo.
 */
export async function puntosDelMapa(): Promise<Punto[]> {
  const [sitios, elementos] = await Promise.all([listarSitios(), listarElementos()]);
  const puntos: Punto[] = [];

  for (const s of sitios) {
    if (s.latitude === null || s.longitude === null) continue;
    puntos.push({
      id: `s:${s.id}`,
      clase: 'sitio',
      nombre: s.name,
      detalle:
        [s.zona, s.dispositivos > 0 ? `${s.dispositivos} equipos` : null]
          .filter(Boolean)
          .join(' · ') || null,
      lat: Number(s.latitude),
      lon: Number(s.longitude),
      tono: s.caidos > 0 ? 'falla' : 'marca',
    });
  }

  for (const e of elementos) {
    if (e.latitude === null || e.longitude === null) continue;
    puntos.push({
      id: `e:${e.id}`,
      clase: 'elemento',
      nombre: e.code,
      detalle:
        [e.zona, e.capacity ? `${e.used_ports}/${e.capacity}` : null].filter(Boolean).join(' · ') ||
        null,
      lat: Number(e.latitude),
      lon: Number(e.longitude),
      tono: e.semaforo === 'lleno' ? 'falla' : e.semaforo === 'por_llenarse' ? 'aviso' : 'ok',
    });
  }

  return puntos;
}

/**
 * Los trazos de los cables, para dibujarlos y no solo marcar sus extremos.
 *
 * Un mapa con puntos sueltos no dice por dónde va la fibra; con la línea, sí.
 * Es la diferencia entre saber que hay una NAP en esa calle y saber por cuál
 * banqueta subió el cable.
 */
export async function trazosDelMapa(): Promise<Trazo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('fiber_cables')
    .select('id, code, path, plan_color, zones(name)')
    .eq('is_active', true)
    .not('path', 'is', null);

  if (error) return [];

  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((c) => {
      const z = Array.isArray(c.zones) ? c.zones[0] : c.zones;
      const pts = (c.path as [number, number][] | null) ?? [];
      return {
        id: c.id as string,
        codigo: c.code as string,
        color: (c.plan_color as string) ?? null,
        zona: (z as { name?: string })?.name ?? null,
        puntos: pts,
      };
    })
    .filter((t) => t.puntos.length >= 2);
}

/** Los postes con coordenadas, para que el mapa muestre por dónde va colgada. */
export async function postesDelMapa(): Promise<Punto[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('v_postes')
    .select('id, number, latitude, longitude, cable, is_new')
    .eq('is_active', true)
    .not('latitude', 'is', null)
    .limit(3000);

  if (error) return [];

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => ({
    id: `p:${p.id as string}`,
    clase: 'poste' as const,
    nombre: String(p.number ?? ''),
    detalle: (p.cable as string) ?? null,
    lat: Number(p.latitude),
    lon: Number(p.longitude),
    tono: (p.is_new ? 'aviso' : 'neutro') as 'aviso' | 'neutro',
  }));
}
