import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { RUTAS_PUBLICAS } from '@/lib/constantes';
import { haySupabase } from '@/lib/supabase/configurado';

/**
 * Refresca la sesión en cada petición y protege las rutas del panel.
 * Quien no traiga sesión válida termina en /entrar.
 */
export async function actualizarSesion(peticion: NextRequest) {
  // Modo demostración: sin Supabase configurado se deja pasar todo,
  // para poder ver el panel antes de que existan las cuentas.
  if (!haySupabase()) {
    return NextResponse.next({ request: peticion });
  }

  let respuesta = NextResponse.next({ request: peticion });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return peticion.cookies.getAll();
        },
        setAll(porGuardar) {
          porGuardar.forEach(({ name, value }) => peticion.cookies.set(name, value));
          respuesta = NextResponse.next({ request: peticion });
          porGuardar.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = peticion.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((r) => ruta.startsWith(r));

  if (!user && !esPublica) {
    const destino = peticion.nextUrl.clone();
    destino.pathname = '/entrar';
    destino.searchParams.set('regresar', ruta);
    return NextResponse.redirect(destino);
  }

  if (user && ruta === '/entrar') {
    const destino = peticion.nextUrl.clone();
    destino.pathname = '/tablero';
    destino.search = '';
    return NextResponse.redirect(destino);
  }

  return respuesta;
}
