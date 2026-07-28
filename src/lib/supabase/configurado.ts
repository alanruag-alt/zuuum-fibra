/**
 * ¿Ya hay un proyecto de Supabase configurado?
 *
 * Mientras las cuentas no existan (etapa 2), el panel corre en
 * "modo demostración": sin sesión, con los datos simulados a la vista.
 * En cuanto se llenen las variables en .env.local, el modo se apaga solo.
 */
export function haySupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !llave) return false;

  // Los valores de ejemplo del .env.example no cuentan como configuración.
  if (url.includes('tu-proyecto')) return false;
  if (llave.includes('tu_llave')) return false;

  return true;
}
