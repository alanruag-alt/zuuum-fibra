'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import { crearClienteAdministrador } from '@/lib/supabase/administrador';

export interface Respuesta {
  ok: boolean;
  mensaje: string;
  /** Lo que se acaba de crear, cuando la pantalla necesita ir para allá. */
  id?: string;
}

/**
 * Invitar a alguien.
 *
 * Son dos pasos y ninguno de los dos toca una contraseña:
 *
 *  1. Supabase manda un correo con una liga. La persona entra ahí y escribe la
 *     contraseña que quiera. Nadie más la ve nunca: ni el panel, ni la base.
 *  2. Con el id que Auth devolvió, la base crea el perfil con su rol y zonas.
 *
 * Si el paso 2 falla, la cuenta de Auth queda creada pero sin perfil, y sin
 * perfil no se puede entrar a nada. Por eso se avisa con el correo exacto: es
 * lo que hace falta para volver a intentar sin duplicar a nadie.
 */
export async function invitarPersona(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const nombre = String(datos.get('nombre') ?? '').trim();
  const email = String(datos.get('email') ?? '')
    .trim()
    .toLowerCase();
  const rol = String(datos.get('rol') ?? '').trim();
  const telefono = String(datos.get('telefono') ?? '').trim();
  const codigo = String(datos.get('codigo') ?? '').trim();
  const zonas = datos.getAll('zonas').map(String).filter(Boolean);
  const cobra = datos.getAll('cobra').map(String).filter(Boolean);

  if (nombre.length < 3) return { ok: false, mensaje: 'Falta el nombre completo.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, mensaje: 'Ese correo no se ve bien.' };
  if (!rol) return { ok: false, mensaje: 'Falta el rol.' };

  const admin = crearClienteAdministrador();
  if (!admin) {
    return {
      ok: false,
      mensaje:
        'Falta la llave de servicio de Supabase. Ponla en .env.local como ' +
        'SUPABASE_SERVICE_ROLE_KEY y reinicia el panel. La encuentras en Supabase → ' +
        'Settings → API. Es la única que hace falta y no se sube al repositorio.',
    };
  }

  const sitio = process.env.NEXT_PUBLIC_URL_SITIO ?? '';

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: sitio ? `${sitio}/entrar` : undefined,
    data: { full_name: nombre },
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('already been registered') || m.includes('already exists')) {
      return {
        ok: false,
        mensaje: `Ya existe una cuenta con ${email}. Si es la misma persona, búscala en la lista en vez de invitarla otra vez.`,
      };
    }
    return { ok: false, mensaje: `No se pudo mandar la invitación: ${error.message}` };
  }

  const nuevoId = data?.user?.id;
  if (!nuevoId)
    return { ok: false, mensaje: 'Supabase no devolvió el usuario. Revisa antes de reintentar.' };

  const supabase = await crearClienteServidor();
  const { error: e2 } = await supabase.rpc('alta_persona', {
    p_auth_user: nuevoId,
    p_nombre: nombre,
    p_email: email,
    p_rol: rol,
    p_zonas: zonas,
    p_cobra_en: cobra,
    p_telefono: telefono || null,
    p_codigo: codigo || null,
  });

  if (e2) {
    return {
      ok: false,
      mensaje:
        `Se mandó el correo a ${email}, pero el perfil no se creó: ${e2.message}. ` +
        'Vuelve a intentar con el mismo correo — no se va a duplicar la cuenta.',
    };
  }

  revalidatePath('/usuarios');
  return {
    ok: true,
    mensaje: `Invitación enviada a ${email}. Cuando entre a la liga del correo va a escribir su propia contraseña.`,
  };
}

export async function editarPersona(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = String(datos.get('id') ?? '');
  const nombre = String(datos.get('nombre') ?? '').trim();
  const rol = String(datos.get('rol') ?? '').trim();
  const telefono = String(datos.get('telefono') ?? '').trim();
  const codigo = String(datos.get('codigo') ?? '').trim();
  const activo = datos.get('activo');

  if (!id) return { ok: false, mensaje: 'Falta la persona.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('editar_persona', {
    p_user: id,
    p_nombre: nombre || null,
    p_rol: rol || null,
    p_activo: activo === null ? null : activo === 'si',
    p_telefono: telefono || null,
    p_codigo: codigo || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/usuarios');
  revalidatePath(`/usuarios/${id}`);
  return { ok: true, mensaje: 'Guardado.' };
}

export async function guardarZonasDePersona(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = String(datos.get('id') ?? '');
  const zonas = datos.getAll('zonas').map(String).filter(Boolean);
  const cobra = datos.getAll('cobra').map(String).filter(Boolean);

  if (!id) return { ok: false, mensaje: 'Falta la persona.' };

  // Cobrar en una zona que no se ve no tiene sentido: se agrega sola.
  const todas = [...new Set([...zonas, ...cobra])];

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('asignar_zonas', {
    p_user: id,
    p_zonas: todas,
    p_cobra_en: cobra,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/usuarios');
  revalidatePath(`/usuarios/${id}`);

  const n = Number(data ?? 0);
  if (n === 0) {
    return {
      ok: true,
      mensaje: 'Sin zonas asignadas. Ojo: así esta persona no va a ver ningún cliente.',
    };
  }
  return { ok: true, mensaje: `${n} ${n === 1 ? 'zona asignada' : 'zonas asignadas'}.` };
}

export async function ajustarPermiso(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = String(datos.get('id') ?? '');
  const permiso = String(datos.get('permiso') ?? '');
  const estado = String(datos.get('estado') ?? '');

  if (!id || !permiso) return { ok: false, mensaje: 'Faltan datos.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('ajustar_permiso', {
    p_user: id,
    p_permiso: permiso,
    p_estado: estado === 'rol' ? null : estado === 'si',
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('permiso de dinero')) {
      return {
        ok: false,
        mensaje:
          'La base no deja darle un permiso de dinero a alguien operativo. ' +
          'Si esta persona debe manejar cobranza, cámbiale primero el rol.',
      };
    }
    return { ok: false, mensaje: error.message };
  }

  revalidatePath(`/usuarios/${id}`);
  return { ok: true, mensaje: 'Permiso actualizado.' };
}

export async function guardarZona(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = String(datos.get('id') ?? '');
  const nombre = String(datos.get('nombre') ?? '').trim();
  const codigo = String(datos.get('codigo') ?? '').trim();
  const activa = datos.get('activa') === 'si';

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_zona', {
    p_id: id || null,
    p_nombre: nombre,
    p_codigo: codigo || null,
    p_activa: activa,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/zonas');
  return {
    ok: true,
    mensaje: id
      ? 'Zona actualizada.'
      : `Zona creada. Sus folios van a ser ${codigo.toUpperCase()}-0001.`,
  };
}

export async function guardarPlan(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const id = String(datos.get('id') ?? '');
  const num = (k: string) => {
    const v = String(datos.get(k) ?? '').trim();
    return v === '' ? null : Number(v);
  };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_plan', {
    p_id: id || null,
    p_codigo: String(datos.get('codigo') ?? '').trim() || null,
    p_nombre: String(datos.get('nombre') ?? '').trim(),
    p_precio: num('precio'),
    p_bajada: num('bajada'),
    p_subida: num('subida'),
    p_red: String(datos.get('red') ?? 'both'),
    p_visible: datos.get('visible') === 'si',
    p_activo: datos.get('activo') === 'si',
    p_notas: String(datos.get('notas') ?? '').trim() || null,
  });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/planes');
  return {
    ok: true,
    mensaje: id
      ? 'Plan actualizado. A los clientes que ya lo tienen no les cambió el precio.'
      : 'Plan creado.',
  };
}

export async function guardarAjuste(
  _anterior: Respuesta | null,
  datos: FormData,
): Promise<Respuesta> {
  const key = String(datos.get('key') ?? '');
  const valor = String(datos.get('valor') ?? '').trim();

  if (!key) return { ok: false, mensaje: 'Falta el ajuste.' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_ajuste', { p_key: key, p_valor: valor });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath('/ajustes');
  revalidatePath('/cobranza');
  return { ok: true, mensaje: 'Guardado. Aplica desde el próximo movimiento.' };
}
