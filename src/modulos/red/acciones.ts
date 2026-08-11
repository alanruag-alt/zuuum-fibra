'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';

function limpio(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? '').trim();
}

function numeroOnulo(datos: FormData, campo: string): number | null {
  const v = limpio(datos, campo);
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export async function guardarSitio(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_sitio', {
    p_id: id || null,
    p_nombre: limpio(datos, 'nombre') || null,
    p_tipo: limpio(datos, 'tipo') || 'tower',
    p_zona: limpio(datos, 'zona') || null,
    p_lat: numeroOnulo(datos, 'lat'),
    p_lon: numeroOnulo(datos, 'lon'),
    p_activo: datos.get('activo') !== 'no',
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/wisp');
  revalidatePath('/mapa');
  return { ok: true, mensaje: id ? 'Sitio actualizado.' : 'Sitio dado de alta.' };
}

export async function guardarDispositivo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_dispositivo', {
    p_id: id || null,
    p_nombre: limpio(datos, 'nombre') || null,
    p_tipo: limpio(datos, 'tipo') || 'olt',
    p_sitio: limpio(datos, 'sitio') || null,
    p_zona: limpio(datos, 'zona') || null,
    p_ip: limpio(datos, 'ip') || null,
    p_marca: limpio(datos, 'marca') || null,
    p_modelo: limpio(datos, 'modelo') || null,
    p_activo: datos.get('activo') !== 'no',
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/equipos');
  revalidatePath('/red/wisp');
  return { ok: true, mensaje: id ? 'Equipo actualizado.' : 'Equipo dado de alta.' };
}

export async function guardarElemento(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  const codigo = limpio(datos, 'codigo');

  if (!id && !codigo) return { ok: false, mensaje: 'Falta el código.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_elemento', {
    p_id: id || null,
    p_codigo: codigo || null,
    p_tipo: limpio(datos, 'tipo') || 'nap',
    p_nombre: limpio(datos, 'nombre') || null,
    p_zona: limpio(datos, 'zona') || null,
    p_padre: limpio(datos, 'padre') || null,
    p_puerto_pon: limpio(datos, 'puerto_pon') || null,
    p_capacidad: numeroOnulo(datos, 'capacidad'),
    p_lat: numeroOnulo(datos, 'lat'),
    p_lon: numeroOnulo(datos, 'lon'),
    p_notas: limpio(datos, 'notas') || null,
    p_activo: datos.get('activo') !== 'no',
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/ftth');
  revalidatePath('/mapa');
  return { ok: true, mensaje: id ? 'Elemento actualizado.' : 'Elemento dado de alta.' };
}

/**
 * Borrar.
 *
 * La base decide si se puede o no, y cuando se niega devuelve un mensaje que
 * ya dice qué hay que hacer primero. Aquí no se vuelve a decidir nada: se
 * pasa el recado tal cual.
 */
async function borrar(
  rpc: 'eliminar_sitio' | 'eliminar_dispositivo' | 'eliminar_elemento',
  id: string,
  rutas: string[],
): Promise<Respuesta> {
  if (!id) return { ok: false, mensaje: 'Falta cuál.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc(rpc, { p_id: id });

  if (error) return { ok: false, mensaje: error.message };

  rutas.forEach((r) => revalidatePath(r));
  return { ok: true, mensaje: `${data ?? 'Listo'}: borrado.` };
}

export async function eliminarSitio(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  return borrar('eliminar_sitio', limpio(datos, 'id'), ['/red/wisp', '/red/equipos', '/mapa']);
}

export async function eliminarDispositivo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  return borrar('eliminar_dispositivo', limpio(datos, 'id'), ['/red/equipos', '/red/wisp']);
}

export async function eliminarElemento(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  return borrar('eliminar_elemento', limpio(datos, 'id'), ['/red/ftth', '/mapa']);
}
