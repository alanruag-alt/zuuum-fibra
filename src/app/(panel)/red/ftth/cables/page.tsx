import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditarCable, Hilos } from '@/app/(panel)/red/ftth/cables/Editor';
import { Borrar } from '@/componentes/ui/Borrar';
import { hilosDe, listarCables } from '@/modulos/ftth/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { TIPO_CABLE } from '@/modulos/ftth/etiquetas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaCables() {
  const [cables, zonas] = await Promise.all([listarCables(), listarZonas()]);

  // Los hilos se traen de una vez: son pocos renglones por cable y así la
  // pantalla no tiene que ir y venir cada que se abre uno.
  const hilosPorCable = Object.fromEntries(
    await Promise.all(cables.map(async (c) => [c.id, await hilosDe(c.id)] as const)),
  );

  const activos = cables.filter((c) => c.is_active);
  const metros = activos.reduce((s, c) => s + Number(c.length_m ?? 0), 0);
  const libres = activos.reduce((s, c) => s + Number(c.libres ?? 0), 0);
  const lastimados = activos.reduce((s, c) => s + Number(c.lastimados ?? 0), 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-marino-500">
          Cada cable con sus hilos. El color no se captura: sale de la norma.
        </p>
        <EditarCable zonas={zonas} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(activos.length)} etiqueta="Cables en servicio" />
        <Indicador
          valor={metros >= 1000 ? `${(metros / 1000).toFixed(2)} km` : `${numero(metros)} m`}
          etiqueta="Fibra tendida"
          tono="marca"
        />
        <Indicador valor={numero(libres)} etiqueta="Hilos libres" tono="ok" />
        <Indicador
          valor={numero(lastimados)}
          etiqueta="Hilos dañados o cortados"
          tono={lastimados > 0 ? 'falla' : 'ok'}
        />
      </div>

      {cables.length === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">🧵</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay cables</p>
            <p className="mt-1 text-sm text-marino-400">
              Empieza por el troncal que sale de la caseta. Con decir cuántos hilos trae, los hilos
              se crean solos.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          {cables.map((c) => {
            const hilos = hilosPorCable[c.id] ?? [];
            const usados = c.hilos - c.libres;
            const pct = c.hilos ? Math.round((usados / c.hilos) * 100) : 0;
            return (
              <Tarjeta key={c.id} className={c.is_active ? '' : 'opacity-60'}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-marino-800">
                        {c.code}
                      </span>
                      <Insignia tono="neutro">{TIPO_CABLE[c.cable_type] ?? c.cable_type}</Insignia>
                      <Insignia tono="marca">{c.fiber_count} hilos</Insignia>
                      {c.lastimados > 0 && (
                        <Insignia tono="falla">
                          {c.lastimados}{' '}
                          {c.lastimados === 1 ? 'hilo lastimado' : 'hilos lastimados'}
                        </Insignia>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-marino-500">
                      {c.zona}
                      {c.length_m ? ` · ${numero(Number(c.length_m))} m` : ''}
                      {c.postes > 0 && ` · ${c.postes} postes`}
                    </p>
                    {/* Los extremos salen del trazo: el primer punto y el último. */}
                    {c.puntos_trazo >= 2 ? (
                      <p className="mt-0.5 font-mono text-xs text-marino-400">
                        {Number(c.desde_lat).toFixed(6)}, {Number(c.desde_lon).toFixed(6)}
                        {' → '}
                        {Number(c.hasta_lat).toFixed(6)}, {Number(c.hasta_lon).toFixed(6)}
                        <span className="ml-2 font-sans">{c.puntos_trazo} puntos de trazo</span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-aviso">
                        Sin ruta dibujada. Márcala en la pestaña Mapa y de ahí salen sus extremos y
                        su longitud.
                      </p>
                    )}
                    {c.notes && <p className="mt-0.5 text-xs text-marino-400">{c.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-medium text-marino-700">
                        {c.libres} <span className="font-normal text-marino-400">libres</span>
                      </p>
                      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-marino-100">
                        <div
                          className={`h-full ${
                            pct >= 100 ? 'bg-falla' : pct >= 85 ? 'bg-aviso' : 'bg-exito'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                    <EditarCable zonas={zonas} cable={c} />
                    <Borrar tipo="cable" id={c.id} nombre={c.code} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Hilos hilos={hilos} />
                  {c.puntos_trazo >= 2 && (
                    <Borrar
                      tipo="trazo"
                      id={c.id}
                      nombre={`el trazo de ${c.code}`}
                      texto="borrar el trazo"
                    />
                  )}
                </div>
              </Tarjeta>
            );
          })}
        </div>
      )}
    </div>
  );
}
