import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { fusionesDeCaja, clientesDeCaja } from '@/modulos/ftth/caja';
import { TIPO_EMPALME } from '@/modulos/ftth/etiquetas';

/**
 * La tabla de conexiones de la caja.
 *
 * El dibujo dice cómo se ve; la tabla dice, renglón por renglón, qué está
 * pegado con qué. El objetivo pide las dos: la red se lee de un vistazo en el
 * dibujo y se audita en la tabla. Es lo mismo que sale al Excel, pero en
 * pantalla.
 */
export async function TablaConexiones({ caja }: { caja: string }) {
  const [fusiones, clientes] = await Promise.all([fusionesDeCaja(caja), clientesDeCaja(caja)]);

  const activas = fusiones.filter((f) => f.estado !== 'Inactiva');

  return (
    <div className="mt-6 space-y-4">
      <details open className="group">
        <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold text-marino-800">
          <span className="text-marino-400 transition-transform group-open:rotate-90">▶</span>
          Tabla de conexiones
          <span className="text-sm font-normal text-marino-400">
            ({activas.length} {activas.length === 1 ? 'conexión' : 'conexiones'})
          </span>
        </summary>

        <div className="mt-3">
          {activas.length === 0 ? (
            <Tarjeta>
              <p className="py-8 text-center text-sm text-marino-400">
                Esta caja todavía no tiene conexiones. Se van llenando conforme fusionas hilos en el
                dibujo de arriba.
              </p>
            </Tarjeta>
          ) : (
            <Tarjeta>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                      <th className="pb-2 pr-3 font-medium">Entra por</th>
                      <th className="pb-2 pr-3 font-medium">Tipo</th>
                      <th className="pb-2 pr-3 font-medium">Va a</th>
                      <th className="pb-2 pr-3 text-right font-medium">Pérdida</th>
                      <th className="pb-2 pr-3 font-medium">Técnico</th>
                      <th className="pb-2 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-marino-100">
                    {activas.map((f, i) => {
                      const entra = f.cable_entra
                        ? `${f.cable_entra} · ${f.tubo_entra ? `T${f.tubo_entra} ` : ''}H${f.hilo_entra} ${f.color_entra ?? ''}`
                        : '—';
                      const sale = f.termina_en
                        ? f.termina_en
                        : f.cable_sale
                          ? `${f.cable_sale} · ${f.tubo_sale ? `T${f.tubo_sale} ` : ''}H${f.hilo_sale} ${f.color_sale ?? ''}`
                          : 'Reserva';
                      return (
                        <tr key={i}>
                          <td className="py-2 pr-3 font-mono text-xs text-marino-700">{entra}</td>
                          <td className="py-2 pr-3 text-marino-500">
                            {TIPO_EMPALME[f.tipo] ?? f.tipo}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-marino-700">{sale}</td>
                          <td className="py-2 pr-3 text-right text-marino-500">
                            {f.perdida_db === null ? '—' : `${f.perdida_db} dB`}
                          </td>
                          <td className="py-2 pr-3 text-marino-500">{f.responsable ?? '—'}</td>
                          <td className="py-2 text-xs text-marino-400">{f.fecha ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}
        </div>
      </details>

      {clientes.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold text-marino-800">
            <span className="text-marino-400 transition-transform group-open:rotate-90">▶</span>
            Clientes que cuelgan de esta caja
            <span className="text-sm font-normal text-marino-400">
              ({clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'})
            </span>
          </summary>
          <div className="mt-3">
            <Tarjeta>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                      <th className="pb-2 pr-3 font-medium">Cliente</th>
                      <th className="pb-2 pr-3 font-medium">NAP</th>
                      <th className="pb-2 pr-3 font-medium">Puerto</th>
                      <th className="pb-2 pr-3 text-right font-medium">Rx</th>
                      <th className="pb-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-marino-100">
                    {clientes.map((c, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3 text-marino-700">{c.cliente ?? '—'}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-marino-500">
                          {c.nap ?? '—'}
                        </td>
                        <td className="py-2 pr-3 text-marino-500">{c.puerto ?? '—'}</td>
                        <td className="py-2 pr-3 text-right text-marino-500">
                          {c.rx_dbm === null ? '—' : `${c.rx_dbm} dBm`}
                        </td>
                        <td className="py-2 text-marino-500">{c.estado ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          </div>
        </details>
      )}
    </div>
  );
}
