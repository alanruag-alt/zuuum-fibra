'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';

function limpio(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? '').trim();
}

export async function guardarProspecto(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_prospecto', {
    p_id: id || null,
    p_nombre: limpio(datos, 'nombre') || null,
    p_telefono: limpio(datos, 'telefono') || null,
    p_zona: limpio(datos, 'zona') || null,
    p_email: limpio(datos, 'email') || null,
    p_domicilio: limpio(datos, 'domicilio') || null,
    p_plan: limpio(datos, 'plan') || null,
    p_cobertura: limpio(datos, 'cobertura') || 'unknown',
    p_estado: limpio(datos, 'estado') || 'new',
    p_motivo: limpio(datos, 'motivo') || null,
    p_notas: limpio(datos, 'notas') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/prospectos');
  return { ok: true, mensaje: id ? 'Prospecto actualizado.' : 'Prospecto guardado.' };
}

export async function convertirProspecto(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  const plan = limpio(datos, 'plan');
  const precio = limpio(datos, 'precio');
  const agendar = limpio(datos, 'agendar');

  if (!id || !plan) return { ok: false, mensaje: 'Falta el plan.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('convertir_prospecto', {
    p_prospecto: id,
    p_plan: plan,
    p_precio: precio ? Number(precio) : null,
    p_red: limpio(datos, 'red') || 'ftth',
    p_agendar: agendar || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as
    | { customer_code: string; order_number: string }
    | undefined;

  revalidatePath('/prospectos');
  revalidatePath('/clientes');
  revalidatePath('/ordenes');

  return {
    ok: true,
    mensaje:
      `Cliente ${r?.customer_code} creado y orden ${r?.order_number} lista. ` +
      'El servicio queda pendiente hasta que el técnico cierre la instalación con su evidencia.',
  };
}

export async function crearOrden(_anterior: Respuesta | null, datos: FormData): Promise<Respuesta> {
  const cliente = limpio(datos, 'cliente');
  const tipo = limpio(datos, 'tipo');
  const agendar = limpio(datos, 'agendar');

  if (!cliente || !tipo) return { ok: false, mensaje: 'Faltan datos.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('crear_orden', {
    p_tipo: tipo,
    p_cliente: cliente,
    p_servicio: limpio(datos, 'servicio') || null,
    p_agendar: agendar || null,
    p_prioridad: limpio(datos, 'prioridad') || 'normal',
    p_notas: limpio(datos, 'notas') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as { order_number: string } | undefined;

  revalidatePath('/ordenes');
  return { ok: true, mensaje: `Orden ${r?.order_number} creada.` };
}

export async function asignarOrden(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const orden = limpio(datos, 'orden');
  const tecnicos = datos.getAll('tecnicos').map(String).filter(Boolean);
  const agendar = limpio(datos, 'agendar');

  if (!orden) return { ok: false, mensaje: 'Falta la orden.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('asignar_orden', {
    p_orden: orden,
    p_tecnicos: tecnicos,
    p_agendar: agendar || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/ordenes');
  revalidatePath(`/ordenes/${orden}`);

  const n = Number(data ?? 0);
  if (n === 0) return { ok: true, mensaje: 'Sin técnicos: la orden regresó a borrador.' };
  return {
    ok: true,
    mensaje: `Asignada a ${n} ${n === 1 ? 'técnico' : 'técnicos'}. Ya puede ver a ese cliente en su teléfono.`,
  };
}

export async function moverOrden(_anterior: Respuesta | null, datos: FormData): Promise<Respuesta> {
  const orden = limpio(datos, 'orden');
  const que = limpio(datos, 'que');

  if (!orden) return { ok: false, mensaje: 'Falta la orden.' };

  const supabase = await crearClienteServidor();

  if (que === 'iniciar') {
    const { error } = await supabase.rpc('iniciar_orden', { p_orden: orden });
    if (error) return { ok: false, mensaje: error.message };
    revalidatePath('/ordenes');
    revalidatePath(`/ordenes/${orden}`);
    return { ok: true, mensaje: 'Orden empezada.' };
  }

  if (que === 'cerrar') {
    const { data, error } = await supabase.rpc('cerrar_orden', {
      p_orden: orden,
      p_notas: limpio(datos, 'notas') || null,
    });
    if (error) return { ok: false, mensaje: traducirEvidencia(error.message) };

    const r = (Array.isArray(data) ? data[0] : data) as { mensaje?: string } | undefined;
    revalidatePath('/ordenes');
    revalidatePath(`/ordenes/${orden}`);
    revalidatePath('/clientes');
    return { ok: true, mensaje: r?.mensaje ?? 'Orden cerrada.' };
  }

  if (que === 'cancelar') {
    const { error } = await supabase.rpc('cancelar_orden', {
      p_orden: orden,
      p_motivo: limpio(datos, 'motivo'),
    });
    if (error) return { ok: false, mensaje: error.message };
    revalidatePath('/ordenes');
    revalidatePath(`/ordenes/${orden}`);
    return { ok: true, mensaje: 'Orden cancelada.' };
  }

  return { ok: false, mensaje: 'Acción desconocida.' };
}

export async function abrirTicket(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const cliente = limpio(datos, 'cliente');
  const categoria = limpio(datos, 'categoria');
  const asunto = limpio(datos, 'asunto');

  if (!cliente || !categoria || !asunto) return { ok: false, mensaje: 'Faltan datos.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('abrir_ticket', {
    p_cliente: cliente,
    p_categoria: categoria,
    p_asunto: asunto,
    p_detalle: limpio(datos, 'detalle') || null,
    p_prioridad: limpio(datos, 'prioridad') || 'normal',
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as { ticket_number: string } | undefined;

  revalidatePath('/tickets');
  return { ok: true, mensaje: `Ticket ${r?.ticket_number} abierto.` };
}

export async function atenderTicket(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const ticket = limpio(datos, 'ticket');
  if (!ticket) return { ok: false, mensaje: 'Falta el ticket.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('atender_ticket', {
    p_ticket: ticket,
    p_estado: limpio(datos, 'estado') || null,
    p_asignar: limpio(datos, 'asignar') || null,
    p_causa: limpio(datos, 'causa') || null,
    p_comentario: limpio(datos, 'comentario') || null,
    p_interno: datos.get('publico') !== 'si',
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/tickets');
  revalidatePath(`/tickets/${ticket}`);
  return { ok: true, mensaje: 'Ticket actualizado.' };
}

/**
 * El disparador de la 012 manda tres mensajes distintos según lo que falte.
 * Se dejan tal cual porque ya están en español y dicen exactamente qué falta;
 * lo único que se agrega es qué hacer al respecto.
 */
function traducirEvidencia(mensaje: string): string {
  if (mensaje.includes('sin al menos una foto')) {
    return mensaje + ' Súbela desde el teléfono del técnico antes de cerrar.';
  }
  if (mensaje.includes('sin la potencia medida')) {
    return mensaje + ' Hay que capturar la lectura del ONT.';
  }
  if (mensaje.includes('sin la firma')) {
    return mensaje + ' El cliente tiene que firmar en el SUNMI.';
  }
  return mensaje;
}
