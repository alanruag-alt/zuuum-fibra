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
    mensaje:
      tipo === 'odf'
        ? `${codigo.toUpperCase()} quedó puesto ahí.`
        : `${codigo.toUpperCase()} quedó pegada a la fibra.`,
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

export async function guardarTrazo(
  cable: string,
  ruta: [number, number][],
  modo: 'reemplazar' | 'continuar' = 'reemplazar',
): Promise<Respuesta> {
  if (ruta.length < 2) return { ok: false, mensaje: 'Marca al menos dos puntos.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('guardar_trazo', {
    p_cable: cable,
    p_ruta: ruta,
    p_modo: modo,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  revalidatePath('/red/ftth/cables');
  revalidatePath('/red/posteria');

  // El recado lo arma la base, porque es la única que sabe qué había antes.
  return { ok: true, mensaje: String(data ?? 'Trazo guardado.') };
}

/**
 * Un ramal nuevo desde una caja.
 *
 * De una caja de empalme salen varios cables; ese es el chiste de la caja. Sin
 * esto, para dibujar el segundo ramal había que ir a «Cables», darlo de alta,
 * volver al mapa y buscarlo —cuatro pasos— y lo natural era agarrar el cable
 * que ya estaba seleccionado y dibujar encima. Ahí se perdía el troncal.
 */
export async function ramalDesde(
  elemento: string,
  codigo: string,
  hilos: number,
  tipo: string,
): Promise<{ ok: boolean; mensaje: string; cable?: string }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('ramal_desde', {
    p_elemento: elemento,
    p_codigo: codigo.toUpperCase(),
    p_tipo: tipo || 'adss',
    p_hilos: hilos,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  revalidatePath('/red/ftth/cables');

  return {
    ok: true,
    cable: String(data),
    mensaje: `${codigo.toUpperCase()} arranca en esa caja. Ve marcando por dónde se va y dale a «Guardar el trazo».`,
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

  // Los elementos de red pasan por su función: ahí es donde vive la regla de
  // que una NAP o una caja no se puede sacar de la fibra ni arrastrando.
  if (prefijo === 'e') {
    const { data, error } = await supabase.rpc('mover_elemento', {
      p_id: real,
      p_lat: lat,
      p_lon: lon,
    });
    if (error) return { ok: false, mensaje: error.message };
    refrescar();
    return { ok: true, mensaje: String(data ?? 'Movido a su lugar.') };
  }

  const tabla = prefijo === 'p' ? 'poles' : 'network_sites';

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
    mensaje: `${codigoNap.toUpperCase()} y su caja ${codigoCaja.toUpperCase()} quedaron pegadas a la fibra. Las fusiones se capturan en la pestaña Fusiones.`,
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

/* ─────────────────────────────────────────── derivar sobre un cable existente
 * En la calle, un ramal no sale del aire: sale de un nodo puesto sobre el
 * cable del que se deriva. Estas tres funciones son ese gesto.
 */

export interface HiloDeCable {
  id: string;
  numero: number;
  color: string;
  tubo: number;
  estado: string;
  ocupado: string | null;
  cortado: string | null;
}

export async function hilosDeCable(cable: string): Promise<HiloDeCable[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('hilos_de_cable', { p_cable: cable });
  if (error) return [];
  return (data ?? []) as unknown as HiloDeCable[];
}

export async function insertarCajaEnCable(
  cable: string,
  lat: number,
  lon: number,
  codigo: string,
  nombre: string | null,
  hilos: string[],
  esNap: boolean,
  puertos: number,
): Promise<{ ok: boolean; mensaje: string; caja?: string }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('insertar_caja_en_cable', {
    p_cable: cable,
    p_lat: lat,
    p_lon: lon,
    p_codigo: codigo,
    p_nombre: nombre,
    p_hilos: hilos.length ? hilos : null,
    p_nap: esNap,
    p_puertos: puertos,
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as
    | { caja_id: string; cortados: number; en_metro: number }
    | undefined;
  if (!r) return { ok: false, mensaje: 'No se pudo insertar la caja.' };

  refrescar();
  revalidatePath('/red/ftth/cables');

  return {
    ok: true,
    caja: r.caja_id,
    mensaje:
      `${codigo.toUpperCase()} quedó sobre la línea, en el metro ${Math.round(r.en_metro)} del cable` +
      (r.cortados > 0
        ? ` · ${r.cortados} ${r.cortados === 1 ? 'hilo cortado ahí' : 'hilos cortados ahí'}.`
        : '. No se cortó ningún hilo: todos siguen de largo.'),
  };
}

/**
 * Terminar la ruta.
 *
 * La pregunta al cerrar es una sola: ¿cable nuevo, o la trayectoria de uno que
 * ya existe? Y en los dos casos el cable queda enganchado a las cajas de sus
 * extremos, que es lo que después deja abrirlas y empalmar adentro.
 */
export async function cerrarRuta(
  ruta: [number, number][],
  opciones: {
    cable?: string | null;
    codigo?: string;
    hilos?: number;
    tipo?: string;
    zona?: string;
    deriva?: string | null;
  },
): Promise<Respuesta> {
  if (ruta.length < 2) return { ok: false, mensaje: 'Marca al menos dos puntos.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('cerrar_ruta', {
    p_ruta: ruta,
    p_cable: opciones.cable ?? null,
    p_codigo: opciones.codigo ?? null,
    p_hilos: opciones.hilos ?? 12,
    p_tipo: opciones.tipo ?? 'adss',
    p_zona: opciones.zona ?? null,
    p_deriva: opciones.deriva ?? null,
    p_margen: 35,
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as
    | { codigo: string; metros: number; enganchadas: string | null }
    | undefined;
  if (!r) return { ok: false, mensaje: 'No se pudo guardar la ruta.' };

  refrescar();
  revalidatePath('/red/ftth/cables');
  revalidatePath('/red/posteria');

  return {
    ok: true,
    mensaje:
      `${r.codigo}: ${Math.round(r.metros)} m guardados.` +
      (r.enganchadas
        ? ` Quedó conectado al diagrama de ${r.enganchadas}, así que ya puedes abrir esa caja y empalmar.`
        : ' No quedó ninguna caja en sus extremos: si va a empalmar en alguna, ponla sobre la línea.'),
  };
}
