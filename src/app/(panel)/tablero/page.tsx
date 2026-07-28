import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { clientesPorZona, cobranzaPorPeriodo, resumenTablero } from '@/modulos/tablero/consultas';
import { numero, pesos, porcentaje } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaTablero() {
  const [resumen, zonas, periodos] = await Promise.all([
    resumenTablero(),
    clientesPorZona(),
    cobranzaPorPeriodo(),
  ]);

  if (!resumen.hayDatos) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold text-marino-800">Tablero</h1>
        <div className="mt-6 rounded-xl border border-marino-100 bg-white p-10 text-center shadow-tarjeta">
          <p className="text-4xl">📥</p>
          <h2 className="mt-4 text-lg font-semibold text-marino-800">
            La base está lista, pero vacía
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-marino-400">
            El esquema ya está instalado. Falta traer el padrón: en el SQL Editor de Supabase, corre{' '}
            <code className="text-naranja-600">CARGA_1_DATOS.sql</code> y luego{' '}
            <code className="text-naranja-600">CARGA_2_PROCESAR.sql</code>.
          </p>
          <p className="mt-4 text-xs text-marino-300">
            Están en la carpeta <code>zuuum-fibra\supabase\</code>
          </p>
        </div>
      </div>
    );
  }

  const conProblema = resumen.morosos + resumen.suspendidos;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Tablero</h1>
        <p className="mt-1 text-sm text-marino-400">Cómo va la operación en este momento.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={numero(resumen.clientesActivos)}
          etiqueta="Clientes activos"
          tono="ok"
          detalle={`${numero(resumen.clientesTotal)} en el padrón`}
        />
        <Indicador
          valor={numero(conProblema)}
          etiqueta="Morosos y suspendidos"
          tono={conProblema > 0 ? 'aviso' : 'ok'}
          detalle={conProblema > 0 ? 'se cortan el día 11' : 'nadie debe'}
        />
        <Indicador
          valor={pesos(resumen.mensualidad)}
          etiqueta="Mensualidad activa"
          tono="marca"
          detalle="si todos pagan"
        />
        <Indicador
          valor={numero(resumen.sinPrecio)}
          etiqueta="Sin precio capturado"
          tono={resumen.sinPrecio > 0 ? 'aviso' : 'ok'}
          detalle={resumen.sinPrecio > 0 ? 'hay que revisarlos' : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta
          titulo="Por zona"
          descripcion="Dónde están los clientes y cuánto vale cada zona."
          acciones={
            <Link href="/clientes" className="text-sm text-naranja-600 hover:underline">
              Ver padrón
            </Link>
          }
        >
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-marino-100">
                  {['Zona', 'Clientes', 'Deben', 'Mensualidad'].map((h) => (
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
                  <tr key={z.id} className="transition-colors hover:bg-marino-50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/clientes?zona=${z.id}`}
                        className="font-medium text-marino-800 hover:text-naranja-600 hover:underline"
                      >
                        {z.nombre}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-marino-500">{numero(z.clientes)}</td>
                    <td className="px-3 py-2">
                      {z.morosos > 0 ? (
                        <span className="font-medium text-aviso">{numero(z.morosos)}</span>
                      ) : (
                        <span className="text-marino-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-marino-800">
                      {pesos(z.mensualidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Cobranza mes a mes" descripcion="Del historial que venía de tus Excel.">
          {periodos.length === 0 ? (
            <p className="py-10 text-center text-sm text-marino-300">
              Todavía no hay periodos de cobranza — o no tienes permiso para verlos
            </p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-marino-100">
                    {['Periodo', 'Pagaron', 'Avance', 'Cobrado'].map((h) => (
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
                  {periodos.map((p) => (
                    <tr key={p.periodo}>
                      <td className="px-3 py-2 font-medium text-marino-800">{p.periodo}</td>
                      <td className="px-3 py-2 text-marino-500">
                        {numero(p.pagados)}{' '}
                        <span className="text-marino-300">/ {numero(p.cargos)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-marino-100">
                            <div
                              className="h-full rounded-full bg-exito"
                              style={{ width: porcentaje(p.pagados, p.cargos) }}
                            />
                          </div>
                          <span className="text-xs text-marino-400">
                            {porcentaje(p.pagados, p.cargos)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium text-marino-800">{pesos(p.cobrado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>

      <p className="mt-6 text-xs text-marino-300">
        Lo que falta aquí: ONU en línea, instalaciones del día, tickets abiertos y el mapa. Todo eso
        llega cuando existan los módulos de red y órdenes.
      </p>
    </div>
  );
}
