import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cliente de Supabase para componentes y acciones del servidor.
 * En Next.js 15 `cookies()` es asíncrono, por eso esta función es async.
 */
export async function crearClienteServidor() {
  const almacen = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(porGuardar) {
          try {
            porGuardar.forEach(({ name, value, options }) => {
              almacen.set(name, value, options);
            });
          } catch {
            // Llamado desde un Server Component: el middleware ya refresca
            // la sesión, así que se puede ignorar sin consecuencias.
          }
        },
      },
    },
  );
}
