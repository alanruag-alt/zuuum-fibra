import { type NextRequest } from 'next/server';
import { actualizarSesion } from '@/lib/supabase/middleware';

export async function middleware(peticion: NextRequest) {
  return actualizarSesion(peticion);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas menos:
     * - archivos estáticos de Next
     * - imágenes optimizadas
     * - el favicon
     * - archivos con extensión
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
