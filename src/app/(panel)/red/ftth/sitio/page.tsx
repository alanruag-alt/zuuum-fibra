import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { NuevaTarjeta, NuevasBandejas, Patchear } from '@/app/(panel)/red/ftth/sitio/Editores';
import {
  hilosSinOrigen,
  listarPuertosOdf,
  listarPuertosPon,
  listarSitiosRed,
  listarTarjetas,
} from '@/modulos/red/olt';
import { listarDispositivos, listarElementos } from '@/modulos/red/consultas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaSitio() {
  const [sitios, tarjetas, pones, puertosOdf, olts, odfs, hilos] = await Promise.all([
    listarSitiosRed(),
    listarTarjetas(),
    listarPuertosPon(),
    listarPuertosOdf(),
    listarDispositivos(['olt']),
    listarElementos(['odf']),
    hilosSinOrigen(),
  ]);

  const patcheados = pones.filter((p) => p.odf_port_id).length;
  const conCable = puertosOdf.filter((p) => p.out_strand_id).length;
  const libres = puertosOdf.filter((p) => p.status === 'libre').length;

  // Los puertos del ODF se agrupan por bandeja, que es como se ven parado
  // enfrente: una charola a la vez, no una lista de cien renglones.
  const porOdf = new Map<string, typeof puertosOdf>();
  for (const p of puertosOdf) {
    const k = p.odf;
    if (!porOdf.has(k)) porOdf.set(k, []);
    porOdf.get(k)!.push(p);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-marino-500">
          Lo que hay dentro de la caseta. Aquí empieza la red: la OLT reparte por sus puertos PON,
          cada PON llega a un puerto del ODF, y de ese puerto arranca el hilo que se va a la calle.
        </p>
        <div className="flex flex-wrap gap-2">
          <NuevaTarjeta olts={olts.map((o) => ({ id: o.id, name: o.name }))} />
          <NuevasBandejas odfs={odfs.map((o) => ({ id: o.id, code: o.code }))} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={numero(pones.length)}
          etiqueta="Puertos PON"
          detalle={`${tarjetas.length} tarjetas`}
        />
        <Indicador
          valor={`${numero(patcheados)} / ${numero(pones.length)}`}
          etiqueta="PON patcheados"
          tono="marca"
        />
        <Indicador valor={numero(conCable)} etiqueta="Puertos con cable" tono="ok" />
        <Indicador
          valor={numero(libres)}
          etiqueta="Puertos del ODF libres"
          tono={libres === 0 ? 'aviso' : 'neutro'}
        />
      </div>

      {sitios.length > 0 && (
        <Tarjeta className="mb-6" titulo="Los sitios">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                  <th className="pb-2 pr-3 font-medium">Sitio</th>
                  <th className="pb-2 pr-3 font-medium">Zona</th>
                  <th className="pb-2 pr-3 text-right font-medium">OLT</th>
                  <th className="pb-2 pr-3 text-right font-medium">Tarjetas</th>
                  <th className="pb-2 pr-3 text-right font-medium">PON</th>
                  <th className="pb-2 pr-3 text-right font-medium">ODF</th>
                  <th className="pb-2 text-right font-medium">Puertos libres</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-marino-100">
                {sitios.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3 font-medium text-marino-800">{s.name}</td>
                    <td className="py-2 pr-3 text-marino-500">{s.zona ?? '—'}</td>
                    <td className="py-2 pr-3 text-right text-marino-600">{s.olts}</td>
                    <td className="py-2 pr-3 text-right text-marino-600">{s.tarjetas}</td>
                    <td className="py-2 pr-3 text-right text-marino-600">
                      {s.pon_patcheados}/{s.puertos_pon}
                    </td>
                    <td className="py-2 pr-3 text-right text-marino-600">{s.odfs}</td>
                    <td className="py-2 text-right">
                      {s.puertos_odf === 0 ? (
                        <span className="text-marino-300">sin bandejas</span>
                      ) : (
                        <Insignia tono={s.odf_libres === 0 ? 'falla' : 'ok'}>
                          {s.odf_libres} de {s.puertos_odf}
                        </Insignia>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      {tarjetas.length > 0 && (
        <Tarjeta className="mb-6" titulo="Tarjetas y puertos PON">
          <div className="space-y-4">
            {tarjetas.map((t) => {
              const suyos = pones.filter((p) => p.card_id === t.id);
              return (
                <div key={t.id}>
                  <p className="mb-2 text-sm font-medium text-marino-700">
                    {t.olt} · slot {t.slot_number}
                    {t.card_type && (
                      <span className="ml-2 font-normal text-marino-400">{t.card_type}</span>
                    )}
                    <span className="ml-2 text-xs font-normal text-marino-400">
                      {t.patcheados} de {t.puertos} patcheados
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suyos.map((p) => (
                      <span
                        key={p.id}
                        title={
                          p.odf
                            ? `${p.etiqueta} → ${p.odf} bandeja ${p.tray_number} puerto ${p.odf_port_number}${
                                p.cable ? ` → ${p.cable} hilo ${p.strand_number}` : ''
                              }`
                            : `${p.etiqueta} · sin patchear`
                        }
                        className={`rounded-md border px-2 py-1 font-mono text-xs ${
                          p.odf_port_id
                            ? 'border-green-200 bg-green-50 text-exito'
                            : 'border-marino-200 bg-white text-marino-500'
                        }`}
                      >
                        {p.etiqueta}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-marino-400">
            En verde los que ya tienen latiguillo al ODF. Pasa el cursor por uno para ver a dónde
            va.
          </p>
        </Tarjeta>
      )}

      {porOdf.size === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">🧷</p>
            <p className="mt-3 text-sm font-medium text-marino-800">El ODF no tiene bandejas</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              Da de alta el ODF en <strong>Elementos</strong> y luego ábrele sus bandejas aquí. Sin
              puertos de ODF, el cable de la calle no tiene de dónde salir y la ruta de los clientes
              queda cortada en la caseta.
            </p>
          </div>
        </Tarjeta>
      ) : (
        [...porOdf.entries()].map(([odf, lista]) => {
          const bandejas = [...new Set(lista.map((p) => p.tray_number))].sort((a, b) => a - b);
          return (
            <Tarjeta
              key={odf}
              className="mb-4"
              titulo={odf}
              descripcion={`${lista.length} puertos · ${lista.filter((p) => p.status === 'libre').length} libres`}
            >
              {bandejas.map((b) => (
                <div key={b} className="mb-4 last:mb-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-marino-400">
                    Bandeja {b}
                  </p>
                  <div className="space-y-1">
                    {lista
                      .filter((p) => p.tray_number === b)
                      .map((p) => (
                        <div key={p.id} className="rounded-lg border border-marino-100 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="w-8 shrink-0 font-mono font-semibold text-marino-800">
                              {p.port_number}
                            </span>
                            {p.pon ? (
                              <span className="text-marino-600">
                                <span className="text-marino-400">entra</span>{' '}
                                <span className="font-mono">{p.pon}</span>
                                <span className="text-marino-400"> de {p.olt}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-marino-300">sin PON</span>
                            )}
                            <span className="text-marino-300">→</span>
                            {p.cable ? (
                              <span className="text-marino-600">
                                <span className="font-mono">{p.cable}</span>
                                <span className="text-marino-400">
                                  {' '}
                                  hilo {p.strand_number} ({p.color_hilo})
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-marino-300">sin cable</span>
                            )}
                            <span className="ml-auto">
                              <Patchear puerto={p} pones={pones} hilos={hilos} />
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </Tarjeta>
          );
        })
      )}
    </div>
  );
}
