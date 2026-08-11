import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditarPoste, ImportarKmz, Renumerar } from '@/app/(panel)/red/posteria/Editor';
import { Borrar } from '@/componentes/ui/Borrar';
import { listarPostes } from '@/modulos/posteria/consultas';
import { listarCables } from '@/modulos/ftth/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { TIPO_POSTE } from '@/modulos/posteria/tipos';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaPosteria() {
  const [postes, cables, zonas] = await Promise.all([
    listarPostes(),
    listarCables(),
    listarZonas(),
  ]);

  const sueltos = postes.filter((p) => !p.cable_id);
  const nuevos = postes.filter((p) => p.is_new);
  const conVano = postes.filter((p) => p.span_m !== null);
  const metros = conVano.reduce((s, p) => s + Number(p.span_m ?? 0), 0);
  const vanoLargo = conVano.filter((p) => Number(p.span_m) > 80);

  const porCable = new Map<string, typeof postes>();
  for (const p of postes) {
    const k = p.cable ?? '— sin cable —';
    if (!porCable.has(k)) porCable.set(k, []);
    porCable.get(k)!.push(p);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Postería</h1>
          <p className="mt-1 text-sm text-marino-400">
            Los postes numerados y sus vanos, listos para el trámite de CFE.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportarKmz zonas={zonas} />
          <EditarPoste zonas={zonas} cables={cables} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(postes.length)} etiqueta="Postes" />
        <Indicador
          valor={metros >= 1000 ? `${(metros / 1000).toFixed(2)} km` : `${numero(metros)} m`}
          etiqueta="Suma de los vanos"
          tono="marca"
          detalle={`${conVano.length} vanos`}
        />
        <Indicador
          valor={numero(nuevos.length)}
          etiqueta="Por plantar"
          tono={nuevos.length > 0 ? 'aviso' : 'neutro'}
        />
        <Indicador
          valor={numero(sueltos.length)}
          etiqueta="Fuera de toda ruta"
          tono={sueltos.length > 0 ? 'aviso' : 'ok'}
        />
      </div>

      <Tarjeta className="mb-6">
        <Renumerar cables={cables} />
        <p className="mt-3 text-xs text-marino-400">
          Renumerar pega cada poste al cable que le pasa más cerca (hasta 35 m de la línea), lo
          ordena a lo largo del recorrido, le pone número y mide el vano contra el anterior. Se
          puede correr las veces que haga falta.
        </p>
      </Tarjeta>

      {sueltos.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          <strong>{sueltos.length}</strong>{' '}
          {sueltos.length === 1 ? 'poste quedó' : 'postes quedaron'} lejos de toda ruta. Casi
          siempre es una de dos: al cable le falta su trazo —se pone importando el KMZ o dibujándolo
          en el mapa— o el poste tiene mal las coordenadas.
        </div>
      )}

      {vanoLargo.length > 0 && (
        <div className="mb-6 rounded-lg bg-marino-50 px-4 py-3 text-sm text-marino-500">
          <strong>{vanoLargo.length}</strong> {vanoLargo.length === 1 ? 'vano pasa' : 'vanos pasan'}{' '}
          de 80 m. Con ADSS eso ya pide revisar la flecha y la tensión; CFE suele preguntarlo.
        </div>
      )}

      {postes.length === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">📍</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay postería</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              Si ya la tienes marcada en Google Earth, impórtala: el KMZ trae las coordenadas y el
              sistema hace la numeración y los vanos solo.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          {[...porCable.entries()].map(([cable, lista]) => {
            const suma = lista.reduce((s, p) => s + Number(p.span_m ?? 0), 0);
            return (
              <Tarjeta
                key={cable}
                titulo={cable}
                descripcion={`${lista.length} postes${suma ? ` · ${numero(suma)} m de vanos` : ''}`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                        <th className="pb-2 pr-3 font-medium">Nº</th>
                        <th className="pb-2 pr-3 font-medium">Etiqueta</th>
                        <th className="pb-2 pr-3 font-medium">De quién</th>
                        <th className="pb-2 pr-3 font-medium">Coordenadas</th>
                        <th className="pb-2 pr-3 text-right font-medium">Vano</th>
                        <th className="pb-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-marino-100">
                      {lista.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 pr-3 font-semibold text-marino-800">
                            {p.number ?? '—'}
                            {p.is_new && (
                              <span className="ml-1.5">
                                <Insignia tono="aviso">nuevo</Insignia>
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-marino-500">{p.code ?? '—'}</td>
                          <td className="py-2 pr-3 text-marino-500">
                            {TIPO_POSTE[p.pole_type] ?? p.pole_type}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-marino-400">
                            {p.latitude !== null && p.longitude !== null
                              ? `${Number(p.latitude).toFixed(6)}, ${Number(p.longitude).toFixed(6)}`
                              : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right text-marino-600">
                            {p.span_m !== null ? (
                              <>
                                {numero(Number(p.span_m))} m
                                {p.viene_de !== null && (
                                  <span className="ml-1 text-xs text-marino-300">
                                    del {p.viene_de}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-marino-300">—</span>
                            )}
                          </td>
                          <td className="py-2">
                            <div className="flex items-center justify-end gap-1">
                              <EditarPoste zonas={zonas} cables={cables} poste={p} />
                              <Borrar
                                tipo="poste"
                                id={p.id}
                                nombre={`el poste ${p.number ?? ''}`}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-sm text-marino-400">
        Cuando la numeración esté como la quieres,{' '}
        <Link href="/red/plano" className="text-naranja-600 hover:underline">
          arma la hoja para CFE
        </Link>
        .
      </p>
    </div>
  );
}
