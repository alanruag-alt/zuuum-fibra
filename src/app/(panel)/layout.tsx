import { CarcasaPanel } from '@/componentes/layout/CarcasaPanel';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import { haySupabase } from '@/lib/supabase/configurado';

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  let nombre = 'Modo demostración';
  let rol = 'sin conexión a la base';

  if (haySupabase()) {
    const supabase = await crearClienteServidor();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // El middleware ya bloquea el acceso sin sesión; esto es solo para el nombre.
    nombre = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Invitado';

    // El rol de verdad se leerá de `profiles` + `user_roles` en la etapa 4.
    rol = 'Sesión de prueba';
  }

  return (
    <CarcasaPanel nombre={nombre} rol={rol}>
      {children}
    </CarcasaPanel>
  );
}
