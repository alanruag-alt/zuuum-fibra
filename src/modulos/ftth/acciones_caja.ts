'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { CableEnCaja, FusionDeCaja, HiloEnCaja } from '@/modulos/ftth/caja_tipos';

function refrescar() {
  revalidatePath('/red/ftth/caja');
  revalidatePath('/red/ftth/fusiones');
  revalidatePath('/red/ftth/cables');
  revalidatePath('/red/ftth/naps');
  revalidatePath('/red/ftth');
}

/**
 * Empalmar arrastrando.
 *
 * La pantalla manda los dos hilos en el orden en que el técnico los tocó. La
 * base decide cuál alimenta a cuál —el que ya trae luz— y devuelve el recado
 * ya redactado. Aquí no se vuelve a redactar nada: el mensaje de la base ya
 * dice qué quedó pegado con qué y, cuando tuvo que adivinar, lo avisa.
 */
export async function empalmarHilos(
  caja: string,
  a: string,
  b: string,
  extra?: { tipo?: string; perdida?: number | null; notas?: string | null },
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('empalmar', {
    p_caja: caja,
    p_a: a,
    p_b: b,
    p_tipo: extra?.tipo ?? 'fusion',
    p_perdida: extra?.perdida ?? null,
    p_notas: extra?.notas ?? null,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: String(data ?? 'Empalmado.') };
}

/** Arrastrar un hilo hasta la NAP o hasta la entrada de un splitter. */
export async function terminarHilo(
  caja: string,
  hilo: string,
  destino: string,
  potencia?: number | null,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('terminar_hilo', {
    p_caja: caja,
    p_hilo: hilo,
    p_destino: destino,
    p_potencia: potencia ?? null,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: String(data ?? 'Conectado.') };
}

export async function soltarEmpalme(id: string): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('soltar_empalme', { p_id: id });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: String(data ?? 'Empalme soltado.') };
}

export async function engancharCable(caja: string, cable: string): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('enganchar_cable', { p_caja: caja, p_cable: cable });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: 'Cable agregado al dibujo de esta caja.' };
}

export async function soltarCableDeCaja(caja: string, cable: string): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('soltar_cable_de_caja', {
    p_caja: caja,
    p_cable: cable,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: String(data ?? 'Cable quitado del dibujo.') };
}

/** El dibujo completo, para recargarlo sin repintar toda la página. */
export async function traerCaja(caja: string): Promise<{
  cables: CableEnCaja[];
  hilos: HiloEnCaja[];
}> {
  const supabase = await crearClienteServidor();
  const [{ data: cables }, { data: hilos }] = await Promise.all([
    supabase.rpc('cables_en_caja', { p_caja: caja }),
    supabase.rpc('hilos_en_caja', { p_caja: caja }),
  ]);
  return {
    cables: (cables ?? []) as unknown as CableEnCaja[],
    hilos: (hilos ?? []) as unknown as HiloEnCaja[],
  };
}

/** Las fusiones de la caja, para la hoja que se imprime y se deja adentro. */
export async function traerFusionesDeCaja(caja: string): Promise<{
  fusiones: FusionDeCaja[];
  clientes: Record<string, unknown>[];
}> {
  const supabase = await crearClienteServidor();
  const [{ data: fusiones }, { data: clientes }] = await Promise.all([
    supabase.rpc('fusiones_de_caja', { p_caja: caja }),
    supabase.rpc('clientes_de_caja', { p_caja: caja }),
  ]);
  return {
    fusiones: (fusiones ?? []) as unknown as FusionDeCaja[],
    clientes: (clientes ?? []) as unknown as Record<string, unknown>[],
  };
}
