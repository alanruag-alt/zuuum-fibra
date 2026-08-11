import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditarElemento } from '@/app/(panel)/red/Editores';
import { Borrar } from '@/componentes/ui/Borrar';
import { listarElementos } from '@/modulos/red/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { SEMAFORO, TIPO_ELEMENTO, etiqueta } from '@/modulos/red/etiquetas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaFTTH() {
  const [elementos, zonas] = await Promise.all([listarElementos(), listarZonas()]);

  const activos = elementos.filter((e) => e.is_active);
  const conCupo = activos.filter((e) => e.capacity !== null && e.capacity > 0);
  const llenas = conCupo.filter((e) => e.semaforo === 'lleno');
  const porLlenarse = conCupo.filter((e) => e.semaforo === 'por_llenarse');
  const puertos = conCupo.reduce((s, e) => s + Number(e.capacity ?? 0), 0);
  const usados = conCupo.reduce((s, e) => s + Number(e.used_ports ?? 0), 0);
  const sinCapacidad = activos.filter((e) => !e.capacity);

  // Se agrupan por zona porque así se recorre la red: uno va a una localidad,
  // no a «todas las NAP del sistema».
  const porZona = new Map<string, typeof elementos>();
  for (const e of elementos) {
    const z = e.zona ?? 'Sin zona';
    if (!porZona.has(z)) porZona.set(z, []);
    porZona.get(z)!.push(e);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Red FTTH</h1>
          <p className="mt-1 text-sm text-marino-400">
            NAP, mangas y splitters, con cuánto lugar les queda.
          </p>
        </div>
        <EditarElemento zonas={zonas} padres={elementos} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(activos.length)} etiqueta="Elementos en servicio" />
        <Indicador
          valor={`${numero(usados)} / ${numero(puertos)}`}
          etiqueta="Puertos ocupados"
          tono="marca"
          detalle={puertos > 0 ? `${Math.round((usados / puertos) * 100)}% de la red` : undefined}
        />
        <Indicador
          valor={numero(porLlenarse.length)}
          etiqueta="Por llenarse"
          tono={porLlenarse.length > 0 ? 'aviso' : 'ok'}
          detalle="85% o más"
        />
        <Indicador
          valor={numero(llenas.length)}
          etiqueta="Llenas"
          tono={llenas.length > 0 ? 'falla' : 'ok'}
        />
      </div>

      {porLlenarse.length + llenas.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          {[...llenas, ...porLlenarse].map((e) => e.code).join(', ')} —{' '}
          {llenas.length > 0 ? 'ya no cabe nadie ahí' : 'quedan pocos puertos'}. Si en esa calle
          quieren contratar, hay que tender antes de prometer fecha.
        </div>
      )}

      {sinCapacidad.length > 0 && (
        <div className="mb-6 rounded-lg bg-marino-50 px-4 py-3 text-sm text-marino-500">
          <strong>{sinCapacidad.length}</strong>{' '}
          {sinCapacidad.length === 1 ? 'elemento no tiene' : 'elementos no tienen'} puesta su
          capacidad. Mientras no la tengan, el sistema no puede avisar cuándo se llenan.
        </div>
      )}

      {elementos.length === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">🕸️</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay red capturada</p>
            <p className="mt-1 text-sm text-marino-400">
              Empieza por las NAP de Cuencamé: código, cuántos puertos tiene y dónde está.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <div className="space-y-5">
          {[...porZona.entries()].map(([zona, lista]) => (
            <Tarjeta key={zona} titulo={zona} descripcion={`${lista.length} elementos`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                      <th className="pb-2 pr-3 font-medium">Código</th>
                      <th className="pb-2 pr-3 font-medium">Tipo</th>
                      <th className="pb-2 pr-3 font-medium">Referencia</th>
                      <th className="pb-2 pr-3 font-medium">Ocupación</th>
                      <th className="pb-2 pr-3 text-right font-medium">Clientes</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-marino-100">
                    {lista.map((e) => {
                      const s = etiqueta(SEMAFORO, e.semaforo);
                      const pct = e.ocupacion_pct ?? 0;
                      return (
                        <tr key={e.id} className={e.is_active ? '' : 'opacity-50'}>
                          <td className="py-2.5 pr-3 font-mono text-xs font-medium text-marino-800">
                            {e.code}
                          </td>
                          <td className="py-2.5 pr-3 text-marino-500">
                            {TIPO_ELEMENTO[e.element_type] ?? e.element_type}
                          </td>
                          <td className="py-2.5 pr-3 text-marino-500">{e.name ?? '—'}</td>
                          <td className="py-2.5 pr-3">
                            {e.capacity ? (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-marino-100">
                                  <div
                                    className={`h-full ${
                                      s.tono === 'falla'
                                        ? 'bg-falla'
                                        : s.tono === 'aviso'
                                          ? 'bg-aviso'
                                          : 'bg-exito'
                                    }`}
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-marino-500">
                                  {e.used_ports}/{e.capacity}
                                </span>
                                <Insignia tono={s.tono}>{s.texto}</Insignia>
                              </div>
                            ) : (
                              <span className="text-xs text-marino-300">sin capacidad</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-marino-600">
                            {numero(e.servicios)}
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-start justify-end gap-1">
                              <EditarElemento zonas={zonas} elemento={e} padres={elementos} />
                              <Borrar tipo="elemento" id={e.id} nombre={e.code} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          ))}
        </div>
      )}
    </div>
  );
}
