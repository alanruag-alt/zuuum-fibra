import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { listarOrdenes } from '@/modulos/campo/consultas';
import { ESTADO_ORDEN, PRIORIDAD, TIPO_ORDEN, etiqueta } from '@/modulos/campo/etiquetas';
import { fecha, fechaHora, numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaOrdenes({ searchParams }: Props) {
  const sp = await searchParams;
  const filtro = (Array.isArray(sp.estado) ? sp.estado[0] : sp.estado) ?? 'abiertas';

  const [ordenes, todas] = await Promise.all([listarOrdenes(filtro), listarOrdenes()]);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy.getTime() + 86400000);

  const deHoy = todas.filter(
    (o) =>
      o.scheduled_for &&
      new Date(o.scheduled_for) >= hoy &&
      new Date(o.scheduled_for) < manana &&
      o.status !== 'cancelled',
  );
  const enCurso = todas.filter((o) => o.status === 'in_progress');
  const sinAsignar = todas.filter((o) => !o.tecnicos && ['draft', 'scheduled'].includes(o.status));
  const atrasadas = todas.filter(
    (o) =>
      o.scheduled_for &&
      new Date(o.scheduled_for) < hoy &&
      ['draft', 'scheduled', 'in_progress'].includes(o.status),
  );

  const FILTROS = [
    ['abiertas', 'Abiertas'],
    ['scheduled', 'Agendadas'],
    ['in_progress', 'En curso'],
    ['completed', 'Terminadas'],
    ['', 'Todas'],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Órdenes de trabajo</h1>
        <p className="mt-1 text-sm text-marino-400">
          Instalaciones, reparaciones y cambios de domicilio.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(deHoy.length)} etiqueta="Para hoy" tono="marca" />
        <Indicador valor={numero(enCurso.length)} etiqueta="En curso" tono="aviso" />
        <Indicador
          valor={numero(sinAsignar.length)}
          etiqueta="Sin técnico"
          tono={sinAsignar.length > 0 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={numero(atrasadas.length)}
          etiqueta="Se pasó la fecha"
          tono={atrasadas.length > 0 ? 'falla' : 'ok'}
        />
      </div>

      <Tarjeta>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTROS.map(([v, t]) => (
            <Link
              key={v}
              href={v ? `/ordenes?estado=${v}` : '/ordenes?estado='}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                filtro === v
                  ? 'bg-marino-600 text-white'
                  : 'border border-marino-200 text-marino-600 hover:bg-marino-50'
              }`}
            >
              {t}
            </Link>
          ))}
        </div>

        {ordenes.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">🧰</p>
            <p className="mt-3 text-sm font-medium text-marino-800">No hay órdenes aquí</p>
            <p className="mt-1 text-sm text-marino-400">
              Las de instalación se crean solas al convertir un prospecto en cliente.
            </p>
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-marino-100">
                  {[
                    'Folio',
                    'Tipo',
                    'Cliente',
                    'Zona',
                    'Agendada',
                    'Técnicos',
                    'Evidencia',
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
                {ordenes.map((o) => {
                  const e = etiqueta(ESTADO_ORDEN, o.status);
                  const pr = etiqueta(PRIORIDAD, o.priority);
                  const tarde =
                    o.scheduled_for &&
                    new Date(o.scheduled_for) < hoy &&
                    ['draft', 'scheduled', 'in_progress'].includes(o.status);
                  const completa = o.fotos > 0 && o.lecturas > 0 && o.firmas > 0;

                  return (
                    <tr key={o.id} className="transition-colors hover:bg-marino-50">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/ordenes/${o.id}`}
                          className="font-mono text-xs text-naranja-600 hover:underline"
                        >
                          {o.order_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-marino-600">
                        {TIPO_ORDEN[o.type] ?? o.type}
                        {o.priority !== 'normal' && (
                          <span className="ml-1.5">
                            <Insignia tono={pr.tono}>{pr.texto}</Insignia>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {o.customer_id ? (
                          <Link href={`/clientes/${o.customer_id}`} className="hover:underline">
                            <span className="text-marino-800">{o.cliente}</span>
                          </Link>
                        ) : (
                          <span className="text-marino-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-marino-500">{o.zona}</td>
                      <td className="px-3 py-2.5">
                        {o.scheduled_for ? (
                          <span className={tarde ? 'font-medium text-falla' : 'text-marino-500'}>
                            {fechaHora(o.scheduled_for)}
                          </span>
                        ) : (
                          <span className="text-marino-300">sin fecha</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-marino-500">
                        {o.tecnicos ?? <Insignia tono="aviso">sin asignar</Insignia>}
                      </td>
                      <td className="px-3 py-2.5">
                        {o.type === 'installation' ? (
                          <span
                            className={`text-xs ${completa ? 'text-exito' : 'text-marino-400'}`}
                            title="Fotos · lecturas · firmas"
                          >
                            {o.fotos}📷 {o.lecturas}📶 {o.firmas}✍️
                          </span>
                        ) : (
                          <span className="text-marino-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Insignia tono={e.tono}>{e.texto}</Insignia>
                        {o.completed_at && (
                          <span className="ml-2 text-xs text-marino-300">
                            {fecha(o.completed_at)}
                          </span>
                        )}
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
  );
}
