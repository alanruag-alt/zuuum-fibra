import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { DatosPersona, PermisosPersona, ZonasPersona } from '@/app/(panel)/usuarios/[id]/Editor';
import {
  listarRoles,
  obtenerPersona,
  permisosDePersona,
  zonasDePersona,
} from '@/modulos/admin/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { fecha } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PaginaPersona({ params }: Props) {
  const { id } = await params;
  const persona = await obtenerPersona(id);
  if (!persona) notFound();

  const [roles, zonas, asignadas, permisos] = await Promise.all([
    listarRoles(),
    listarZonas(),
    zonasDePersona(id),
    permisosDePersona(id),
  ]);

  const conPermiso = permisos.filter((p) => p.efectivo).length;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/usuarios"
        className="mb-4 inline-block text-sm text-marino-400 hover:text-marino-600"
      >
        ← Volver a usuarios
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-marino-800">{persona.full_name}</h1>
          {persona.is_active ? (
            <Insignia tono="ok">Activo</Insignia>
          ) : (
            <Insignia tono="neutro">Desactivado</Insignia>
          )}
          {persona.rol && <Insignia tono="marca">{persona.rol}</Insignia>}
        </div>
        <p className="mt-1 text-sm text-marino-400">
          {persona.email ?? 'sin correo'} · desde {fecha(persona.created_at)} · {conPermiso}{' '}
          permisos efectivos
        </p>
      </div>

      <div className="space-y-5">
        <Tarjeta titulo="Datos y rol">
          <DatosPersona persona={persona} roles={roles} />
        </Tarjeta>

        <Tarjeta
          titulo="Zonas"
          descripcion="«ve» le deja ver a los clientes de esa zona. «cobra» además le deja registrar pagos ahí."
        >
          <ZonasPersona
            persona={persona}
            zonas={zonas}
            asignadas={asignadas}
            alcanceTotal={persona.alcance === 'all'}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Permisos"
          descripcion="Lo normal es dejarlos «como el rol». Las excepciones son para casos concretos, y aquí queda escrito cuáles son."
        >
          <PermisosPersona persona={persona} permisos={permisos} />
        </Tarjeta>
      </div>
    </div>
  );
}
