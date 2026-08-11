import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Borrar } from '@/componentes/ui/Borrar';
import { Fotos } from '@/componentes/ui/Fotos';
import { Alimentar, EditarSplitter, Salidas } from '@/app/(panel)/red/ftth/splitters/Editor';
import { cajasParaSplitter, listarSplitters, salidasDe } from '@/modulos/ftth/splitters';
import { TIPO_CAJA } from '@/modulos/ftth/splitter_tipos';
import { hilosSinOrigen, listarPuertosOdf } from '@/modulos/red/olt';
import { listarElementos } from '@/modulos/red/consultas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaSplitters() {
  const [splitters, cajas, hilos, puertosOdf, naps] = await Promise.all([
    listarSplitters(),
    cajasParaSplitter(),
    hilosSinOrigen(),
    listarPuertosOdf(),
    listarElementos(['nap']),
  ]);

  const salidasPorSplitter = Object.fromEntries(
    await Promise.all(splitters.map(async (s) => [s.id, await salidasDe(s.id)] as const)),
  );

  const activos = splitters.filter((s) => s.is_active);
  const salidas = activos.reduce((t, s) => t + s.salidas, 0);
  const usadas = activos.reduce((t, s) => t + s.usadas, 0);
  const libres = activos.reduce((t, s) => t + s.libres, 0);
  const sinEntrada = activos.filter((s) => !s.entrada);

  const odfElegibles = puertosOdf
    .filter((p) => p.pon_port_id)
    .map((p) => ({
      id: p.id,
      etiqueta: `${p.odf} bandeja ${p.tray_number} puerto ${p.port_number}${p.pon ? ` (${p.pon})` : ''}`,
    }));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-marino-500">
          El divisor es lo que convierte una fibra en ocho. Va siempre dentro de una caja, y de
          cuántas salidas le queden depende cuántos clientes más caben en esa zona sin tender cable
          nuevo.
        </p>
        <EditarSplitter cajas={cajas} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(activos.length)} etiqueta="Splitters" />
        <Indicador valor={numero(salidas)} etiqueta="Salidas en total" tono="marca" />
        <Indicador valor={numero(usadas)} etiqueta="Usadas" />
        <Indicador
          valor={numero(libres)}
          etiqueta="Libres"
          tono={libres === 0 ? 'falla' : libres < 5 ? 'aviso' : 'ok'}
          detalle={libres === 0 ? 'no cabe nadie más' : undefined}
        />
      </div>

      {sinEntrada.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          <strong>{sinEntrada.length}</strong>{' '}
          {sinEntrada.length === 1 ? 'splitter no tiene' : 'splitters no tienen'} capturado de dónde
          les entra la luz: {sinEntrada.map((s) => s.code).join(', ')}. Mientras no lo tengan, los
          clientes que cuelgan de ahí no se pueden trazar hasta la OLT.
        </div>
      )}

      {splitters.length === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">🔱</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay splitters</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              Primero da de alta la caja de empalme o la NAP donde va montado, y luego ponlo aquí.
              Las salidas se crean solas según la razón.
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
                      <Insignia tono="neutro">
                        en {TIPO_CAJA[s.tipo_caja] ?? s.tipo_caja} {s.caja}
                      </Insignia>
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
                      {s.sitio && ` · ${s.sitio}`}
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
                    <EditarSplitter cajas={cajas} splitter={s} />
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
