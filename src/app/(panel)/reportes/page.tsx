import { Indicador } from '@/componentes/ui/Indicador';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { causasDeFalla, cobranzaPorMes, ingresoPorZona } from '@/modulos/reportes/consultas';
import { CAUSA } from '@/modulos/campo/etiquetas';
import { numero, pesos, porcentaje } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaReportes() {
  const [meses, zonas, causas] = await Promise.all([
    cobranzaPorMes(12),
    ingresoPorZona(),
    causasDeFalla(),
  ]);

  const totalMensualidad = zonas.reduce((s, z) => s + z.mensualidad, 0);
  const totalAdeudo = zonas.reduce((s, z) => s + z.adeudo, 0);
  const totalActivos = zonas.reduce((s, z) => s + z.activos, 0);

  const conCargos = meses.filter((m) => m.cargos > 0);
  const promedio =
    conCargos.length > 0
      ? conCargos.reduce((s, m) => s + (m.esperado > 0 ? m.cobrado / m.esperado : 0), 0) /
        conCargos.length
      : 0;

  const maximo = Math.max(1, ...meses.map((m) => m.esperado));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Reportes</h1>
        <p className="mt-1 text-sm text-marino-400">
          Cómo va el negocio. Solo con lo que tienes en la base — nada estimado.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={pesos(totalMensualidad)} etiqueta="Mensualidad activa" tono="marca" />
        <Indicador valor={numero(totalActivos)} etiqueta="Clientes activos" tono="ok" />
        <Indicador
          valor={pesos(totalAdeudo)}
          etiqueta="Por cobrar"
          tono={totalAdeudo > 0 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={`${Math.round(promedio * 100)}%`}
          etiqueta="Se cobra en promedio"
          tono={promedio >= 0.9 ? 'ok' : promedio >= 0.75 ? 'aviso' : 'falla'}
          detalle={`de los últimos ${conCargos.length} meses`}
        />
      </div>

      <Tarjeta
        titulo="Cobranza mes por mes"
        descripcion="La barra clara es lo que se debía cobrar; la naranja, lo que entró."
        className="mb-6"
      >
        {conCargos.length === 0 ? (
          <p className="py-8 text-center text-sm text-marino-300">
            Todavía no hay meses con cargos generados.
          </p>
        ) : (
          <ul className="space-y-2">
            {meses.map((m) => {
              const pct = m.esperado > 0 ? m.cobrado / m.esperado : 0;
              return (
                <li key={m.periodo} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-marino-500">{m.periodo}</span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-marino-100">
                    <div
                      className="absolute inset-y-0 left-0 bg-marino-200"
                      style={{ width: `${(m.esperado / maximo) * 100}%` }}
                    />
                    <div
                      className={`absolute inset-y-0 left-0 ${
                        pct >= 0.9 ? 'bg-exito' : pct >= 0.75 ? 'bg-naranja-500' : 'bg-falla'
                      }`}
                      style={{ width: `${(m.cobrado / maximo) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-marino-600">
                    {pesos(m.cobrado)}
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs text-marino-400">
                    {m.esperado > 0 ? porcentaje(m.cobrado, m.esperado) : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Por zona" className="mb-6">
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-marino-100">
                {['Zona', 'Clientes', 'Activos', 'Mensualidad', 'Adeudo', 'Peso'].map((h) => (
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
                <tr key={z.zona}>
                  <td className="px-3 py-2.5 font-medium text-marino-800">{z.zona}</td>
                  <td className="px-3 py-2.5 text-marino-500">{numero(z.clientes)}</td>
                  <td className="px-3 py-2.5 text-marino-500">{numero(z.activos)}</td>
                  <td className="px-3 py-2.5 font-medium text-marino-800">
                    {pesos(z.mensualidad)}
                  </td>
                  <td className="px-3 py-2.5">
                    {z.adeudo > 0 ? (
                      <span className="text-falla">{pesos(z.adeudo)}</span>
                    ) : (
                      <span className="text-marino-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-marino-100">
                      <div
                        className="h-full rounded-full bg-naranja-400"
                        style={{
                          width: `${
                            totalMensualidad > 0 ? (z.mensualidad / totalMensualidad) * 100 : 0
                          }%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Por qué se cae la red"
        descripcion="Sale de la causa que se captura al resolver cada ticket. Es lo que dice dónde vale la pena invertir."
      >
        {causas.length === 0 ? (
          <p className="py-8 text-center text-sm text-marino-300">
            Todavía no hay tickets resueltos con causa. En cuanto se resuelvan unos cuantos, aquí se
            va a ver qué es lo que más da lata.
          </p>
        ) : (
          <ul className="space-y-2">
            {causas.map((c) => (
              <li key={c.causa} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-marino-700">
                  {CAUSA[c.causa] ?? c.causa}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-marino-100">
                  <div
                    className="h-full bg-marino-400"
                    style={{
                      width: `${(c.cuantos / Math.max(...causas.map((x) => x.cuantos))) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm text-marino-600">
                  {c.cuantos}
                </span>
                <span className="w-28 shrink-0 text-right text-xs text-marino-400">
                  {c.horas_promedio} h para resolver
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
