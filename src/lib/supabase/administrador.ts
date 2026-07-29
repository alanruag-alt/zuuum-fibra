import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con la llave de servicio. Se salta las RLS por completo.
 *
 * Solo existe para UNA cosa: invitar por correo a alguien nuevo, porque crear
 * cuentas es lo único que la base no puede hacer sola. Nada más debe usarlo:
 * todo lo demás pasa por las funciones de la base, que sí revisan permisos.
 *
 * La llave vive en `.env.local`, en el equipo de la oficina, y nunca se sube al
 * repositorio ni sale del servidor. Si no está puesta, esto devuelve null y la
 * pantalla explica qué hacer, en vez de tronar.
 */
export function crearClienteAdministrador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !llave || llave.trim().length < 20) return null;

  return createClient(url, llave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hayLlaveDeServicio(): boolean {
  return crearClienteAdministrador() !== null;
}
