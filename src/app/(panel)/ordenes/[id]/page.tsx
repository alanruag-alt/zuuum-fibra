import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Asignar, MoverOrden } from '@/app/(panel)/ordenes/[id]/Acciones';
import { obtenerOrden, tecnicosDisponibles } from '@/modulos/campo/consultas';
import { ESTADO_ORDEN, PRIORIDAD, TIPO_ORDEN, etiqueta } from '@/modulos/campo/etiquetas';
import { fechaHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PaginaOrden({ params }: Props) {
  const { id } = await params;
  const [orden, tecnicos] = await Promise.all([obtenerOrden(id), tecnicosDisponibles()]);
  if (!orden) notFound();

  const e = etiqueta(ESTADO_ORDEN, orden.status);
  const pr = etiqueta(PRIORIDAD, orden.priority);
  const esInstalacion = orden.type === 'installation';

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/ordenes"
        className="mb-4 inline-block text-sm text-marino-400 hover:text-marino-600"
      >
        ← Volver a órdenes
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-semibold text-marino-800">{orden.order_number}</h1>
          <Insignia tono={e.tono}>{e.texto}</Insignia>
          {orden.priority !== 'normal' && <Insignia tono={pr.tono}>{pr.texto}</Insignia>}
        </div>
        <p className="mt-1 text-sm text-marino-400">
          {TIPO_ORDEN[orden.type] ?? orden.type} · {orden.zona}
          {orden.cliente && (
            <>
              {' · '}
              <Link href={`/clientes/${orden.customer_id}`} className="hover:underline">
                {orden.cliente}
              </Link>
            </>
          )}
          {orden.telefono && ` · ${orden.telefono}`}
        </p>
        {orden.description && <p className="mt-2 text-sm text-marino-600">{orden.description}</p>}
      </div>

      {esInstalacion && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Indicador
            valor={String(orden.fotos)}
            etiqueta="Fotos"
            tono={orden.fotos > 0 ? 'ok' : 'aviso'}
          />
          <Indicador
            valor={String(orden.lecturas)}
            etiqueta="Lecturas de potencia"
            tono={orden.lecturas > 0 ? 'ok' : 'aviso'}
          />
          <Indicador
            valor={String(orden.firmas)}
            etiqueta="Firmas"
            tono={orden.firmas > 0 ? 'ok' : 'aviso'}
          />
        </div>
      )}

      <div className="space-y-5">
        <Tarjeta titulo="Técnicos y fecha">
          {orden.tecnicos ? (
            <p className="mb-3 text-sm text-marino-600">
              Asignada a <strong>{orden.tecnicos}</strong>
              {orden.scheduled_for && <> para el {fechaHora(orden.scheduled_for)}</>}.
            </p>
          ) : (
            <p className="mb-3 text-sm text-marino-400">Todavía no tiene técnico asignado.</p>
          )}
          <Asignar orden={orden} tecnicos={tecnicos} />
        </Tarjeta>

        <Tarjeta titulo="Qué sigue">
          <MoverOrden orden={orden} />
        </Tarjeta>

        <Tarjeta titulo="Cómo va">
          <ol className="space-y-2 text-sm">
            {[
              ['Creada', orden.created_at],
              ['Agendada', orden.scheduled_for],
              ['Empezada', orden.started_at],
              ['Terminada', orden.completed_at],
            ].map(([etiquetaPaso, cuando]) => (
              <li key={etiquetaPaso as string} className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    cuando ? 'bg-exito' : 'bg-marino-200'
                  }`}
                />
                <span className={cuando ? 'text-marino-800' : 'text-marino-300'}>
                  {etiquetaPaso}
                </span>
                <span className="ml-auto text-xs text-marino-400">
                  {cuando ? fechaHora(cuando as string) : '—'}
                </span>
              </li>
            ))}
          </ol>
        </Tarjeta>
      </div>

      {esInstalacion && (
        <p className="mt-6 text-xs text-marino-400">
          Las fotos, la potencia y la firma las sube el técnico desde el SUNMI. Mientras falte
          alguna, la base no deja cerrar la instalación — eso no se puede saltar desde aquí ni desde
          el teléfono.
        </p>
      )}
    </div>
  );
}
