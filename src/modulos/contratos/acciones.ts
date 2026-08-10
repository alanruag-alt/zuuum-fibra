'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';

function limpio(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? '').trim();
}

export async function generarContrato(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const servicio = limpio(datos, 'servicio');
  if (!servicio) return { ok: false, mensaje: 'Falta el servicio.' };

  const meses = limpio(datos, 'meses');

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('generar_contrato', {
    p_servicio: servicio,
    p_inicio: limpio(datos, 'inicio') || null,
    p_meses: meses ? Number(meses) : null,
    p_activar: datos.get('borrador') !== 'si',
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as { contract_number?: string } | undefined;

  revalidatePath('/contratos');
  revalidatePath('/clientes');
  return { ok: true, mensaje: `Contrato ${r?.contract_number} generado.` };
}

export async function firmarContrato(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const contrato = limpio(datos, 'contrato');
  if (!contrato) return { ok: false, mensaje: 'Falta el contrato.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('firmar_contrato', {
    p_contrato: contrato,
    p_pdf: limpio(datos, 'pdf') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/contratos');
  return { ok: true, mensaje: 'Contrato marcado como firmado.' };
}

export async function cancelarContrato(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const contrato = limpio(datos, 'contrato');
  const motivo = limpio(datos, 'motivo');

  if (!contrato) return { ok: false, mensaje: 'Falta el contrato.' };
  if (!motivo) return { ok: false, mensaje: 'Un contrato no se cancela sin decir por qué.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('cancelar_contrato', {
    p_contrato: contrato,
    p_motivo: motivo,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/contratos');
  return {
    ok: true,
    mensaje: 'Contrato cancelado. El servicio sigue igual: eso se decide aparte.',
  };
}
