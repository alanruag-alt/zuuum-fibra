import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditorPlanes } from '@/app/(panel)/planes/EditorPlanes';
import { listarPlanes } from '@/modulos/admin/consultas';
import { numero, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const RED: Record<string, string> = { ftth: 'Fibra', wisp: 'Inalámbrico', both: 'Ambas' };

export default async function PaginaPlanes() {
  const planes = await listarPlanes();

  const enUso = planes.filter((p) => p.contratados > 0);
  const heredados = planes.filter((p) => p.is_legacy);
  const ingreso = planes.reduce((s, p) => s + p.price * p.contratados, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Planes</h1>
        <p className="mt-1 text-sm text-marino-400">
          El catálogo. Los precios que vinieron de los Excel entran marcados como heredados.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(planes.length)} etiqueta="Planes" />
        <Indicador valor={numero(enUso.length)} etiqueta="Con clientes" tono="ok" />
        <Indicador
          valor={numero(heredados.length)}
          etiqueta="Heredados del Excel"
          detalle="no se ofrecen a nuevos"
        />
        <Indicador valor={pesos(ingreso)} etiqueta="Ingreso teórico" tono="marca" />
      </div>

      <Tarjeta className="mb-6">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-marino-100">
                {['Plan', 'Código', 'Precio', 'Velocidad', 'Red', 'Clientes', 'Estado'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-marino-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-marino-100">
              {planes.map((p) => (
                <tr key={p.id} className={p.is_active ? undefined : 'opacity-50'}>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-marino-800">{p.name}</span>
                    {p.is_legacy && (
                      <span className="ml-2">
                        <Insignia tono="neutro">heredado</Insignia>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-marino-500">{p.code}</td>
                  <td className="px-3 py-2.5 font-semibold text-marino-800">{pesos(p.price)}</td>
                  <td className="px-3 py-2.5 text-marino-500">
                    {p.download_mbps ? `${p.download_mbps} Mbps` : '—'}
                    {p.upload_mbps ? ` / ${p.upload_mbps}` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-marino-500">
                    {RED[p.network_type] ?? p.network_type}
                  </td>
                  <td className="px-3 py-2.5 text-marino-600">{numero(p.contratados)}</td>
                  <td className="px-3 py-2.5">
                    {!p.is_active ? (
                      <Insignia tono="neutro">Inactivo</Insignia>
                    ) : p.visible_for_sale ? (
                      <Insignia tono="ok">Se ofrece</Insignia>
                    ) : (
                      <Insignia tono="aviso">No se ofrece</Insignia>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <EditorPlanes planes={planes} />
    </div>
  );
}
