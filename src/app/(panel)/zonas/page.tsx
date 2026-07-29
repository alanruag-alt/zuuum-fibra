import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditorZonas } from '@/app/(panel)/zonas/EditorZonas';
import { listarZonasDetalle } from '@/modulos/admin/consultas';
import { numero, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const RED: Record<string, string> = { ftth: 'Fibra', wisp: 'Inalámbrico', mixed: 'Mixta' };

export default async function PaginaZonas() {
  const zonas = await listarZonasDetalle();

  const total = zonas.reduce((s, z) => s + z.clientes, 0);
  const ingreso = zonas.reduce((s, z) => s + z.ingreso, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Zonas</h1>
        <p className="mt-1 text-sm text-marino-400">
          Las localidades donde ZUUUM da servicio. De aquí cuelga quién ve a quién.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(zonas.length)} etiqueta="Zonas" />
        <Indicador
          valor={numero(zonas.filter((z) => z.is_active).length)}
          etiqueta="Activas"
          tono="ok"
        />
        <Indicador valor={numero(total)} etiqueta="Clientes" />
        <Indicador valor={pesos(ingreso)} etiqueta="Ingreso mensual" tono="marca" />
      </div>

      <Tarjeta className="mb-6">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-marino-100">
                {['Zona', 'Código', 'Red', 'Clientes', 'Activos', 'Ingreso', 'Estado'].map((h) => (
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
              {zonas.map((z) => (
                <tr key={z.id} className={z.is_active ? undefined : 'opacity-50'}>
                  <td className="px-3 py-2.5 font-medium text-marino-800">{z.name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-marino-500">{z.code}</td>
                  <td className="px-3 py-2.5 text-marino-500">
                    {RED[z.network_type] ?? z.network_type}
                  </td>
                  <td className="px-3 py-2.5 text-marino-600">{numero(z.clientes)}</td>
                  <td className="px-3 py-2.5 text-marino-600">{numero(z.activos)}</td>
                  <td className="px-3 py-2.5 font-medium text-marino-800">{pesos(z.ingreso)}</td>
                  <td className="px-3 py-2.5">
                    {z.is_active ? (
                      <Insignia tono="ok">Activa</Insignia>
                    ) : (
                      <Insignia tono="neutro">Inactiva</Insignia>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <EditorZonas zonas={zonas} />
    </div>
  );
}
