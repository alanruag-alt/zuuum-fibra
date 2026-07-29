import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { AtenderTicket } from '@/app/(panel)/tickets/Acciones';
import { comentariosDeTicket, obtenerTicket, tecnicosDisponibles } from '@/modulos/campo/consultas';
import {
  CATEGORIA_TICKET,
  CAUSA,
  ESTADO_TICKET,
  PRIORIDAD,
  etiqueta,
} from '@/modulos/campo/etiquetas';
import { fechaHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PaginaTicket({ params }: Props) {
  const { id } = await params;
  const [ticket, comentarios, gente] = await Promise.all([
    obtenerTicket(id),
    comentariosDeTicket(id),
    tecnicosDisponibles(),
  ]);
  if (!ticket) notFound();

  const e = etiqueta(ESTADO_TICKET, ticket.status);
  const pr = etiqueta(PRIORIDAD, ticket.priority);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/tickets"
        className="mb-4 inline-block text-sm text-marino-400 hover:text-marino-600"
      >
        ← Volver a tickets
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-lg font-semibold text-marino-800">
            {ticket.ticket_number}
          </h1>
          <Insignia tono={e.tono}>{e.texto}</Insignia>
          {ticket.priority !== 'normal' && <Insignia tono={pr.tono}>{pr.texto}</Insignia>}
          <span className="text-sm text-marino-400">
            {CATEGORIA_TICKET[ticket.category] ?? ticket.category}
          </span>
        </div>
        <p className="mt-2 text-base text-marino-800">{ticket.subject}</p>
        {ticket.description && <p className="mt-1 text-sm text-marino-500">{ticket.description}</p>}
        <p className="mt-2 text-sm text-marino-400">
          {ticket.customer_id ? (
            <Link href={`/clientes/${ticket.customer_id}`} className="hover:underline">
              {ticket.cliente}
            </Link>
          ) : (
            'sin cliente'
          )}{' '}
          · {ticket.zona}
          {ticket.telefono && ` · ${ticket.telefono}`} · abierto {fechaHora(ticket.opened_at)}
          {ticket.root_cause && ` · causa: ${CAUSA[ticket.root_cause] ?? ticket.root_cause}`}
        </p>
      </div>

      <div className="space-y-5">
        <Tarjeta titulo="Atender">
          <AtenderTicket ticket={ticket} gente={gente} />
        </Tarjeta>

        <Tarjeta titulo="Historial" descripcion={`${comentarios.length} comentarios.`}>
          {comentarios.length === 0 ? (
            <p className="py-6 text-center text-sm text-marino-300">Todavía no hay comentarios.</p>
          ) : (
            <ul className="space-y-3">
              {comentarios.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-lg p-3 ${
                    c.is_internal ? 'bg-marino-50' : 'border border-naranja-200 bg-naranja-50/40'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-marino-800">
                      {c.autor ?? 'alguien'}
                    </span>
                    {!c.is_internal && <Insignia tono="marca">visible al cliente</Insignia>}
                    <span className="ml-auto text-xs text-marino-400">
                      {fechaHora(c.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-marino-600">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
