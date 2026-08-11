import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { listarCajasDeEmpalme } from '@/modulos/ftth/caja';
import { listarFusiones } from '@/modulos/ftth/consultas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

/**
 * Las cajas, para entrar a abrirlas.
 *
 * Cada renglón lleva a su diagrama. Se ordenan por las que tienen trabajo
 * adentro: una caja con cables y sin un solo empalme es casi siempre una caja
 * que se puso y se quedó pendiente.
 */
export default async function PaginaCajas() {
  const [cajas, fusiones] = await Promise.all([listarCajasDeEmpalme(), listarFusiones()]);

  const porCaja = new Map<string, number>();
  for (const f of fusiones) {
    if (f.status !== 'activa') continue;
    porCaja.set(f.caja, (porCaja.get(f.caja) ?? 0) + 1);
  }

  const sinEmpalmes = cajas.filter((c) => (porCaja.get(c.code) ?? 0) === 0).length;

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm text-marino-500">
        Abrir una caja y ver qué hay adentro: los cables que llegan, los hilos de cada uno y qué
        está pegado con qué. Se empalma arrastrando de un hilo a otro, igual que con la fusionadora
        enfrente.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Indicador valor={numero(cajas.length)} etiqueta="Cajas de empalme" />
        <Indicador
          valor={numero(fusiones.filter((f) => f.status === 'activa').length)}
          etiqueta="Empalmes activos"
          tono="marca"
        />
        <Indicador
          valor={numero(sinEmpalmes)}
          etiqueta="Cajas sin un solo empalme"
          tono={sinEmpalmes > 0 ? 'aviso' : 'ok'}
        />
      </div>

      {cajas.length === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">📦</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay cajas</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              Las cajas se colocan sobre la línea de un cable, en el mapa. Ahí es donde se abre la
              fibra y se derivan los hilos.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <Tarjeta>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                  <th className="pb-2 pr-3 font-medium">Caja</th>
                  <th className="pb-2 pr-3 font-medium">Nombre</th>
                  <th className="pb-2 pr-3 font-medium">Tipo</th>
                  <th className="pb-2 pr-3 font-medium">Zona</th>
                  <th className="pb-2 pr-3 text-right font-medium">Empalmes</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-marino-100">
                {cajas.map((c) => {
                  const n = porCaja.get(c.code) ?? 0;
                  return (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 font-mono font-medium text-marino-800">{c.code}</td>
                      <td className="py-2 pr-3 text-marino-600">{c.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-marino-500">
                        {c.element_type === 'nap' ? 'NAP' : 'De empalme'}
                      </td>
                      <td className="py-2 pr-3 text-marino-500">{c.zona ?? '—'}</td>
                      <td className="py-2 pr-3 text-right">
                        {n === 0 ? (
                          <Insignia tono="aviso">sin empalmes</Insignia>
                        ) : (
                          <Insignia tono="ok">{n}</Insignia>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/red/ftth/caja/${c.id}`}
                          className="text-sm font-medium text-naranja-600 hover:underline"
                        >
                          abrir la caja →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
