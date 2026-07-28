/**
 * ¿Ya hay un proyecto de Supabase configurado, y con llaves que de verdad lo parecen?
 *
 * Mientras las cuentas no existan (etapa 2), el panel corre en
 * "modo demostración": sin sesión, con los datos simulados a la vista.
 * En cuanto se llenen las variables en .env.local, el modo se apaga solo.
 *
 * Se valida la FORMA de la llave, no solo que no esté vacía. Sin esto, pegar
 * cualquier texto en .env.local hace que el panel intente conectarse y falle
 * con un error de red que no explica nada. Vale más quedarse en demostración
 * y decirlo claro.
 */

/** Una llave de Supabase es un JWT (`eyJ…`) o del formato nuevo (`sb_…`). */
function pareceLlave(valor: string | undefined): boolean {
  if (!valor) return false;
  const v = valor.trim();
  if (v.length < 20) return false;
  return v.startsWith('eyJ') || v.startsWith('sb_publishable_') || v.startsWith('sb_secret_');
}

function pareceUrl(valor: string | undefined): boolean {
  if (!valor) return false;
  return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(valor.trim());
}

export function haySupabase(): boolean {
  return (
    pareceUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    pareceLlave(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/** Qué está mal, para poder decírselo a quien configura. */
export function motivoSinSupabase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) return 'Falta NEXT_PUBLIC_SUPABASE_URL en .env.local';
  if (!pareceUrl(url)) {
    return 'NEXT_PUBLIC_SUPABASE_URL no parece una dirección de Supabase (https://xxxxx.supabase.co)';
  }
  if (!llave) return 'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local';
  if (!pareceLlave(llave)) {
    return 'NEXT_PUBLIC_SUPABASE_ANON_KEY no parece una llave. Debe empezar con "eyJ" o con "sb_publishable_"';
  }
  return null;
}
