'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';

function refrescar() {
  revalidatePath('/red/ftth/mapa');
  revalidatePath('/red/ftth');
  revalidatePath('/mapa');
}

export async function guardarVistaZona(
  zona: string,
  lat: number,
  lon: number,
  zoom: number,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_vista_zona', {
    p_zona: zona,
    p_lat: lat,
    p_lon: lon,
    p_zoom: zoom,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/mapa');
  return { ok: true, mensaje: 'Así se va a abrir el mapa de esta zona de aquí en adelante.' };
}

export async function colocarElemento(
  tipo: 'nap' | 'closure' | 'odf',
  codigo: string,
  zona: string,
  lat: number,
  lon: number,
  capacidad: number | null,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_elemento', {
    p_codigo: codigo.toUpperCase(),
    p_tipo: tipo,
    p_zona: zona,
    p_capacidad: capacidad,
    p_lat: lat,
    p_lon: lon,
  });

  if (error) return { ok: false, mensaje: error.message };

  // Los puertos de una NAP nacen con ella: así se le puede meter gente de una
  // vez, sin tener que pasar por otra pantalla.
  refrescar();
  return {
    ok: true,
    mensaje: `${codigo.toUpperCase()} quedó puesta ahí.`,
  };
}

export async function colocarPoste(zona: string, lat: number, lon: number): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_poste', {
    p_lat: lat,
    p_lon: lon,
    p_tipo: 'cfe_concreto',
    p_zona: zona,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  revalidatePath('/red/posteria');
  return {
    ok: true,
    mensaje:
      'Poste puesto. Cuando termines, dale a «Renumerar» en Postería para que agarre su número y su vano.',
  };
}

export async function guardarTrazo(cable: string, ruta: [number, number][]): Promise<Respuesta> {
  if (ruta.length < 2) return { ok: false, mensaje: 'Marca al menos dos puntos.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('guardar_trazo', {
    p_cable: cable,
    p_ruta: ruta,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  revalidatePath('/red/ftth/cables');
  revalidatePath('/red/posteria');

  const m = Number(data ?? 0);
  return {
    ok: true,
    mensaje: `Trazo guardado: ${Math.round(m)} m. La longitud del cable se actualizó con esa medida.`,
  };
}

/**
 * Mover un punto a su lugar correcto.
 *
 * Casi siempre es porque se capturó con el GPS del celular parado en la
 * banqueta de enfrente. Se corrige arrastrando, no volviendo a capturar.
 */
export async function moverPunto(
  id: string,
  clase: 'nap' | 'caja' | 'odf' | 'sitio' | 'poste',
  lat: number,
  lon: number,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const [prefijo, real] = id.split(':');

  const tabla = prefijo === 'p' ? 'poles' : prefijo === 's' ? 'network_sites' : 'network_elements';

  const { error } = await supabase
    .from(tabla)
    .update({ latitude: lat, longitude: lon })
    .eq('id', real);

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  revalidatePath('/red/posteria');

  return {
    ok: true,
    mensaje:
      clase === 'poste'
        ? 'Poste movido. Vuelve a renumerar para recalcular su vano.'
        : 'Movido a su lugar.',
  };
}
