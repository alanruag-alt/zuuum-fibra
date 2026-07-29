import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Convertir, NuevoProspecto, SeguirProspecto } from '@/app/(panel)/prospectos/Editor';
import { listarProspectos } from '@/modulos/campo/consultas';
import { listarPlanes } from '@/modulos/admin/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { COBERTURA, ESTADO_PROSPECTO, MOTIVO_PERDIDA, etiqueta } from '@/modulos/campo/etiquetas';
import { numero, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaProspectos() {
  const [prospectos, planes, zonas] = await Promise.all([
    listarProspectos(),
    listarPlanes(),
    listarZonas(),
  ]);

  const abiertos = prospectos.filter((p) => !['converted', 'lost'].includes(p.status));
  const convertidos = prospectos.filter((p) => p.status === 'converted');
  const olvidados = abiertos.filter((p) => p.dias_desde_alta > 7);
  const potencial = abiertos.reduce((s, p) => s + Number(p.precio_interes ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Prospectos</h1>
          <p className="mt-1 text-sm text-marino-400">
            Gente que preguntó por el servicio y todavía no lo tiene.
          </p>
        </div>
        <NuevoProspecto zonas={zonas} planes={planes} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(abiertos.length)} etiqueta="En seguimiento" tono="marca" />
        <Indicador valor={numero(convertidos.length)} etiqueta="Ya son clientes" tono="ok" />
        <Indicador
          valor={numero(olvidados.length)}
          etiqueta="Más de una semana"
          tono={olvidados.length > 0 ? 'aviso' : 'ok'}
          detalle={olvidados.length > 0 ? 'sin moverse' : undefined}
        />
        <Indicador valor={pesos(potencial)} etiqueta="Mensualidad potencial" />
      </div>

      {olvidados.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          <strong>{olvidados.length}</strong>{' '}
          {olvidados.length === 1 ? 'interesado lleva' : 'interesados llevan'} más de una semana sin
          moverse. Un prospecto que no se sigue en la primera semana casi siempre ya se fue con
          alguien más.
        </div>
      )}

      <Tarjeta>
        {prospectos.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">🌱</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay interesados</p>
            <p className="mt-1 text-sm text-marino-400">
              Cada vez que alguien pregunte por el servicio, anótalo aquí. Es la diferencia entre
              acordarse y no acordarse.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-marino-100">
            {prospectos.map((p) => {
              const e = etiqueta(ESTADO_PROSPECTO, p.status);
              const c = etiqueta(COBERTURA, p.coverage_status);
              return (
                <li key={p.id} className="py-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-marino-800">{p.full_name}</span>
                        <Insignia tono={e.tono}>{e.texto}</Insignia>
                        <Insignia tono={c.tono}>{c.texto}</Insignia>
                        {p.status === 'lost' && p.lost_reason && (
                          <span className="text-xs text-marino-400">
                            {MOTIVO_PERDIDA[p.lost_reason] ?? p.lost_reason}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-marino-500">
                        {p.phone} · {p.zona}
                        {p.address_text && ` · ${p.address_text}`}
                        {p.plan_interes && ` · quiere ${p.plan_interes}`}
                      </p>
                      {p.notes && <p className="mt-1 text-xs text-marino-400">{p.notes}</p>}
                      {p.converted_customer_id && (
                        <Link
                          href={`/clientes/${p.converted_customer_id}`}
                          className="mt-1 inline-block text-xs text-naranja-600 hover:underline"
                        >
                          ver su expediente →
                        </Link>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-marino-300">
                      hace {p.dias_desde_alta} {p.dias_desde_alta === 1 ? 'día' : 'días'}
                    </span>
                  </div>

                  {p.status !== 'converted' && (
                    <div className="space-y-2">
                      <SeguirProspecto prospecto={p} />
                      {p.status !== 'lost' && <Convertir prospecto={p} planes={planes} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
