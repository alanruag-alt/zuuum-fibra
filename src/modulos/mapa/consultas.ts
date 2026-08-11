import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import {
  VISTA_POR_DEFECTO,
  type PuntoMapa,
  type TrazoMapa,
  type VistaZona,
} from '@/modulos/mapa/tipos';

const COLORES = {
  nap_lleno: '#dc2626',
  nap_casi: '#d97706',
  nap: '#16a34a',
  caja: '#7c3aed',
  odf: '#f2820c',
  sitio: '#f2820c',
  poste: '#1e40af',
  poste_nuevo: '#d97706',
};

/**
 * Todo lo que se dibuja de una zona.
 *
 * Se pide por zona a propósito: Cuencamé, Velardeña y Pasaje están a
 * kilómetros unas de otras, y traer las tres juntas obliga a ver el mapa desde
 * tan lejos que no se distingue un poste de otro.
 */
export async function puntosDeZona(zonaId: string): Promise<PuntoMapa[]> {
  const supabase = await crearClienteServidor();
  const salida: PuntoMapa[] = [];

  const { data: elementos } = await supabase
    .from('v_elementos_red')
    .select('id, code, name, element_type, latitude, longitude, capacity, used_ports, semaforo')
    .eq('zone_id', zonaId)
    .eq('is_active', true)
    .not('latitude', 'is', null);

  for (const e of (elementos ?? []) as unknown as Record<string, unknown>[]) {
    const tipo = e.element_type as string;
    const clase =
      tipo === 'nap' ? 'nap' : tipo === 'odf' ? 'odf' : tipo === 'closure' ? 'caja' : 'caja';
    const sem = e.semaforo as string;
    salida.push({
      id: `e:${e.id as string}`,
      clase: clase as PuntoMapa['clase'],
      nombre: e.code as string,
      detalle:
        [e.name as string, e.capacity ? `${e.used_ports}/${e.capacity} puertos` : null]
          .filter(Boolean)
          .join(' · ') || null,
      lat: Number(e.latitude),
      lon: Number(e.longitude),
      color:
        clase === 'nap'
          ? sem === 'lleno'
            ? COLORES.nap_lleno
            : sem === 'por_llenarse'
              ? COLORES.nap_casi
              : COLORES.nap
          : clase === 'odf'
            ? COLORES.odf
            : COLORES.caja,
    });
  }

  const { data: sitios } = await supabase
    .from('v_sitios')
    .select('id, name, type, latitude, longitude')
    .eq('zone_id', zonaId)
    .eq('is_active', true)
    .not('latitude', 'is', null);

  for (const s of (sitios ?? []) as unknown as Record<string, unknown>[]) {
    salida.push({
      id: `s:${s.id as string}`,
      clase: 'sitio',
      nombre: s.name as string,
      detalle: (s.type as string) ?? null,
      lat: Number(s.latitude),
      lon: Number(s.longitude),
      color: COLORES.sitio,
    });
  }

  const { data: postes } = await supabase
    .from('v_postes')
    .select('id, number, latitude, longitude, cable, is_new, span_m')
    .eq('zone_id', zonaId)
    .eq('is_active', true)
    .not('latitude', 'is', null)
    .limit(3000);

  for (const p of (postes ?? []) as unknown as Record<string, unknown>[]) {
    salida.push({
      id: `p:${p.id as string}`,
      clase: 'poste',
      nombre: String(p.number ?? '·'),
      detalle:
        [p.cable as string, p.span_m ? `vano ${Math.round(Number(p.span_m))} m` : null]
          .filter(Boolean)
          .join(' · ') || null,
      lat: Number(p.latitude),
      lon: Number(p.longitude),
      color: p.is_new ? COLORES.poste_nuevo : COLORES.poste,
    });
  }

  return salida;
}

export async function trazosDeZona(zonaId: string): Promise<TrazoMapa[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('fiber_cables')
    .select('id, code, path, plan_color')
    .eq('zone_id', zonaId)
    .eq('is_active', true)
    .not('path', 'is', null);

  if (error) return [];

  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((c) => ({
      id: c.id as string,
      codigo: c.code as string,
      color: (c.plan_color as string) ?? null,
      puntos: ((c.path as [number, number][] | null) ?? []) as [number, number][],
    }))
    .filter((t) => t.puntos.length >= 2);
}

/**
 * Dónde abrir el mapa de esta zona.
 *
 * Primero lo que el usuario dejó guardado. Si nunca lo ha encuadrado, se
 * calcula del centro de lo que ya hay capturado, que casi siempre acierta. Y
 * si la zona está vacía, Cuencamé.
 */
export async function vistaDeZona(zonaId: string): Promise<VistaZona> {
  const supabase = await crearClienteServidor();

  const { data: zona } = await supabase
    .from('zones')
    .select('map_view')
    .eq('id', zonaId)
    .maybeSingle();

  const guardada = (zona as { map_view?: VistaZona } | null)?.map_view;
  if (guardada?.lat && guardada?.lon) {
    return {
      lat: Number(guardada.lat),
      lon: Number(guardada.lon),
      zoom: Number(guardada.zoom) || 15,
    };
  }

  const puntos = await puntosDeZona(zonaId);
  if (puntos.length === 0) return VISTA_POR_DEFECTO;

  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lon = (Math.min(...lons) + Math.max(...lons)) / 2;

  // Acercamiento aproximado según qué tan esparcido está lo capturado.
  const ancho = Math.max(
    Math.max(...lons) - Math.min(...lons),
    Math.max(...lats) - Math.min(...lats),
  );
  const zoom = ancho > 0.08 ? 12 : ancho > 0.03 ? 13 : ancho > 0.012 ? 14 : ancho > 0.005 ? 15 : 16;

  return { lat, lon, zoom };
}

/**
 * ¿Esta persona puede tocar la red?
 *
 * Solo sirve para decidir qué botones se dibujan. Quien manipule esto desde la
 * consola del navegador no logra nada: la base vuelve a revisar el permiso en
 * cada función, y ahí sí es en serio.
 */
export async function puedeEditarRed(): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('auth_has', { p_permiso: 'network.write' });
  if (error) return false;
  return Boolean(data);
}
