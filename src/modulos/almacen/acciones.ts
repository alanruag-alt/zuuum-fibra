'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';
import { pesos } from '@/lib/formato';

function limpio(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? '').trim();
}

export async function guardarArticulo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  const costo = limpio(datos, 'costo');
  const minimo = limpio(datos, 'minimo');

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_articulo', {
    p_id: id || null,
    p_sku: limpio(datos, 'sku') || null,
    p_nombre: limpio(datos, 'nombre') || null,
    p_categoria: limpio(datos, 'categoria') || 'other',
    p_unidad: limpio(datos, 'unidad') || 'piece',
    p_con_serie: datos.get('con_serie') === 'si',
    p_minimo: minimo ? Number(minimo) : 0,
    p_costo: costo ? Number(costo) : null,
    p_marca: limpio(datos, 'marca') || null,
    p_modelo: limpio(datos, 'modelo') || null,
    p_activo: datos.get('activo') !== 'no',
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/inventario');
  return { ok: true, mensaje: id ? 'Artículo actualizado.' : 'Artículo dado de alta.' };
}

export async function moverInventario(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const articulo = limpio(datos, 'articulo');
  const cantidad = limpio(datos, 'cantidad');
  const tipo = limpio(datos, 'tipo');

  if (!articulo || !cantidad || !tipo) return { ok: false, mensaje: 'Faltan datos.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('mover_inventario', {
    p_articulo: articulo,
    p_cantidad: Number(cantidad),
    p_tipo: tipo,
    p_de_tipo: limpio(datos, 'de_tipo') || null,
    p_de_id: limpio(datos, 'de_id') || null,
    p_a_tipo: limpio(datos, 'a_tipo') || null,
    p_a_id: limpio(datos, 'a_id') || null,
    p_motivo: limpio(datos, 'motivo') || null,
    p_orden: limpio(datos, 'orden') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/inventario');
  return { ok: true, mensaje: 'Movimiento registrado.' };
}

export async function altaEquipo(_anterior: Respuesta | null, datos: FormData): Promise<Respuesta> {
  const serie = limpio(datos, 'serie');
  if (!serie) return { ok: false, mensaje: 'Sin número de serie no hay equipo.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('alta_equipo', {
    p_serie: serie,
    p_articulo: limpio(datos, 'articulo') || null,
    p_gpon: limpio(datos, 'gpon') || null,
    p_mac: limpio(datos, 'mac') || null,
    p_marca: limpio(datos, 'marca') || null,
    p_modelo: limpio(datos, 'modelo') || null,
    p_donde_tipo: limpio(datos, 'donde_tipo') || 'branch',
    p_donde_id: limpio(datos, 'donde_id') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/inventario/series');
  revalidatePath('/inventario');
  return { ok: true, mensaje: `Equipo ${serie.toUpperCase()} dado de alta.` };
}

export async function instalarEquipo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const serie = limpio(datos, 'serie');
  let servicio = limpio(datos, 'servicio');
  const codigo = limpio(datos, 'codigo').toUpperCase();

  if (!serie) return { ok: false, mensaje: 'Falta la serie.' };

  const supabase = await crearClienteServidor();

  // El técnico trae la clave del cliente escrita en la orden, no un uuid.
  // Se resuelve aquí, y si el cliente tiene más de un servicio se le pregunta
  // en vez de adivinar cuál.
  if (!servicio) {
    if (!codigo) return { ok: false, mensaje: 'Falta la clave del cliente.' };

    const { data: servicios, error: e1 } = await supabase
      .from('customer_services')
      .select('id, network_type, customers!inner(customer_code, full_name)')
      .eq('customers.customer_code', codigo)
      .in('status', ['active', 'pending']);

    if (e1) return { ok: false, mensaje: e1.message };

    const filas = (servicios ?? []) as unknown as { id: string; network_type: string }[];
    if (filas.length === 0) {
      return { ok: false, mensaje: `No hay ningún servicio a nombre de ${codigo}.` };
    }
    if (filas.length > 1) {
      return {
        ok: false,
        mensaje: `${codigo} tiene ${filas.length} servicios. Instálalo desde el expediente del cliente para no equivocarte de línea.`,
      };
    }
    servicio = filas[0].id;
  }

  const { data, error } = await supabase.rpc('instalar_equipo', {
    p_serie: serie,
    p_servicio: servicio,
    p_orden: limpio(datos, 'orden') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as { veces_instalado?: number } | undefined;
  const veces = Number(r?.veces_instalado ?? 1);

  revalidatePath('/inventario/series');
  revalidatePath('/clientes');

  return {
    ok: true,
    mensaje:
      veces > 1
        ? `Instalado. Este equipo ya lleva ${veces} instalaciones: si vuelve a fallar, conviene retirarlo.`
        : 'Equipo instalado.',
  };
}

/**
 * Retirar un equipo del domicilio.
 *
 * Son dos finales muy distintos y por eso van en la misma pantalla: o lo
 * devolvió y regresa al almacén, o no lo devolvió y se le cobra. La base
 * decide el monto (el ajuste `equipment.unreturned_fee`, hoy $550); aquí solo
 * se le dice al usuario cuánto quedó cargado.
 */
export async function recuperarEquipo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const serie = limpio(datos, 'serie');
  if (!serie) return { ok: false, mensaje: 'Falta la serie.' };

  const devuelto = datos.get('devuelto') === 'si';

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('recuperar_equipo', {
    p_serie: serie,
    p_devuelto: devuelto,
    p_donde_id: limpio(datos, 'donde_id') || null,
    p_notas: limpio(datos, 'notas') || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as
    | { cobrado?: boolean; importe?: number }
    | undefined;

  revalidatePath('/inventario/series');
  revalidatePath('/cobranza');
  revalidatePath('/clientes');

  if (devuelto) return { ok: true, mensaje: 'Equipo recibido. Ya está en el almacén.' };

  if (r?.cobrado) {
    return {
      ok: true,
      mensaje: `Marcado como perdido y cargado ${pesos(Number(r.importe), true)} al cliente.`,
    };
  }

  return {
    ok: true,
    mensaje:
      'Marcado como perdido. No se generó el cargo: hace falta permiso para crear cargos, ' +
      'o el equipo no estaba a nombre de nadie.',
  };
}

export async function eliminarArticulo(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  if (!id) return { ok: false, mensaje: 'Falta cuál.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('eliminar_articulo', { p_id: id });

  // Cuando la base se niega, ya explica por qué y qué hacer primero. Se pasa
  // el recado tal cual en vez de traducirlo a «no se pudo».
  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/inventario');
  return { ok: true, mensaje: `${data ?? 'Listo'}: borrado del almacén.` };
}
