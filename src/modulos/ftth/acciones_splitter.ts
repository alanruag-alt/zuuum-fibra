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

function refrescar() {
  // Los splitters ahora se manejan dentro de la caja: hay que revalidar esa
  // ruta dinámica para que el cambio se vea sin recargar a mano.
  revalidatePath('/red/ftth/caja/[id]', 'page');
  revalidatePath('/red/ftth/naps');
  revalidatePath('/red/ftth');
  revalidatePath('/red/ftth/ruta');
}

export async function guardarSplitter(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const caja = limpio(datos, 'caja');
  const codigo = limpio(datos, 'codigo');

  // La caja se pide antes que nada, porque es lo que hace que el splitter
  // exista en algún lado. La base también lo exige; aquí se dice más bonito.
  if (!caja) {
    return {
      ok: false,
      mensaje: 'Primero elige la caja donde va montado el splitter.',
    };
  }
  if (!codigo) return { ok: false, mensaje: 'Falta el código del splitter.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('abrir_splitter', {
    p_codigo: codigo,
    p_caja: caja,
    p_razon: limpio(datos, 'razon') || '1x8',
    p_perdida: num(datos, 'perdida'),
    p_notas: limpio(datos, 'notas') || null,
    p_id: limpio(datos, 'id') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  return {
    ok: true,
    mensaje: `${codigo.toUpperCase()} quedó con sus salidas listas. Ahora dile de dónde le entra la luz.`,
  };
}

export async function alimentarSplitter(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('alimentar_splitter', {
    p_splitter: limpio(datos, 'splitter'),
    p_hilo: limpio(datos, 'hilo') || null,
    p_odf_port: limpio(datos, 'odf_port') || null,
    p_salida: limpio(datos, 'salida_padre') || null,
    p_potencia: num(datos, 'potencia'),
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  return { ok: true, mensaje: String(data ?? 'Alimentado.') };
}

export async function conectarSalida(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('conectar_salida', {
    p_salida: limpio(datos, 'salida'),
    p_hilo: limpio(datos, 'hilo') || null,
    p_nap: limpio(datos, 'nap') || null,
    p_nap_port: limpio(datos, 'nap_port') || null,
    p_potencia: num(datos, 'potencia'),
    p_estado: limpio(datos, 'estado') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  return { ok: true, mensaje: String(data ?? 'Salida conectada.') };
}

export async function alimentarNap(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('alimentar_nap', {
    p_nap: limpio(datos, 'nap'),
    p_hilo: limpio(datos, 'hilo') || null,
    p_salida: limpio(datos, 'salida') || null,
    p_potencia: num(datos, 'potencia'),
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  return { ok: true, mensaje: String(data ?? 'NAP alimentada.') };
}

export async function eliminarSplitter(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('eliminar_splitter', {
    p_id: limpio(datos, 'id'),
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  return { ok: true, mensaje: `${data ?? 'Splitter'}: borrado.` };
}
