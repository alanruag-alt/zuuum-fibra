'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';

/**
 * El archivo ya subió del navegador al Storage; aquí solo se anota.
 *
 * Se hace en dos pasos a propósito: el permiso de subir lo revisa el Storage
 * con sus propias políticas, y el renglón lo revisa la base con las suyas. Si
 * alguna de las dos dice que no, no queda a medias —queda o el archivo
 * huérfano, que se limpia, o nada.
 */
export async function registrarFoto(
  tabla: string,
  registro: string,
  ruta: string,
  bytes: number,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_foto', {
    p_tabla: tabla,
    p_registro: registro,
    p_ruta: ruta,
    p_desc: null,
    p_bytes: bytes,
  });

  if (error) {
    // Si el renglón no entró, el archivo no se queda tirado ocupando espacio.
    await supabase.storage.from('red').remove([ruta]);
    return { ok: false, mensaje: error.message };
  }

  revalidatePath('/red/ftth');
  return { ok: true, mensaje: 'Foto guardada.' };
}

export async function borrarFoto(id: string): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('eliminar_foto', { p_id: id });

  if (error) return { ok: false, mensaje: error.message };

  // La función devuelve la ruta justo para esto: borrar también el archivo.
  if (data) await supabase.storage.from('red').remove([String(data)]);

  revalidatePath('/red/ftth');
  return { ok: true, mensaje: 'Foto borrada.' };
}
