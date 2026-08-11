'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Respuesta } from '@/modulos/admin/acciones';

function refrescar() {
  revalidatePath('/red/ftth/sitio');
  revalidatePath('/red/ftth');
  revalidatePath('/red/equipos');
}

/**
 * Todas estas acciones devuelven el recado que arma la base.
 *
 * La base es la que sabe qué equipo estorba y en qué U está; volver a
 * redactar el mensaje aquí solo serviría para decir menos. Lo único que se
 * hace de este lado es traducir «no hay sesión» y refrescar la pantalla.
 */

export async function guardarRack(datos: {
  id?: string | null;
  sitio?: string | null;
  nombre: string;
  units: number;
  lugar?: string | null;
  notas?: string | null;
}): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_rack', {
    p_id: datos.id ?? null,
    p_sitio: datos.sitio ?? null,
    p_nombre: datos.nombre,
    p_units: datos.units,
    p_lugar: datos.lugar ?? null,
    p_notas: datos.notas ?? null,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: datos.id ? 'Rack actualizado.' : `${datos.nombre} dado de alta.` };
}

export async function montarEnRack(datos: {
  id?: string | null;
  rack: string;
  label: string;
  kind: string;
  position: number;
  height: number;
  device?: string | null;
  element?: string | null;
  vendor?: string | null;
  model?: string | null;
  serial?: string | null;
  ip?: string | null;
  estado?: string;
  notas?: string | null;
}): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('montar_en_rack', {
    p_rack: datos.rack,
    p_label: datos.label,
    p_kind: datos.kind,
    p_position: datos.position,
    p_height: datos.height,
    p_device: datos.device || null,
    p_element: datos.element || null,
    p_vendor: datos.vendor || null,
    p_model: datos.model || null,
    p_serial: datos.serial || null,
    p_ip: datos.ip || null,
    p_estado: datos.estado || 'en_linea',
    p_notas: datos.notas || null,
    p_id: datos.id ?? null,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return {
    ok: true,
    mensaje: datos.id
      ? `${datos.label} actualizado.`
      : `${datos.label} montado en la U${datos.position}${
          datos.height > 1 ? `-U${datos.position + datos.height - 1}` : ''
        }.`,
  };
}

/** Arrastrar manda una sola cosa: la U nueva. */
export async function moverEnRack(id: string, posicion: number): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('mover_en_rack', {
    p_id: id,
    p_position: posicion,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: String(data ?? 'Listo.') };
}

/**
 * Bajar un equipo del rack.
 *
 * Sin `forzar`, la base se niega si trae PON patcheados o puertos con fibra, y
 * dice cuántos. Esa negativa es el aviso: la pantalla la enseña y ofrece el
 * botón de confirmar, que es el mismo llamado con `forzar`.
 */
export async function desmontarDelRack(id: string, forzar = false): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('desmontar_del_rack', {
    p_id: id,
    p_forzar: forzar,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: String(data ?? 'Equipo bajado del rack.') };
}

export async function eliminarRack(id: string): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('eliminar_rack', { p_id: id });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: `${String(data ?? 'El rack')} se borró.` };
}

/** El latiguillo de la OLT al ODF, con su etiqueta y su conector. */
export async function conectarPonAOdf(datos: {
  pon: string;
  puerto: string;
  potencia?: number | null;
  jumper?: string | null;
  conector?: string | null;
  notas?: string | null;
}): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('patchear', {
    p_pon: datos.pon,
    p_odf_port: datos.puerto,
    p_potencia: datos.potencia ?? null,
    p_notas: datos.notas || null,
    p_jumper: datos.jumper || null,
    p_conector: datos.conector || null,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  return { ok: true, mensaje: String(data ?? 'Latiguillo puesto.') };
}

/**
 * Dar de alta la OLT y montarla, en un solo movimiento.
 *
 * El sitio y la zona no se mandan: la base los saca del rack. Un rack vive
 * dentro de un sitio, y volver a preguntarlo solo abre la puerta a que no
 * coincidan.
 */
export async function montarOlt(datos: {
  rack: string;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  serie?: string | null;
  ip?: string | null;
  position: number;
  height: number;
  tarjetas: number;
  puertos: number;
  tipoTarjeta?: string | null;
  notas?: string | null;
}): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('montar_olt', {
    p_rack: datos.rack,
    p_nombre: datos.nombre,
    p_marca: datos.marca || null,
    p_modelo: datos.modelo || null,
    p_serie: datos.serie || null,
    p_ip: datos.ip || null,
    p_position: datos.position,
    p_height: datos.height,
    p_tarjetas: datos.tarjetas,
    p_puertos: datos.puertos,
    p_tipo_tarjeta: datos.tipoTarjeta || null,
    p_notas: datos.notas || null,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  const fila = (data ?? [])[0] as { mensaje?: string } | undefined;
  return { ok: true, mensaje: fila?.mensaje ?? 'OLT dada de alta y montada.' };
}

/** Lo mismo con el ODF: nace con sus bandejas abiertas. */
export async function montarOdf(datos: {
  rack: string;
  codigo: string;
  nombre?: string | null;
  position: number;
  height: number;
  bandejas: number;
  porBandeja: number;
  conector?: string | null;
  serie?: string | null;
  notas?: string | null;
}): Promise<Respuesta> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('montar_odf', {
    p_rack: datos.rack,
    p_codigo: datos.codigo,
    p_nombre: datos.nombre || null,
    p_position: datos.position,
    p_height: datos.height,
    p_bandejas: datos.bandejas,
    p_por_bandeja: datos.porBandeja,
    p_conector: datos.conector || 'SC/APC',
    p_serie: datos.serie || null,
    p_notas: datos.notas || null,
  });

  if (error) return { ok: false, mensaje: error.message };
  refrescar();
  const fila = (data ?? [])[0] as { mensaje?: string } | undefined;
  return { ok: true, mensaje: fila?.mensaje ?? 'ODF dado de alta y montado.' };
}
