import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Borrar } from '@/componentes/ui/Borrar';
import { Fotos } from '@/componentes/ui/Fotos';
import {
  Alimentar,
  EditarSplitter,
  Salidas,
} from '@/app/(panel)/red/ftth/caja/[id]/SplitterEditor';
import { listarSplitters, salidasDe } from '@/modulos/ftth/splitters';
import { hilosSinOrigen, listarPuertosOdf } from '@/modulos/red/olt';
import { listarElementos } from '@/modulos/red/consultas';

/**
 * Los splitters de esta caja, dentro de la caja.
 *
 * Antes vivían en una pestaña aparte, pero un splitter no existe suelto: está
 * montado en una caja de empalme o en una NAP. Manejarlo aquí —donde se ve la
 * caja por dentro— es lo mismo que hace el técnico parado frente a ella.
 */
export async function SplittersDeCaja({
  caja,
}: {
  caja: { id: string; code: string; tipo: string; zona: string | null };
}) {
  const [todos, hilos, puertosOdf, naps] = await Promise.all([
    listarSplitters(),
    hilosSinOrigen(),
    listarPuertosOdf(),
    listarElementos(['nap']),
  ]);

  const splitters = todos.filter((s) => s.housing_id === caja.id);

  const salidasPorSplitter = Object.fromEntries(
    await Promise.all(splitters.map(async (s) => [s.id, await salidasDe(s.id)] as const)),
  );

  const odfElegibles = puertosOdf
    .filter((p) => p.pon_port_id)
    .map((p) => ({
      id: p.id,
      etiqueta: `${p.odf} bandeja ${p.tray_number} puerto ${p.port_number}${p.pon ? ` (${p.pon})` : ''}`,
    }));

  const cajaFija = { id: caja.id, code: caja.code, tipo: caja.tipo };

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-marino-800">🔱 Splitters en esta caja</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-marino-400">
            El divisor convierte una fibra en ocho. De cuántas salidas le queden depende cuántos
            clientes más caben en esta zona sin tender cable nuevo.
          </p>
        </div>
        <EditarSplitter cajas={[]} cajaFija={cajaFija} />
      </div>

      {splitters.length === 0 ? (
        <Tarjeta>
          <div className="py-8 text-center">
            <p className="text-2xl">🔱</p>
            <p className="mt-2 text-sm font-medium text-marino-800">
              Esta caja todavía no tiene splitters
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              Ponle uno con el botón de arriba. Sus salidas se crean solas según la razón; luego le
              dices de dónde le entra la luz y a dónde va cada salida.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          {splitters.map((s) => {
            const pct = s.salidas ? Math.round((s.usadas / s.salidas) * 100) : 0;
            return (
              <Tarjeta key={s.id} className={s.is_active ? '' : 'opacity-60'}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-marino-800">
                        {s.code}
                      </span>
                      <Insignia tono="marca">{s.ratio}</Insignia>
                      {s.danadas > 0 && (
                        <Insignia tono="falla">
                          {s.danadas} {s.danadas === 1 ? 'salida dañada' : 'salidas dañadas'}
                        </Insignia>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-marino-500">
                      {s.entrada ? (
                        <>
                          Le entra <strong>{s.entrada}</strong>
                        </>
                      ) : (
                        <span className="text-aviso">Sin entrada capturada</span>
                      )}
                      {s.loss_db !== null && ` · ${s.loss_db} dB de pérdida`}
                    </p>
                    {s.notes && <p className="mt-0.5 text-xs text-marino-400">{s.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-medium text-marino-700">
                        {s.libres} <span className="font-normal text-marino-400">libres</span>
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
                    <EditarSplitter cajas={[]} cajaFija={cajaFija} splitter={s} />
                    <Borrar tipo="splitter" id={s.id} nombre={s.code} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Alimentar splitter={s} hilos={hilos} puertosOdf={odfElegibles} />
                  <Fotos tabla="splitters" registro={s.id} nombre={s.code} />
                  <Salidas
                    salidas={salidasPorSplitter[s.id] ?? []}
                    hilos={hilos}
                    naps={naps.map((n) => ({ id: n.id, code: n.code }))}
                  />
                </div>
              </Tarjeta>
            );
          })}
        </div>
      )}
    </div>
  );
}
