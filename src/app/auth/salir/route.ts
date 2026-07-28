import { NextResponse } from 'next/server';
import { crearClienteServidor } from '@/lib/supabase/servidor';

export async function POST(peticion: Request) {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL('/entrar', peticion.url), { status: 303 });
}
