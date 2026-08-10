import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Dispositivo, ElementoRed, Punto, Sitio } from '@/modulos/red/tipos';

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
