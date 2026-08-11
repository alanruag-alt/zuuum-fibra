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

export async function colocarSitio(
  zona: string,
  nombre: string,
  tipo: string,
  lat: number,
  lon: number,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_sitio', {
    p_nombre: nombre,
    p_tipo: tipo || 'tower',
    p_zona: zona,
    p_lat: lat,
    p_lon: lon,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  revalidatePath('/red/wisp');
  return { ok: true, mensaje: `${nombre} quedó puesto ahí.` };
}

/**
 * NAP y caja de empalme en el mismo punto.
 *
 * Es lo más común en la calle: la NAP va colgada de una caja donde se hace el
 * empalme. Ponerlas por separado obliga a dar dos veces el mismo clic y a
 * acertarle dos veces al mismo poste.
 */
export async function colocarNapConCaja(
  codigoNap: string,
  codigoCaja: string,
  zona: string,
  lat: number,
  lon: number,
  puertos: number,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();

  const { error: e1 } = await supabase.rpc('guardar_elemento', {
    p_codigo: codigoCaja.toUpperCase(),
    p_tipo: 'closure',
    p_zona: zona,
    p_lat: lat,
    p_lon: lon,
  });
  if (e1) return { ok: false, mensaje: e1.message };

  const { error: e2 } = await supabase.rpc('guardar_elemento', {
    p_codigo: codigoNap.toUpperCase(),
    p_tipo: 'nap',
    p_zona: zona,
    p_capacidad: puertos,
    p_lat: lat,
    p_lon: lon,
  });
  if (e2) return { ok: false, mensaje: e2.message };

  refrescar();
  return {
    ok: true,
    mensaje: `${codigoNap.toUpperCase()} y su caja ${codigoCaja.toUpperCase()} quedaron ahí. Las fusiones se capturan en la pestaña Fusiones.`,
  };
}

export interface Corte {
  lat: number;
  lon: number;
  geo_m: number;
  otdr_m: number;
  sobra_m: number;
  paso_de_largo: boolean;
  cerca_de: string | null;
  a_metros: number;
  reservas: string;
}

/**
 * Dónde está el corte, en metros de calle.
 *
 * El OTDR mide fibra, no banqueta: sus metros incluyen todo lo que se dejó
 * enrollado. Esta cuenta descuenta cada reserva que la luz atravesó para
 * poner el punto donde de verdad hay que abrir.
 */
export async function diagnosticarCorte(
  cable: string,
  metros: number,
  desdeInicio: boolean,
  descontar: boolean,
): Promise<{ ok: boolean; mensaje: string; corte?: Corte }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('diagnosticar_corte', {
    p_cable: cable,
    p_metros: metros,
    p_desde_inicio: desdeInicio,
    p_descontar: descontar,
  });

  if (error) return { ok: false, mensaje: error.message };

  const c = (Array.isArray(data) ? data[0] : data) as Corte | undefined;
  if (!c) return { ok: false, mensaje: 'No se pudo calcular el punto.' };

  if (c.paso_de_largo) {
    return {
      ok: true,
      corte: c,
      mensaje:
        `Con ${metros} m el corte queda ${Math.round(c.sobra_m)} m MÁS ALLÁ de donde termina ` +
        'el trazo dibujado. O el cable sigue y falta dibujarlo, o el OTDR está midiendo otro tramo.',
    };
  }

  return {
    ok: true,
    corte: c,
    mensaje:
      `El corte cae en el metro ${Math.round(c.geo_m)} de calle` +
      (c.cerca_de ? `, a ${Math.round(c.a_metros)} m de ${c.cerca_de}` : '') +
      `. Se descontaron ${c.reservas}.`,
  };
}

export async function perfilDelCable(
  cable: string,
): Promise<{ geo_m: number; otdr_m: number; postes: number; cajas: number } | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('perfil_cable', { p_cable: cable });
  if (error) return null;
  return (Array.isArray(data) ? data[0] : data) ?? null;
}
