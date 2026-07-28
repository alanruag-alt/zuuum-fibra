import Link from 'next/link';
import { Suspense } from 'react';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Filtros } from '@/app/(panel)/clientes/Filtros';
import { Paginacion } from '@/app/(panel)/clientes/Paginacion';
import {
  listarClientes,
  listarZonas,
  resumenPadron,
  POR_PAGINA,
} from '@/modulos/clientes/consultas';
import { etiquetaEstadoCliente } from '@/modulos/clientes/etiquetas';
import { fecha, numero, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PaginaClientes({ searchParams }: Props) {
  const sp = await searchParams;
  const pagina = Math.max(1, Number(uno(sp.pagina) ?? 1) || 1);

  const filtros = {
    buscar: uno(sp.buscar),
    zona: uno(sp.zona),
    estado: uno(sp.estado),
    revisar: uno(sp.revisar),
    pagina,
  };

  const [{ clientes, total }, zonas, resumen] = await Promise.all([
    listarClientes(filtros),
    listarZonas(),
    resumenPadron(),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Clientes</h1>
        <p className="mt-1 text-sm text-marino-400">
          El padrón completo. Solo se muestran las zonas que tienes asignadas.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(resumen.total)} etiqueta="En el padrón" />
        <Indicador valor={numero(resumen.activos)} etiqueta="Activos" tono="ok" />
        <Indicador
          valor={numero(resumen.morosos + resumen.suspendidos)}
          etiqueta="Morosos y suspendidos"
          tono={resumen.morosos + resumen.suspendidos > 0 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={pesos(resumen.mensualidad)}
          etiqueta="Mensualidad activa"
          tono="marca"
          detalle={resumen.sinPrecio > 0 ? `${resumen.sinPrecio} sin precio capturado` : undefined}
        />
      </div>

      <Tarjeta>
        <Suspense fallback={<p className="text-sm text-marino-300">Cargando filtros…</p>}>
          <Filtros zonas={zonas} />
        </Suspense>

        {clientes.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">🔍</p>
            <p className="mt-3 text-sm font-medium text-marino-800">
              {total === 0 && !filtros.buscar && !filtros.zona && !filtros.estado
                ? 'Todavía no hay clientes cargados'
                : 'Ningún cliente coincide con esos filtros'}
            </p>
            <p className="mt-1 text-sm text-marino-400">
              {total === 0 && !filtros.buscar
                ? 'Corre CARGA_1_DATOS.sql y CARGA_2_PROCESAR.sql en Supabase para traer el padrón.'
                : 'Prueba quitando alguno.'}
            </p>
          </div>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-marino-100">
                    {[
                      'Folio',
                      'Cliente',
                      'Zona',
                      'Mensualidad',
                      'Adeudo',
                      'Último pago',
                      'Estado',
                    ].map((h) => (
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
                  {clientes.map((c) => {
                    const e = etiquetaEstadoCliente(c.status);
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-marino-50">
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/clientes/${c.id}`}
                            className="font-mono text-xs text-naranja-600 hover:underline"
                          >
                            {c.customer_code}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/clientes/${c.id}`} className="hover:underline">
                            <span className="font-medium text-marino-800">{c.full_name}</span>
                          </Link>
                          {c.price_review_needed && (
                            <span className="ml-2 align-middle">
                              <Insignia tono="marca">sin precio</Insignia>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-marino-500">{c.zona}</td>
                        <td className="px-3 py-2.5 font-medium text-marino-800">
                          {Number(c.mensualidad) > 0 ? pesos(Number(c.mensualidad)) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {Number(c.adeudo) > 0 ? (
                            <span className="font-medium text-falla">
                              {pesos(Number(c.adeudo))}
                            </span>
                          ) : (
                            <span className="text-marino-300">al corriente</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-marino-500">{fecha(c.ultimo_pago)}</td>
                        <td className="px-3 py-2.5">
                          <Insignia tono={e.tono}>{e.texto}</Insignia>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Suspense fallback={null}>
              <Paginacion pagina={pagina} porPagina={POR_PAGINA} total={total} />
            </Suspense>
          </>
        )}
      </Tarjeta>
    </div>
  );
}
