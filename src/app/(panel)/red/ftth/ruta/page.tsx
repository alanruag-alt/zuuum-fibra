import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Insignia } from '@/componentes/ui/Insignia';
import { Buscar } from '@/app/(panel)/red/ftth/ruta/Buscar';
import { PASO, clientesParaRuta, rutaDeCliente } from '@/modulos/ftth/ruta';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ q?: string; cliente?: string }>;
}

export default async function PaginaRuta({ searchParams }: Props) {
  const { q, cliente } = await searchParams;

  const encontrados = q ? await clientesParaRuta(q) : [];
  const ruta = cliente ? await rutaDeCliente(cliente) : [];
  const quien = encontrados.find((c) => c.id === cliente);

  const roto = ruta.some((p) => p.que === 'pendiente');

  return (
    <div>
      <p className="mb-4 text-sm text-marino-500">
        Por dónde le llega el internet a un cliente: de la OLT al puerto de su NAP, paso por paso.
        Es lo que uno quisiera tener a la mano cuando alguien habla a las once de la noche.
      </p>

      <Buscar q={q ?? ''} />

      {q && encontrados.length === 0 && (
        <Tarjeta className="mt-4">
          <p className="py-6 text-center text-sm text-marino-400">
            Nadie con ese nombre o ese código.
          </p>
        </Tarjeta>
      )}

      {encontrados.length > 0 && !cliente && (
        <Tarjeta className="mt-4" titulo="¿Cuál de estos?">
          <ul className="divide-y divide-marino-100">
            {encontrados.map((c) => (
              <li key={c.id}>
                <a
                  href={`/red/ftth/ruta?q=${encodeURIComponent(q ?? '')}&cliente=${c.id}`}
                  className="flex items-center justify-between py-2.5 text-sm hover:text-naranja-600"
                >
                  <span className="font-medium text-marino-800">{c.nombre}</span>
                  <span className="text-xs text-marino-400">
                    {[c.codigo, c.zona].filter(Boolean).join(' · ')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {cliente && ruta.length === 0 && (
        <Tarjeta className="mt-4">
          <div className="py-8 text-center">
            <p className="text-3xl">🕳️</p>
            <p className="mt-3 text-sm font-medium text-marino-800">
              Ese cliente no tiene ruta capturada
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              O no tiene servicio activo, o su servicio todavía no está asignado a un puerto de NAP.
            </p>
          </div>
        </Tarjeta>
      )}

      {ruta.length > 0 && (
        <div className="mt-4">
          {roto && (
            <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
              La cadena está incompleta: hay un paso sin capturar. Mientras siga así, este cliente
              no va a aparecer cuando preguntes a quién le pega una falla en su PON.
            </div>
          )}

          <Tarjeta titulo={quien ? quien.nombre : 'La ruta'} descripcion={`${ruta.length} pasos`}>
            <ol className="mt-1">
              {ruta.map((p, i) => {
                const d = PASO[p.que] ?? { titulo: p.que, icono: '•', tono: 'neutro' };
                const ultimo = i === ruta.length - 1;
                return (
                  <li key={`${p.paso}-${p.que}`} className="flex gap-3">
                    {/* La línea vertical es lo que hace que se lea como un
                        recorrido y no como una lista de cosas sueltas. */}
                    <div className="flex flex-col items-center">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-marino-200 bg-white text-sm">
                        {d.icono}
                      </span>
                      {!ultimo && <span className="w-px flex-1 bg-marino-200" />}
                    </div>
                    <div className={`min-w-0 flex-1 ${ultimo ? 'pb-1' : 'pb-5'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-marino-400">
                          {d.titulo}
                        </span>
                        {p.que === 'pendiente' && <Insignia tono="aviso">falta</Insignia>}
                      </div>
                      <p className="text-sm font-medium text-marino-800">{p.nombre}</p>
                      {p.detalle && <p className="text-xs text-marino-500">{p.detalle}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Tarjeta>

          <p className="mt-4 text-sm text-marino-400">
            Cada renglón sale de lo capturado, no de un dibujo aparte. Si algo aquí no cuadra con la
            calle, lo que hay que corregir es la captura de ese elemento.
          </p>
        </div>
      )}
    </div>
  );
}
