import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { impactoDeCorte } from '@/modulos/ftth/consultas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaImpacto() {
  const filas = await impactoDeCorte();

  const conGente = filas.filter((f) => f.clientes_afectados > 0);
  const peor = conGente[0];
  const cables = conGente.filter((f) => f.tipo === 'cable');
  const cajas = conGente.filter((f) => f.tipo === 'caja');
  const criticos = conGente.filter((f) => f.clientes_afectados >= 20);

  return (
    <div>
      <p className="mb-5 text-sm text-marino-500">
        A cuánta gente dejas sin internet si se corta cada cable o falla cada caja.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={peor ? numero(peor.clientes_afectados) : '0'}
          etiqueta="El peor punto"
          tono={peor && peor.clientes_afectados >= 20 ? 'falla' : 'aviso'}
          detalle={peor?.elemento}
        />
        <Indicador valor={numero(cables.length)} etiqueta="Cables con gente detrás" />
        <Indicador valor={numero(cajas.length)} etiqueta="Cajas con gente detrás" />
        <Indicador
          valor={numero(criticos.length)}
          etiqueta="Puntos críticos"
          tono={criticos.length > 0 ? 'falla' : 'ok'}
          detalle="20 clientes o más"
        />
      </div>

      <div className="mb-6 rounded-lg bg-marino-50 px-4 py-3 text-sm text-marino-500">
        Esta cuenta se hace en frío, no cuando ya está sonando el teléfono. Sirve para dos cosas:
        decidir a dónde mandar la cuadrilla primero, y saber a quién hay que hablarle{' '}
        <strong>antes</strong> de que hablen ellos. Un cliente al que le avisan que su servicio se
        cayó y cuánto va a tardar reclama mucho menos que uno que se entera solo.
      </div>

      {conGente.length === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">🛡️</p>
            <p className="mt-3 text-sm font-medium text-marino-800">
              Todavía no hay clientes colgados de la red capturada
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              Este número aparece cuando las NAP tengan capturado de qué hilo cuelgan y sus puertos
              tengan clientes. Sin eso, el sistema no sabe a quién afecta cada tramo.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <Tarjeta>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                  <th className="pb-2 pr-3 font-medium">Si falla…</th>
                  <th className="pb-2 pr-3 font-medium">Qué es</th>
                  <th className="pb-2 pr-3 font-medium">Zona</th>
                  <th className="pb-2 pr-3 text-right font-medium">Clientes</th>
                  <th className="pb-2 pr-3 text-right font-medium">NAP</th>
                  <th className="pb-2 font-medium">Gravedad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-marino-100">
                {conGente.map((f) => {
                  const grave = f.clientes_afectados >= 20;
                  const medio = f.clientes_afectados >= 8;
                  return (
                    <tr key={`${f.tipo}-${f.id}`}>
                      <td className="py-2.5 pr-3 font-mono text-xs font-medium text-marino-800">
                        {f.elemento}
                      </td>
                      <td className="py-2.5 pr-3 text-marino-500">
                        {f.tipo === 'cable' ? 'Cable' : 'Caja de empalme'}
                      </td>
                      <td className="py-2.5 pr-3 text-marino-500">{f.zona ?? '—'}</td>
                      <td
                        className={`py-2.5 pr-3 text-right font-semibold ${
                          grave ? 'text-falla' : medio ? 'text-aviso' : 'text-marino-700'
                        }`}
                      >
                        {numero(f.clientes_afectados)}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-marino-500">
                        {numero(f.naps_afectadas)}
                      </td>
                      <td className="py-2.5">
                        <Insignia tono={grave ? 'falla' : medio ? 'aviso' : 'neutro'}>
                          {grave ? 'Crítico' : medio ? 'Alto' : 'Bajo'}
                        </Insignia>
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
