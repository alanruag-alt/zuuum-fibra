'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { RespuestaCobro } from '@/modulos/cobranza/acciones';

/** Igual que en cobranza: todo pasa por las funciones de la base. */

export async function abrirCaja(
  _anterior: RespuestaCobro | null,
  datos: FormData,
): Promise<RespuestaCobro> {
  const zona = String(datos.get('zona') ?? '').trim();

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('abrir_caja', { p_zone: zona || null });

  if (error) return { ok: false, mensaje: traducir(error.message) };

  revalidatePath('/corte-de-caja');
  return { ok: true, mensaje: 'Caja abierta. Lo que cobres se va sumando aquí.' };
}

export async function cerrarCaja(
  _anterior: RespuestaCobro | null,
  datos: FormData,
): Promise<RespuestaCobro> {
  const caja = String(datos.get('caja') ?? '');
  const declarado = Number(datos.get('declarado') ?? -1);
  const notas = String(datos.get('notas') ?? '').trim();

  if (!caja) return { ok: false, mensaje: 'Falta la caja.' };
  if (!Number.isFinite(declarado) || declarado < 0) {
    return { ok: false, mensaje: 'Hay que declarar cuánto efectivo traes, aunque sea cero.' };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('cerrar_caja', {
    p_session: caja,
    p_declarado: declarado,
    p_notas: notas || null,
  });

  if (error) return { ok: false, mensaje: traducir(error.message) };

  const c = (Array.isArray(data) ? data[0] : data) as
    | { esperado_efectivo: number; declarado: number; diferencia: number; pagos: number }
    | undefined;

  revalidatePath('/corte-de-caja');
  revalidatePath('/cobranza');

  const dif = Number(c?.diferencia ?? 0);
  const base = `${c?.pagos ?? 0} pagos · esperado $${Number(c?.esperado_efectivo ?? 0).toFixed(2)}`;

  if (dif === 0) return { ok: true, mensaje: `${base} · cuadra exacto.` };
  if (dif < 0) {
    return {
      ok: true,
      mensaje: `${base} · faltan $${Math.abs(dif).toFixed(2)}. Queda registrado.`,
    };
  }
  return { ok: true, mensaje: `${base} · sobran $${dif.toFixed(2)}. Queda registrado.` };
}

export async function entregarCaja(
  _anterior: RespuestaCobro | null,
  datos: FormData,
): Promise<RespuestaCobro> {
  const caja = String(datos.get('caja') ?? '');
  const a = String(datos.get('a') ?? '');

  if (!caja || !a) return { ok: false, mensaje: 'Falta a quién se le entrega.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('entregar_caja', { p_session: caja, p_a: a });

  if (error) return { ok: false, mensaje: traducir(error.message) };

  revalidatePath('/corte-de-caja');
  return { ok: true, mensaje: 'Entregada. Falta que la cuenten y la den por buena.' };
}

export async function verificarCaja(
  _anterior: RespuestaCobro | null,
  datos: FormData,
): Promise<RespuestaCobro> {
  const caja = String(datos.get('caja') ?? '');
  const notas = String(datos.get('notas') ?? '').trim();

  if (!caja) return { ok: false, mensaje: 'Falta la caja.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('verificar_caja', {
    p_session: caja,
    p_notas: notas || null,
  });

  if (error) return { ok: false, mensaje: traducir(error.message) };

  revalidatePath('/corte-de-caja');
  return { ok: true, mensaje: 'Caja verificada.' };
}

function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('no puedes verificar tu propia caja')) {
    return 'No puedes dar por buena tu propia caja. Tiene que contarla alguien más.';
  }
  if (m.includes('todavía no te la han entregado')) {
    return 'Esa caja todavía no te la entregan.';
  }
  if (m.includes('no es tuya')) return 'Esa caja no es tuya.';
  if (m.includes('ya estaba cerrada')) return 'Esa caja ya estaba cerrada.';
  if (m.includes('primero hay que cerrar')) return 'Primero ciérrala, luego la entregas.';
  if (m.includes('no hay sesión')) return 'Se cerró la sesión. Vuelve a entrar.';
  if (m.includes('permission denied') || m.includes('row-level security')) {
    return 'No tienes permiso para hacer esto.';
  }
  return mensaje;
}
