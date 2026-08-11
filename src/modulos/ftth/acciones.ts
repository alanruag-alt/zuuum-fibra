'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';

function limpio(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? '').trim();
}

function num(datos: FormData, campo: string): number | null {
  const v = limpio(datos, campo);
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export async function guardarCable(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  const hilos = num(datos, 'hilos');

  if (!id && !hilos) return { ok: false, mensaje: 'Falta cuántos hilos trae.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_cable', {
    p_id: id || null,
    p_codigo: limpio(datos, 'codigo') || null,
    p_tipo: limpio(datos, 'tipo') || 'adss',
    p_hilos: hilos,
    p_zona: limpio(datos, 'zona') || null,
    p_de_texto: limpio(datos, 'de_texto') || null,
    p_de_tipo: limpio(datos, 'de_tipo') || null,
    p_de_id: limpio(datos, 'de_id') || null,
    p_a_texto: limpio(datos, 'a_texto') || null,
    p_a_tipo: limpio(datos, 'a_tipo') || null,
    p_a_id: limpio(datos, 'a_id') || null,
    p_metros: num(datos, 'metros'),
    p_color: limpio(datos, 'color') || null,
    p_notas: limpio(datos, 'notas') || null,
    p_activo: datos.get('activo') !== 'no',
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/cables');
  revalidatePath('/red/ftth');
  return {
    ok: true,
    mensaje: id
      ? 'Cable actualizado.'
      : `Cable dado de alta con sus ${hilos} hilos, cada uno con su color de norma.`,
  };
}

export async function guardarHilo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  if (!id) return { ok: false, mensaje: 'Falta el hilo.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_hilo', {
    p_id: id,
    p_estado: limpio(datos, 'estado') || null,
    p_notas: limpio(datos, 'notas') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/cables');
  return { ok: true, mensaje: 'Hilo actualizado.' };
}

export async function guardarFusion(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  const caja = limpio(datos, 'caja');
  const entrada = limpio(datos, 'entrada');
  const hacia = limpio(datos, 'hacia'); // 'hilo' | 'elemento'
  const salida = hacia === 'hilo' ? limpio(datos, 'salida') : '';
  const destino = hacia === 'elemento' ? limpio(datos, 'destino') : '';

  if (!id) {
    if (!caja || !entrada) return { ok: false, mensaje: 'Falta la caja o el hilo que entra.' };
    if (!salida && !destino) {
      return { ok: false, mensaje: 'Di a dónde va: a otro hilo, o a una NAP o splitter.' };
    }
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_fusion', {
    p_id: id || null,
    p_caja: caja || null,
    p_entrada: entrada || null,
    p_salida: salida || null,
    p_destino: destino || null,
    p_tipo: limpio(datos, 'tipo') || 'fusion',
    p_perdida: num(datos, 'perdida'),
    p_estado: limpio(datos, 'estado') || 'activa',
    p_notas: limpio(datos, 'notas') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/fusiones');
  revalidatePath('/red/ftth/cables');
  return { ok: true, mensaje: id ? 'Fusión actualizada.' : 'Fusión registrada.' };
}

export async function eliminarFusion(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  if (!id) return { ok: false, mensaje: 'Falta la fusión.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('eliminar_fusion', { p_id: id });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/fusiones');
  revalidatePath('/red/ftth/cables');
  return { ok: true, mensaje: 'Fusión borrada. Los hilos quedaron libres otra vez.' };
}

/**
 * Poner o quitar un cliente de un puerto.
 *
 * La clave del cliente es lo que trae escrito el técnico en la orden, así que
 * eso es lo que se pide. El uuid lo resuelve el servidor.
 */
export async function asignarPuerto(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const nap = limpio(datos, 'nap');
  const puerto = num(datos, 'puerto');
  const codigo = limpio(datos, 'codigo').toUpperCase();
  const soltar = datos.get('soltar') === 'si';

  if (!nap || puerto === null) return { ok: false, mensaje: 'Falta la NAP o el puerto.' };

  const supabase = await crearClienteServidor();
  let servicio: string | null = null;

  if (!soltar) {
    if (!codigo) return { ok: false, mensaje: 'Falta la clave del cliente.' };

    const { data, error } = await supabase
      .from('customer_services')
      .select('id, customers!inner(customer_code)')
      .eq('customers.customer_code', codigo)
      .in('status', ['active', 'pending']);

    if (error) return { ok: false, mensaje: error.message };

    const filas = (data ?? []) as unknown as { id: string }[];
    if (filas.length === 0) {
      return { ok: false, mensaje: `No hay ningún servicio a nombre de ${codigo}.` };
    }
    if (filas.length > 1) {
      return {
        ok: false,
        mensaje: `${codigo} tiene ${filas.length} servicios. Asígnalo desde su expediente para no equivocarte de línea.`,
      };
    }
    servicio = filas[0].id;
  }

  const { error } = await supabase.rpc('asignar_puerto_nap', {
    p_nap: nap,
    p_puerto: puerto,
    p_servicio: servicio,
    p_rx: num(datos, 'rx'),
    p_estado: soltar ? 'libre' : null,
    p_notas: limpio(datos, 'notas') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/naps');
  revalidatePath('/red/ftth');
  revalidatePath('/clientes');

  return {
    ok: true,
    mensaje: soltar ? `Puerto ${puerto} liberado.` : `${codigo} quedó en el puerto ${puerto}.`,
  };
}

/** Decir de qué hilo cuelga una NAP. Sin esto no se puede trazar nada. */
export async function alimentarNap(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const nap = limpio(datos, 'nap');
  const hilo = limpio(datos, 'hilo');

  if (!nap) return { ok: false, mensaje: 'Falta la NAP.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('network_elements')
    .update({ feed_strand_id: hilo || null, input_dbm: num(datos, 'entrada') })
    .eq('id', nap);

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/naps');
  revalidatePath('/red/ftth/traza');
  return { ok: true, mensaje: hilo ? 'Ya se sabe de qué hilo cuelga.' : 'Hilo desligado.' };
}

/**
 * Borrar un cable.
 *
 * La base revisa que no haya fusiones, NAP colgadas ni hilos en servicio, y si
 * los hay dice cuáles. Los postes no estorban: se sueltan, porque siguen
 * existiendo en la calle aunque el cable se haya capturado mal.
 */
export async function eliminarCable(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  if (!id) return { ok: false, mensaje: 'Falta el cable.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('eliminar_cable', { p_id: id });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/cables');
  revalidatePath('/red/ftth/mapa');
  revalidatePath('/red/posteria');
  return { ok: true, mensaje: `${data}: borrado.` };
}

export async function borrarTrazo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  if (!id) return { ok: false, mensaje: 'Falta el cable.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('borrar_trazo', { p_cable: id });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth/cables');
  revalidatePath('/red/ftth/mapa');
  revalidatePath('/red/posteria');
  return {
    ok: true,
    mensaje: 'Trazo borrado. Los postes que iban sobre él quedaron sueltos.',
  };
}

export async function eliminarEquipo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  if (!id) return { ok: false, mensaje: 'Falta el equipo.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('eliminar_equipo', { p_id: id });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/inventario/series');
  revalidatePath('/inventario');
  return { ok: true, mensaje: `${data}: borrado.` };
}
