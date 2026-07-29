import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { NuevoTicket } from '@/app/(panel)/tickets/Acciones';
import { listarTickets } from '@/modulos/campo/consultas';
import { listarClientes } from '@/modulos/clientes/consultas';
import {
  CATEGORIA_TICKET,
  CAUSA,
  ESTADO_TICKET,
  PRIORIDAD,
  etiqueta,
} from '@/modulos/campo/etiquetas';
import { fechaHora, numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaTickets({ searchParams }: Props) {
  const sp = await searchParams;
  const filtro = (Array.isArray(sp.estado) ? sp.estado[0] : sp.estado) ?? 'abiertos';

  const [tickets, todos, { clientes }] = await Promise.all([
    listarTickets(filtro),
    listarTickets(),
    listarClientes({ pagina: 1 }),
  ]);

  const abiertos = todos.filter((t) =>
    ['open', 'assigned', 'in_progress', 'waiting'].includes(t.status),
  );
  const urgentes = abiertos.filter((t) => t.priority === 'urgent' || t.priority === 'high');
  const sinAtender = abiertos.filter((t) => !t.assigned_to);
  const viejos = abiertos.filter((t) => t.horas_abierto > 48);

  // Si tres personas de la misma zona reportan lo mismo, casi nunca son tres
  // fallas: es una sola, y conviene verla junta antes de mandar tres técnicos.
  const porZona = abiertos.reduce<Record<string, number>>((acc, t) => {
    if (t.category === 'no_service') acc[t.zona] = (acc[t.zona] ?? 0) + 1;
    return acc;
  }, {});
  const sospechosas = Object.entries(porZona).filter(([, n]) => n >= 3);

  const FILTROS = [
    ['abiertos', 'Abiertos'],
    ['resolved', 'Resueltos'],
    ['closed', 'Cerrados'],
    ['', 'Todos'],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Tickets</h1>
          <p className="mt-1 text-sm text-marino-400">Reportes de falla y su seguimiento.</p>
        </div>
        <NuevoTicket clientes={clientes} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={numero(abiertos.length)}
          etiqueta="Abiertos"
          tono={abiertos.length > 0 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={numero(urgentes.length)}
          etiqueta="Urgentes"
          tono={urgentes.length > 0 ? 'falla' : 'ok'}
        />
        <Indicador
          valor={numero(sinAtender.length)}
          etiqueta="Sin asignar"
          tono={sinAtender.length > 0 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={numero(viejos.length)}
          etiqueta="Más de 2 días"
          tono={viejos.length > 0 ? 'falla' : 'ok'}
        />
      </div>

      {sospechosas.length > 0 && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-falla">
          <strong>Puede ser una sola falla, no varias.</strong>{' '}
          {sospechosas.map(([zona, n]) => `${n} reportes de «sin servicio» en ${zona}`).join(' · ')}
          . Vale la pena revisar la red de esa zona antes de mandar un técnico por cada uno.
        </div>
      )}

      <Tarjeta>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTROS.map(([v, t]) => (
            <Link
              key={v}
              href={v ? `/tickets?estado=${v}` : '/tickets?estado='}
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

        {tickets.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">🎫</p>
            <p className="mt-3 text-sm font-medium text-marino-800">No hay tickets aquí</p>
            <p className="mt-1 text-sm text-marino-400">
              Cada llamada de «no me sirve el internet» debería quedar aquí. Es lo que después
              permite saber qué poste da lata.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-marino-100">
            {tickets.map((t) => {
              const e = etiqueta(ESTADO_TICKET, t.status);
              const pr = etiqueta(PRIORIDAD, t.priority);
              return (
                <li key={t.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="font-mono text-xs text-naranja-600 hover:underline"
                        >
                          {t.ticket_number}
                        </Link>
                        <Insignia tono={e.tono}>{e.texto}</Insignia>
                        {t.priority !== 'normal' && <Insignia tono={pr.tono}>{pr.texto}</Insignia>}
                        <span className="text-xs text-marino-400">
                          {CATEGORIA_TICKET[t.category] ?? t.category}
                        </span>
                      </div>
                      <Link href={`/tickets/${t.id}`} className="hover:underline">
                        <p className="mt-1 text-sm font-medium text-marino-800">{t.subject}</p>
                      </Link>
                      <p className="mt-0.5 text-xs text-marino-400">
                        {t.cliente} · {t.zona}
                        {t.telefono && ` · ${t.telefono}`}
                        {t.atiende ? ` · atiende ${t.atiende}` : ' · sin asignar'}
                        {t.root_cause && ` · ${CAUSA[t.root_cause] ?? t.root_cause}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-marino-400">{fechaHora(t.opened_at)}</p>
                      <p
                        className={`text-xs ${
                          t.horas_abierto > 48 && !t.resolved_at ? 'text-falla' : 'text-marino-300'
                        }`}
                      >
                        {t.horas_abierto < 24
                          ? `${t.horas_abierto} h`
                          : `${Math.floor(t.horas_abierto / 24)} d`}
                        {t.resolved_at ? ' para resolver' : ' abierto'}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
