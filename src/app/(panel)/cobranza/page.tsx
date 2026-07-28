import Link from 'next/link';
import { Suspense } from 'react';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Paginacion } from '@/app/(panel)/clientes/Paginacion';
import { FiltrosMora } from '@/app/(panel)/cobranza/FiltrosMora';
import { FormaCobro } from '@/app/(panel)/cobranza/FormaCobro';
import { GenerarMes } from '@/app/(panel)/cobranza/GenerarMes';
import { CorteDelMes } from '@/app/(panel)/cobranza/CorteDelMes';
import { adeudosMenores, simularCorte } from '@/modulos/cobranza/corte';
import { listarZonas } from '@/modulos/clientes/consultas';
import {
  cobranzaPorZona,
  listarMorosos,
  listarPeriodos,
  resumenCobranza,
  serviciosActivos,
  ultimosPagos,
  POR_PAGINA,
} from '@/modulos/cobranza/consultas';
import { fecha, fechaHora, numero, pesos, porcentaje } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PaginaCobranza({ searchParams }: Props) {
  const sp = await searchParams;
  const pagina = Math.max(1, Number(uno(sp.pagina) ?? 1) || 1);

  const filtros = {
    buscar: uno(sp.buscar),
    zona: uno(sp.zona),
    dias: uno(sp.dias),
    pagina,
  };

  const [{ morosos, total }, resumen, zonas, periodos, pagos, activos] = await Promise.all([
    listarMorosos(filtros),
    resumenCobranza(),
    listarZonas(),
    listarPeriodos(3),
    ultimosPagos(12),
    serviciosActivos(),
  ]);

  const periodoActual = periodos[0];
  const [porZona, corte, menores] = await Promise.all([
    periodoActual ? cobranzaPorZona(periodoActual.id) : Promise.resolve([]),
    periodoActual
      ? simularCorte(periodoActual.id)
      : Promise.resolve({ lista: [], aviso: null as string | null }),
    adeudosMenores(),
  ]);

  // El mes que toca cobrar es el de hoy, exista ya el periodo o no.
  const ahora = new Date();
  const anioHoy = ahora.getFullYear();
  const mesHoy = ahora.getMonth() + 1;
  const periodoDeHoy = periodos.find((p) => p.year === anioHoy && p.month === mesHoy);
  const cargosDelMes = periodoDeHoy
    ? porZona
        .filter((z) => z.period_id === periodoDeHoy.id)
        .reduce((s, z) => s + Number(z.cargos), 0)
    : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Cobranza</h1>
          <p className="mt-1 text-sm text-marino-400">
            Quién debe, cuánto y desde cuándo. Solo las zonas donde cobras.
          </p>
        </div>
        <GenerarMes
          anio={anioHoy}
          mes={mesHoy}
          serviciosActivos={activos}
          yaGenerado={cargosDelMes >= activos && activos > 0}
        />
      </div>

      {cargosDelMes < activos && (
        <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-aviso">
          Este mes lleva {numero(cargosDelMes)} cargos generados de {numero(activos)} servicios
          activos. Mientras no se generen, esos clientes no aparecen como que deben.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={pesos(resumen.adeudoTotal)}
          etiqueta="Por cobrar"
          tono={resumen.adeudoTotal > 0 ? 'aviso' : 'ok'}
          detalle={`${numero(resumen.morosos)} clientes`}
        />
        <Indicador
          valor={numero(resumen.masDe30Dias)}
          etiqueta="Más de 30 días"
          tono={resumen.masDe30Dias > 0 ? 'falla' : 'ok'}
        />
        <Indicador valor={pesos(resumen.cobradoHoy)} etiqueta="Cobrado hoy" tono="marca" />
        <Indicador valor={numero(resumen.pagosHoy)} etiqueta="Pagos de hoy" />
      </div>

      {periodoActual && (
        <Tarjeta
          titulo={`Avance de ${periodoActual.label}`}
          descripcion={`Vence el ${fecha(periodoActual.due_date)} · gracia hasta el ${fecha(
            periodoActual.grace_end_date,
          )} · corte el ${fecha(periodoActual.cutoff_date)}`}
          className="mb-6"
        >
          {porZona.length === 0 ? (
            <p className="py-6 text-center text-sm text-marino-300">
              Todavía no se generan los cargos de este mes.
            </p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-marino-100">
                    {['Zona', 'Cargos', 'Pagados', 'Esperado', 'Cobrado', 'Avance'].map((h) => (
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
                  {porZona.map((z) => {
                    const avance =
                      Number(z.esperado) > 0 ? Number(z.cobrado) / Number(z.esperado) : 0;
                    return (
                      <tr key={z.zone_id}>
                        <td className="px-3 py-2.5 font-medium text-marino-800">{z.zona}</td>
                        <td className="px-3 py-2.5 text-marino-500">{numero(Number(z.cargos))}</td>
                        <td className="px-3 py-2.5 text-marino-500">{numero(Number(z.pagados))}</td>
                        <td className="px-3 py-2.5 text-marino-500">{pesos(Number(z.esperado))}</td>
                        <td className="px-3 py-2.5 font-medium text-marino-800">
                          {pesos(Number(z.cobrado))}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-marino-100">
                              <div
                                className={`h-full rounded-full ${
                                  avance >= 0.8
                                    ? 'bg-exito'
                                    : avance >= 0.5
                                      ? 'bg-aviso'
                                      : 'bg-falla'
                                }`}
                                style={{ width: `${Math.min(100, Math.round(avance * 100))}%` }}
                              />
                            </div>
                            <span className="text-xs text-marino-400">
                              {porcentaje(Number(z.cobrado), Number(z.esperado))}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      )}

      {periodoActual && (
        <Tarjeta
          titulo={`Corte de ${periodoActual.label}`}
          descripcion={`A quién le toca quedarse sin servicio. El corte es el ${fecha(
            periodoActual.cutoff_date,
          )}.`}
          className="mb-6"
        >
          <CorteDelMes
            periodoId={periodoActual.id}
            periodoLabel={periodoActual.label}
            lista={corte.lista}
            aviso={corte.aviso}
          />
        </Tarjeta>
      )}

      {menores.length > 0 && (
        <Tarjeta
          titulo="Deben una miseria"
          descripcion="Vencidos, pero por tan poco que no vale la pena cortarlos. A éstos el corte los salta."
          className="mb-6"
        >
          <p className="mb-3 text-sm text-marino-500">
            Son <strong>{numero(menores.length)}</strong> clientes y entre todos deben{' '}
            <strong>
              {pesos(
                menores.reduce((s, m) => s + m.vencido, 0),
                true,
              )}
            </strong>
            . Casi siempre son residuos de redondeo que vinieron de los Excel. Conviene limpiarlos
            una vez y olvidarse.
          </p>
          <div className="flex flex-wrap gap-2">
            {menores.slice(0, 30).map((m) => (
              <Link
                key={m.customer_id}
                href={`/clientes/${m.customer_id}`}
                className="rounded-lg bg-marino-50 px-2.5 py-1 text-xs text-marino-600 hover:bg-marino-100"
              >
                {m.full_name} · <strong>{pesos(m.vencido, true)}</strong>
              </Link>
            ))}
          </div>
        </Tarjeta>
      )}

      <Tarjeta titulo="Clientes con adeudo" className="mb-6">
        <Suspense fallback={<p className="text-sm text-marino-300">Cargando filtros…</p>}>
          <FiltrosMora zonas={zonas} />
        </Suspense>

        {morosos.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-3 text-sm font-medium text-marino-800">
              {total === 0 && !filtros.buscar && !filtros.zona
                ? 'Nadie debe nada'
                : 'Ningún cliente coincide con esos filtros'}
            </p>
            <p className="mt-1 text-sm text-marino-400">
              {total === 0 && !filtros.buscar
                ? 'O todavía no se han generado los cargos del mes.'
                : 'Prueba quitando alguno.'}
            </p>
          </div>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-marino-100">
                    {['Folio', 'Cliente', 'Zona', 'Adeudo', 'Vence desde', 'Atraso', ''].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-marino-400"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-marino-100">
                  {morosos.map((m) => {
                    const dias = Number(m.dias_vencido ?? 0);
                    return (
                      <tr key={m.customer_id} className="transition-colors hover:bg-marino-50">
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/clientes/${m.customer_id}`}
                            className="font-mono text-xs text-naranja-600 hover:underline"
                          >
                            {m.customer_code}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/clientes/${m.customer_id}`} className="hover:underline">
                            <span className="font-medium text-marino-800">{m.full_name}</span>
                          </Link>
                          {m.phone && (
                            <span className="ml-2 text-xs text-marino-400">{m.phone}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-marino-500">{m.zona}</td>
                        <td className="px-3 py-2.5 font-semibold text-falla">
                          {pesos(Number(m.adeudo))}
                        </td>
                        <td className="px-3 py-2.5 text-marino-500">{fecha(m.vence_desde)}</td>
                        <td className="px-3 py-2.5">
                          <Insignia tono={dias > 30 ? 'falla' : dias > 10 ? 'aviso' : 'neutro'}>
                            {dias} {dias === 1 ? 'día' : 'días'}
                          </Insignia>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <FormaCobro
                            clienteId={m.customer_id}
                            clienteNombre={m.full_name}
                            adeudo={Number(m.adeudo)}
                          />
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

      <Tarjeta titulo="Últimos pagos" descripcion="Los más recientes que puedes ver.">
        {pagos.length === 0 ? (
          <p className="py-8 text-center text-sm text-marino-300">
            Todavía no hay pagos registrados.
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-marino-100">
                  {['Recibo', 'Cliente', 'Importe', 'Forma', 'Cuándo', 'Recibió'].map((h) => (
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
                {pagos.map((p) => (
                  <tr key={p.id} className={p.status === 'cancelled' ? 'opacity-50' : undefined}>
                    <td className="px-3 py-2.5 font-mono text-xs text-marino-600">
                      {p.receipt_number}
                      {p.status === 'cancelled' && (
                        <span className="ml-2">
                          <Insignia tono="falla">cancelado</Insignia>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-marino-800">{p.cliente ?? '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-marino-800">
                      {pesos(p.amount, true)}
                    </td>
                    <td className="px-3 py-2.5 text-marino-500">
                      {p.method === 'cash' ? 'Efectivo' : 'Transferencia'}
                    </td>
                    <td className="px-3 py-2.5 text-marino-500">{fechaHora(p.paid_at)}</td>
                    <td className="px-3 py-2.5 text-marino-500">{p.recibio ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
