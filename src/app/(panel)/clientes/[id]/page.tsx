import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import {
  cargosDelCliente,
  obtenerCliente,
  serviciosDelCliente,
} from '@/modulos/clientes/consultas';
import {
  etiquetaEstadoCargo,
  etiquetaEstadoCliente,
  etiquetaEstadoServicio,
  TIPO_CARGO,
  TIPO_RED,
} from '@/modulos/clientes/etiquetas';
import { FormaCobro } from '@/app/(panel)/cobranza/FormaCobro';
import { pagosDelCliente } from '@/modulos/cobranza/consultas';
import { fecha, fechaHora, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExpedienteCliente({ params }: Props) {
  const { id } = await params;
  const cliente = await obtenerCliente(id);
  if (!cliente) notFound();

  const [servicios, cargos, pagos] = await Promise.all([
    serviciosDelCliente(id),
    cargosDelCliente(id),
    pagosDelCliente(id),
  ]);

  const e = etiquetaEstadoCliente(cliente.status);
  const pendientes = cargos.filter((c) => c.status === 'pending' || c.status === 'partial');

  // Si la base no dejó ver ni cargos ni pagos, esta persona no maneja dinero:
  // no tiene caso enseñarle un botón de cobrar que le va a rebotar.
  const veCobranza = cargos.length > 0 || pagos.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/clientes"
        className="mb-4 inline-block text-sm text-marino-400 hover:text-marino-600"
      >
        ← Volver al padrón
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-marino-800">{cliente.full_name}</h1>
            <Insignia tono={e.tono}>{e.texto}</Insignia>
            {cliente.price_review_needed && <Insignia tono="marca">precio por revisar</Insignia>}
          </div>
          <p className="mt-1 text-sm text-marino-400">
            <span className="font-mono">{cliente.customer_code}</span> · {cliente.zona}
            {cliente.phone && <> · {cliente.phone}</>}
          </p>
        </div>

        {veCobranza && (
          <FormaCobro
            clienteId={cliente.id}
            clienteNombre={cliente.full_name}
            adeudo={Number(cliente.adeudo ?? 0)}
          />
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={Number(cliente.mensualidad) > 0 ? pesos(Number(cliente.mensualidad)) : '—'}
          etiqueta="Mensualidad"
          tono="marca"
        />
        <Indicador
          valor={Number(cliente.adeudo) > 0 ? pesos(Number(cliente.adeudo)) : '$0'}
          etiqueta="Adeudo"
          tono={Number(cliente.adeudo) > 0 ? 'falla' : 'ok'}
          detalle={
            pendientes.length > 0 ? `${pendientes.length} cargos pendientes` : 'al corriente'
          }
        />
        <Indicador valor={String(cliente.servicios_activos)} etiqueta="Servicios activos" />
        <Indicador valor={fecha(cliente.ultimo_pago)} etiqueta="Último pago" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Servicios" descripcion="Lo que tiene contratado.">
          {servicios.length === 0 ? (
            <p className="py-6 text-center text-sm text-marino-300">Sin servicios registrados</p>
          ) : (
            <ul className="space-y-3">
              {servicios.map((s) => {
                const es = etiquetaEstadoServicio(s.status);
                const precio = s.custom_price ?? s.plan?.price ?? 0;
                return (
                  <li key={s.id} className="rounded-lg bg-marino-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-marino-800">
                          {s.plan?.name ?? 'Sin plan'}
                        </p>
                        <p className="mt-0.5 text-xs text-marino-400">
                          {TIPO_RED[s.network_type] ?? s.network_type}
                          {s.plan?.download_mbps ? ` · ${s.plan.download_mbps} Mbps` : ''}
                          {s.activated_at ? ` · desde ${fecha(s.activated_at)}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-marino-800">{pesos(precio)}</p>
                        <Insignia tono={es.tono}>{es.texto}</Insignia>
                      </div>
                    </div>
                    {(s.ip_address || s.wifi_ssid) && (
                      <p className="mt-2 border-t border-marino-100 pt-2 font-mono text-[11px] text-marino-400">
                        {s.ip_address && <>IP {s.ip_address}</>}
                        {s.ip_address && s.wifi_ssid && ' · '}
                        {s.wifi_ssid && <>WiFi {s.wifi_ssid}</>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Cobranza" descripcion="Los últimos periodos.">
          {cargos.length === 0 ? (
            <p className="py-6 text-center text-sm text-marino-300">
              Sin movimientos — o no tienes permiso para ver cobranza
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-marino-100">
                    {['Periodo', 'Concepto', 'Monto', 'Estado'].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-marino-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-marino-100">
                  {cargos.map((c) => {
                    const ec = etiquetaEstadoCargo(c.status);
                    return (
                      <tr key={c.id}>
                        <td className="px-2 py-2 font-medium text-marino-700">
                          {c.periodo ?? fecha(c.due_date)}
                        </td>
                        <td className="px-2 py-2 text-marino-500">
                          {TIPO_CARGO[c.type] ?? c.type}
                        </td>
                        <td className="px-2 py-2 text-marino-800">{pesos(Number(c.amount))}</td>
                        <td className="px-2 py-2">
                          <Insignia tono={ec.tono}>{ec.texto}</Insignia>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>

      {pagos.length > 0 && (
        <Tarjeta titulo="Pagos" descripcion="Lo que ha entregado." className="mt-5">
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-marino-100">
                  {['Recibo', 'Importe', 'Forma', 'Cuándo'].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-marino-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-marino-100">
                {pagos.map((p) => (
                  <tr key={p.id} className={p.status === 'cancelled' ? 'opacity-50' : undefined}>
                    <td className="px-2 py-2 font-mono text-xs">
                      <Link
                        href={`/recibo/${p.id}`}
                        className="text-naranja-600 hover:underline"
                        title="Ver el recibo para imprimir"
                      >
                        {p.receipt_number}
                      </Link>
                      {p.status === 'cancelled' && (
                        <span className="ml-2">
                          <Insignia tono="falla">cancelado</Insignia>
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-medium text-marino-800">
                      {pesos(p.amount, true)}
                    </td>
                    <td className="px-2 py-2 text-marino-500">
                      {p.method === 'cash' ? 'Efectivo' : 'Transferencia'}
                    </td>
                    <td className="px-2 py-2 text-marino-500">{fechaHora(p.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      <p className="mt-6 text-xs text-marino-300">
        Lo que falta en este expediente: instalaciones, tickets, equipo instalado y de qué punto de
        la red cuelga. Entra en las etapas 7 a 9.
      </p>
    </div>
  );
}
