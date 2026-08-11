import Link from 'next/link';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditorPlano } from '@/app/(panel)/red/plano/Editor';
import { Borrar } from '@/componentes/ui/Borrar';
import { listarPlanos } from '@/modulos/posteria/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { listarCables } from '@/modulos/ftth/consultas';
import { PLANO_POR_DEFECTO } from '@/modulos/posteria/tipos';
import { fechaHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaPlano() {
  const [planos, zonas, cables] = await Promise.all([
    listarPlanos(),
    listarZonas(),
    listarCables(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Plano CFE</h1>
        <p className="mt-1 text-sm text-marino-400">
          La hoja del trámite de renta de postería, con los postes y los vanos que ya tienes
          capturados.
        </p>
      </div>

      <div className="mb-6 rounded-lg bg-marino-50 px-4 py-3 text-sm text-marino-500">
        Aquí se llenan los recuadros una sola vez y quedan guardados. El dibujo con los postes
        numerados y los vanos lo arma el sistema con lo que hay en{' '}
        <Link href="/red/posteria" className="text-naranja-600 hover:underline">
          Postería
        </Link>
        , así que si algo cambia ahí, la hoja se actualiza sola.
      </div>

      <EditorPlano zonas={zonas} cables={cables} planos={planos} porDefecto={PLANO_POR_DEFECTO} />

      {planos.length > 0 && (
        <Tarjeta titulo="Planos guardados" className="mt-6">
          <ul className="divide-y divide-marino-100">
            {planos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="font-medium text-marino-800">{p.name}</span>
                <span className="text-xs text-marino-400">
                  actualizado {fechaHora(p.updated_at)}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <Link
                    href={`/plano/${p.id}`}
                    className="text-sm text-naranja-600 hover:underline"
                    target="_blank"
                  >
                    ver e imprimir →
                  </Link>
                  <Borrar tipo="plano" id={p.id} nombre={p.name} />
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
