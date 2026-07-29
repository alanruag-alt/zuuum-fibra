import { notFound } from 'next/navigation';
import { obtenerRecibo } from '@/modulos/reportes/consultas';
import { fechaHora, pesos } from '@/lib/formato';
import { Imprimir } from '@/app/recibo/[id]/Imprimir';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * El recibo, hecho para imprimirse.
 *
 * Es una página normal con estilos de impresión, no un PDF generado en el
 * servidor. Así se puede imprimir desde cualquier lado, mandarse por WhatsApp
 * como captura, o guardarse como PDF con el propio navegador — sin depender de
 * una librería más que mantener.
 *
 * Vive FUERA del panel a propósito: sin menú lateral ni barra, para que lo que
 * salga del papel sea el recibo y nada más.
 */
export default async function PaginaRecibo({ params }: Props) {
  const { id } = await params;
  const r = await obtenerRecibo(id);
  if (!r) notFound();

  const cancelado = r.status === 'cancelled';

  return (
    <div className="min-h-screen bg-marino-50 p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-md">
        <div className="mb-4 print:hidden">
          <Imprimir />
        </div>

        <article className="rounded-xl bg-white p-6 shadow-tarjeta print:rounded-none print:shadow-none">
          <header className="mb-5 border-b border-marino-100 pb-4 text-center">
            <h1 className="text-lg font-bold tracking-wide text-naranja-600">ZUUUM FIBRA</h1>
            <p className="mt-0.5 text-xs text-marino-400">Internet · Cuencamé, Durango</p>
            <p className="mt-3 font-mono text-base font-semibold text-marino-800">
              {r.receipt_number}
            </p>
            {cancelado && (
              <p className="mt-2 rounded bg-red-50 py-1 text-sm font-semibold text-falla">
                CANCELADO
              </p>
            )}
          </header>

          <dl className="mb-5 space-y-1.5 text-sm">
            {[
              ['Cliente', r.cliente],
              ['Folio', r.customer_code],
              ['Zona', r.zona],
              ['Fecha', fechaHora(r.paid_at)],
              ['Forma de pago', r.method === 'cash' ? 'Efectivo' : 'Transferencia'],
              ...(r.reference ? [['Referencia', r.reference]] : []),
              ['Recibió', r.recibio],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-marino-400">{k}</dt>
                <dd className="text-right font-medium text-marino-800">{v}</dd>
              </div>
            ))}
          </dl>

          {r.aplicaciones.length > 0 && (
            <div className="mb-5 border-t border-marino-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-marino-400">
                Se aplicó a
              </p>
              <ul className="space-y-1 text-sm">
                {r.aplicaciones.map((a, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span className="text-marino-600">
                      {a.concepto}
                      {a.periodo && <span className="text-marino-400"> · {a.periodo}</span>}
                    </span>
                    <span className="font-medium text-marino-800">{pesos(a.monto, true)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.saldo_a_favor > 0 && (
            <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-exito">
              Queda <strong>{pesos(r.saldo_a_favor, true)}</strong> a favor. Se aplica solo al cargo
              del mes que entra.
            </p>
          )}

          <div className="border-t-2 border-marino-800 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-marino-600">
                Total pagado
              </span>
              <span className="text-2xl font-bold text-marino-800">{pesos(r.amount, true)}</span>
            </div>
          </div>

          {r.notes && <p className="mt-4 text-xs text-marino-400">{r.notes}</p>}

          <footer className="mt-6 border-t border-marino-100 pt-4 text-center text-[11px] text-marino-400">
            <p>Gracias por su pago.</p>
            <p className="mt-0.5">
              Conserve este comprobante. Cualquier aclaración, con su folio {r.receipt_number}.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
