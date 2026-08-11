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
  revalidatePath('/red/ftth/sitio');
  revalidatePath('/red/ftth');
  revalidatePath('/red/equipos');
  revalidatePath('/red/wisp');
}

/**
 * Todo lo de esta pantalla devuelve el recado que arma la base.
 *
 * La base es la que sabe si el PON ya estaba puesto en otro lado, y en su
 * mensaje ya viene dónde. Volver a redactarlo aquí solo serviría para decir
 * menos.
 */
export async function abrirTarjeta(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const olt = limpio(datos, 'olt');
  if (!olt) return { ok: false, mensaje: 'Elige la OLT.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('abrir_tarjeta', {
    p_olt: olt,
    p_slot: num(datos, 'slot') ?? 1,
    p_tipo: limpio(datos, 'tipo') || null,
    p_puertos: num(datos, 'puertos') ?? 16,
    p_desde_cero: datos.get('desde_cero') === 'si',
    p_max_onus: num(datos, 'max_onus') ?? 128,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  return {
    ok: true,
    mensaje: 'Tarjeta dada de alta con sus puertos PON. Ya los puedes patchear al ODF.',
  };
}

export async function abrirPuertosOdf(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const odf = limpio(datos, 'odf');
  if (!odf) return { ok: false, mensaje: 'Elige el ODF.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('abrir_puertos_odf', {
    p_odf: odf,
    p_bandejas: num(datos, 'bandejas') ?? 1,
    p_por_bandeja: num(datos, 'por_bandeja') ?? 12,
    p_conector: limpio(datos, 'conector') || 'SC/APC',
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  const n = Number(data ?? 0);
  return {
    ok: true,
    mensaje:
      n === 0
        ? 'Esos puertos ya existían: no se tocó ninguno.'
        : `${n} puertos abiertos en el ODF.`,
  };
}

export async function patchear(_anterior: Respuesta | null, datos: FormData): Promise<Respuesta> {
  const pon = limpio(datos, 'pon');
  const puerto = limpio(datos, 'puerto');
  if (!pon || !puerto) return { ok: false, mensaje: 'Falta el PON o el puerto del ODF.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('patchear', {
    p_pon: pon,
    p_odf_port: puerto,
    p_potencia: num(datos, 'potencia'),
    p_notas: limpio(datos, 'notas') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  return { ok: true, mensaje: String(data ?? 'Latiguillo puesto.') };
}

export async function despatchear(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('despatchear', {
    p_odf_port: limpio(datos, 'id'),
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  return { ok: true, mensaje: String(data ?? 'Latiguillo quitado.') };
}

export async function arrancarCable(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const puerto = limpio(datos, 'puerto');
  const hilo = limpio(datos, 'hilo');
  if (!puerto || !hilo) return { ok: false, mensaje: 'Falta el puerto o el hilo.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('arrancar_cable', {
    p_odf_port: puerto,
    p_hilo: hilo,
    p_potencia: num(datos, 'potencia'),
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  revalidatePath('/red/ftth/cables');
  return { ok: true, mensaje: String(data ?? 'Cable amarrado al ODF.') };
}

export async function soltarCable(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('soltar_cable', {
    p_odf_port: limpio(datos, 'id'),
  });

  if (error) return { ok: false, mensaje: error.message };

  refrescar();
  revalidatePath('/red/ftth/cables');
  return { ok: true, mensaje: String(data ?? 'Listo.') };
}
