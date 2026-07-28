'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para componentes del navegador.
 * Usa la llave pública (anon). No hay nada secreto aquí: la protección
 * viene de las políticas RLS de la base.
 */
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
