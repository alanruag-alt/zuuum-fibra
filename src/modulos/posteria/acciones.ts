'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import { leerKmz } from '@/modulos/mapa/kmz';
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

export async function guardarPoste(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_poste', {
    p_id: id || null,
    p_lat: num(datos, 'lat'),
    p_lon: num(datos, 'lon'),
    p_tipo: limpio(datos, 'tipo') || 'cfe_concreto',
    p_zona: limpio(datos, 'zona') || null,
    p_cable: limpio(datos, 'cable') || null,
    p_codigo: limpio(datos, 'codigo') || null,
    p_altura: num(datos, 'altura'),
    p_nuevo: datos.get('nuevo') === 'si',
    p_notas: limpio(datos, 'notas') || null,
    p_activo: datos.get('activo') !== 'no',
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/posteria');
  revalidatePath('/mapa');
  return { ok: true, mensaje: id ? 'Poste actualizado.' : 'Poste capturado.' };
}

export async function eliminarPoste(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  if (!id) return { ok: false, mensaje: 'Falta el poste.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('eliminar_poste', { p_id: id });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/posteria');
  revalidatePath('/mapa');
  return { ok: true, mensaje: 'Poste borrado. Vuelve a renumerar para recalcular los vanos.' };
}

export async function renumerar(_anterior: Respuesta | null, datos: FormData): Promise<Respuesta> {
  const cable = limpio(datos, 'cable');
  const respetar = datos.get('respetar') === 'si';

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('renumerar_postes', {
    p_cable: cable || null,
    p_respetar: respetar,
    p_margen: num(datos, 'margen') ?? 35,
  });

  if (error) return { ok: false, mensaje: error.message };

  const r = (Array.isArray(data) ? data[0] : data) as
    | { postes?: number; vanos?: number; sueltos?: number }
    | undefined;

  revalidatePath('/red/posteria');
  revalidatePath('/red/plano');
  revalidatePath('/mapa');

  const sueltos = Number(r?.sueltos ?? 0);
  return {
    ok: true,
    mensaje:
      `${r?.postes ?? 0} postes acomodados y ${r?.vanos ?? 0} vanos calculados.` +
      (sueltos > 0
        ? ` ${sueltos} quedaron fuera de toda ruta: o al cable le falta su trazo, o el poste está mal ubicado.`
        : ''),
  };
}

export async function guardarPlano(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');

  // Todo lo que venga con prefijo `c_` es una casilla de la hoja. Así una
  // pantalla puede guardar solo su parte sin borrar lo que otra ya escribió.
  const config: Record<string, string> = {};
  for (const [k, v] of datos.entries()) {
    if (k.startsWith('c_') && typeof v === 'string') config[k.slice(2)] = v;
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_plano', {
    p_id: id || null,
    p_nombre: limpio(datos, 'nombre') || null,
    p_zona: limpio(datos, 'zona') || null,
    p_config: config,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/plano');
  return { ok: true, mensaje: 'Plano guardado.' };
}

/**
 * Importar un KMZ.
 *
 * Se respeta lo que el archivo dice de sí mismo: la carpeta donde vive cada
 * marca decide qué es. Si el KMZ trae una carpeta «Postes», eso son postes.
 * Adivinar por el nombre de cada punto sale mal en cuanto alguien nombra un
 * poste «NAP 3 (poste)».
 */
export async function importarKmz(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const archivo = datos.get('archivo');
  const zona = limpio(datos, 'zona') || null;
  const comoPostes = limpio(datos, 'puntos_como') || 'poste';

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: 'Falta el archivo.' };
  }
  if (archivo.size > 20 * 1024 * 1024) {
    return { ok: false, mensaje: 'Ese KMZ pesa más de 20 MB. Divídelo por zona.' };
  }

  let contenido;
  try {
    const buf = Buffer.from(await archivo.arrayBuffer());
    contenido = leerKmz(buf, archivo.name);
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo leer el archivo.' };
  }

  if (contenido.puntos.length === 0 && contenido.lineas.length === 0) {
    return { ok: false, mensaje: 'El archivo se leyó bien, pero no trae puntos ni trazos.' };
  }

  const supabase = await crearClienteServidor();
  let postes = 0;
  let cables = 0;
  const problemas: string[] = [];

  // Los trazos se vuelven el recorrido de un cable. Si ya existe un cable con
  // ese código, se le pone la ruta en vez de duplicarlo.
  for (const l of contenido.lineas) {
    const codigo = l.nombre.toUpperCase().slice(0, 60);
    const { data: existe } = await supabase
      .from('fiber_cables')
      .select('id')
      .eq('code', codigo)
      .maybeSingle();

    if (existe) {
      const { error } = await supabase
        .from('fiber_cables')
        .update({ path: l.puntos })
        .eq('id', (existe as { id: string }).id);
      if (error) problemas.push(`${codigo}: ${error.message}`);
      else cables++;
    } else {
      const { data: nuevo, error } = await supabase.rpc('guardar_cable', {
        p_codigo: codigo,
        p_tipo: 'adss',
        p_hilos: 12,
        p_zona: zona,
        p_de_texto: l.carpeta,
        p_notas: l.descripcion,
      });
      if (error) {
        problemas.push(`${codigo}: ${error.message}`);
      } else {
        await supabase
          .from('fiber_cables')
          .update({ path: l.puntos })
          .eq('id', nuevo as string);
        cables++;
      }
    }
  }

  for (const p of contenido.puntos) {
    if (comoPostes !== 'poste') break;
    const { error } = await supabase.rpc('guardar_poste', {
      p_lat: p.lat,
      p_lon: p.lon,
      p_tipo: 'cfe_concreto',
      p_zona: zona,
      p_codigo: p.nombre.slice(0, 60),
      p_notas: [p.carpeta, p.descripcion].filter(Boolean).join(' · ') || null,
    });
    if (error) problemas.push(`${p.nombre}: ${error.message}`);
    else postes++;
  }

  revalidatePath('/red/posteria');
  revalidatePath('/red/ftth/cables');
  revalidatePath('/red/ftth/mapa');
  revalidatePath('/mapa');

  const partes: string[] = [];
  if (cables) partes.push(`${cables} ${cables === 1 ? 'trazo' : 'trazos'} de cable`);
  if (postes) partes.push(`${postes} ${postes === 1 ? 'poste' : 'postes'}`);

  return {
    ok: true,
    mensaje:
      `Se importaron ${partes.join(' y ')}.` +
      (problemas.length
        ? ` ${problemas.length} no entraron: ${problemas.slice(0, 3).join('; ')}`
        : '') +
      (postes > 0
        ? ' Ahora dale a «Renumerar» para acomodarlos sobre las rutas y calcular los vanos.'
        : ''),
  };
}

export async function eliminarPlano(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = limpio(datos, 'id');
  if (!id) return { ok: false, mensaje: 'Falta el plano.' };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('eliminar_plano', { p_id: id });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/red/plano');
  return { ok: true, mensaje: `«${data}» borrado.` };
}
