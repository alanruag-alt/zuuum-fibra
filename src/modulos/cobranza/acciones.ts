'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { ResultadoCobro } from '@/modulos/cobranza/tipos';

/**
 * Todo lo que mueve dinero pasa por las funciones de la base, nunca por
 * inserciones sueltas desde aquí.
 *
 * La razón es que la app del SUNMI va a llamar exactamente las mismas
 * funciones. Si la regla de "aplicar a lo más viejo primero" viviera en este
 * archivo, el teléfono del cobrador cobraría distinto que la oficina, y el
 * día que no cuadre la caja nadie sabría cuál de los dos tuvo razón.
 */

export interface RespuestaCobro {
  ok: boolean;
  mensaje: string;
  resultado?: ResultadoCobro;
}

export async function registrarPago(
  _anterior: RespuestaCobro | null,
  datos: FormData,
): Promise<RespuestaCobro> {
  const clienteId = String(datos.get('cliente_id') ?? '');
  const importe = Number(datos.get('importe') ?? 0);
  const metodo = String(datos.get('metodo') ?? 'cash');
  const referencia = String(datos.get('referencia') ?? '').trim();
  const notas = String(datos.get('notas') ?? '').trim();

  if (!clienteId) return { ok: false, mensaje: 'Falta el cliente.' };
  if (!Number.isFinite(importe) || importe <= 0) {
    return { ok: false, mensaje: 'El importe tiene que ser mayor que cero.' };
  }
  if (metodo === 'transfer' && !referencia) {
    return { ok: false, mensaje: 'Una transferencia necesita su referencia.' };
  }

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.rpc('registrar_pago', {
    p_customer: clienteId,
    p_amount: importe,
    p_method: metodo,
    p_reference: referencia || null,
    p_notes: notas || null,
  });

  if (error) {
    return { ok: false, mensaje: traducirError(error.message) };
  }

  const r = (Array.isArray(data) ? data[0] : data) as ResultadoCobro | undefined;
  if (!r)
    return {
      ok: false,
      mensaje: 'La base no devolvió el recibo. Revisa antes de volver a cobrar.',
    };

  revalidatePath('/cobranza');
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath('/tablero');

  const partes = [`Recibo ${r.receipt_number}`];
  if (Number(r.saldo_a_favor) > 0) {
    partes.push(`quedan $${Number(r.saldo_a_favor).toFixed(2)} a favor del cliente`);
  }
  if (r.ya_existia) partes.push('(este pago ya estaba registrado, no se cobró dos veces)');

  return { ok: true, mensaje: partes.join(' · '), resultado: r };
}

export async function cancelarPago(
  _anterior: RespuestaCobro | null,
  datos: FormData,
): Promise<RespuestaCobro> {
  const pagoId = String(datos.get('pago_id') ?? '');
  const motivo = String(datos.get('motivo') ?? '').trim();

  if (!pagoId) return { ok: false, mensaje: 'Falta el pago.' };
  if (motivo.length < 5) return { ok: false, mensaje: 'Escribe el motivo de la cancelación.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('cancelar_pago', {
    p_payment: pagoId,
    p_reason: motivo,
  });

  if (error) return { ok: false, mensaje: traducirError(error.message) };

  revalidatePath('/cobranza');
  revalidatePath('/tablero');
  return { ok: true, mensaje: 'Pago cancelado. El saldo regresó a los cargos.' };
}

export async function abrirPeriodoYGenerar(
  _anterior: RespuestaCobro | null,
  datos: FormData,
): Promise<RespuestaCobro> {
  const anio = Number(datos.get('anio') ?? 0);
  const mes = Number(datos.get('mes') ?? 0);

  if (!anio || !mes) return { ok: false, mensaje: 'Falta el mes.' };

  const supabase = await crearClienteServidor();

  const { data: periodo, error: e1 } = await supabase.rpc('abrir_periodo', {
    p_year: anio,
    p_month: mes,
  });
  if (e1) return { ok: false, mensaje: traducirError(e1.message) };

  const { data, error: e2 } = await supabase.rpc('generar_cargos_mensuales', {
    p_period: periodo,
  });
  if (e2) return { ok: false, mensaje: traducirError(e2.message) };

  const g = (Array.isArray(data) ? data[0] : data) as
    | { generados: number; omitidos: number; sin_precio: number }
    | undefined;

  revalidatePath('/cobranza');
  revalidatePath('/tablero');

  const partes = [`${g?.generados ?? 0} cargos generados`];
  if (g?.omitidos) partes.push(`${g.omitidos} ya existían`);
  if (g?.sin_precio) partes.push(`${g.sin_precio} sin precio, hay que revisarlos`);

  return { ok: true, mensaje: partes.join(' · ') };
}

/**
 * El corte del día 11, de verdad.
 *
 * Pide que se escriba cuántos se van a cortar, y compara ese número contra lo
 * que la base va a hacer antes de hacerlo. Si no coinciden, no corta.
 *
 * Suena exagerado, pero es lo único que separa "reviso la lista y aprieto" de
 * "aprieto y luego veo": entre que se carga la pantalla y que alguien decide,
 * pudo entrar un pago, y entonces la lista que la persona vio ya no es la que
 * se va a ejecutar.
 */
export async function ejecutarCorte(
  _anterior: RespuestaCobro | null,
  datos: FormData,
): Promise<RespuestaCobro> {
  const periodo = String(datos.get('periodo') ?? '');
  const esperados = Number(datos.get('esperados') ?? -1);

  if (!periodo) return { ok: false, mensaje: 'Falta el mes.' };
  if (!Number.isFinite(esperados) || esperados < 0) {
    return { ok: false, mensaje: 'Falta cuántos se van a cortar.' };
  }

  const supabase = await crearClienteServidor();

  const { data: ahora, error: e1 } = await supabase.rpc('suspender_vencidos', {
    p_period: periodo,
    p_simular: true,
  });
  if (e1) return { ok: false, mensaje: traducirError(e1.message) };

  const cuantos = Array.isArray(ahora) ? ahora.length : 0;

  if (cuantos !== esperados) {
    return {
      ok: false,
      mensaje: `La lista cambió: ahora son ${cuantos} y no ${esperados}. Alguien pagó mientras revisabas. Vuelve a cargar la pantalla y confirma otra vez.`,
    };
  }

  const { data, error } = await supabase.rpc('suspender_vencidos', {
    p_period: periodo,
    p_simular: false,
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };

  const n = Array.isArray(data) ? data.length : 0;

  revalidatePath('/cobranza');
  revalidatePath('/clientes');
  revalidatePath('/tablero');

  return {
    ok: true,
    mensaje: `${n} servicios suspendidos. Quedan registrados con fecha y con tu nombre; se reactivan desde el expediente de cada cliente.`,
  };
}

/**
 * Los errores de PostgreSQL llegan en inglés y con ruido. Esto los deja en
 * español, porque quien los va a leer es la persona de la oficina, no yo.
 */
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();

  if (m.includes('no tienes permiso') || m.includes('solo el administrador')) return mensaje;
  if (m.includes('no cobras en la zona')) return 'Este cliente no es de tu zona de cobro.';
  if (m.includes('no hay sesión')) return 'Se cerró la sesión. Vuelve a entrar.';
  if (m.includes('duplicate key') && m.includes('payments_folio')) {
    return 'Se repitió el folio del recibo. Vuelve a intentar.';
  }
  if (m.includes('duplicate key') && m.includes('client_uuid')) {
    return 'Ese pago ya estaba registrado. No se cobró dos veces.';
  }
  if (m.includes('permission denied') || m.includes('row-level security')) {
    return 'No tienes permiso para hacer esto.';
  }
  return mensaje;
}
