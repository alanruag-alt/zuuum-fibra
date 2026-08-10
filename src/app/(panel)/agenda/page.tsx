import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { listarOrdenes } from '@/modulos/campo/consultas';
import { ESTADO_ORDEN, PRIORIDAD, TIPO_ORDEN, etiqueta } from '@/modulos/campo/etiquetas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Fecha en formato AAAA-MM-DD, en hora local y no en UTC. */
function clave(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  searchParams: Promise<{ semana?: string }>;
}

export default async function PaginaAgenda({ searchParams }: Props) {
  const { semana } = await searchParams;
  const desplazamiento = Number(semana ?? 0) || 0;

  const ordenes = await listarOrdenes('abiertas', 400);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // La semana empieza en lunes, que es como se planea el trabajo aquí.
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7) + desplazamiento * 7);

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return d;
  });

  const porDia = new Map<string, typeof ordenes>();
  for (const o of ordenes) {
    if (!o.scheduled_for) continue;
    const k = clave(new Date(o.scheduled_for));
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push(o);
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''));
  }

  const sinFecha = ordenes.filter((o) => !o.scheduled_for);
  const hoyClave = clave(hoy);
  const atrasadas = ordenes.filter(
    (o) => o.scheduled_for && clave(new Date(o.scheduled_for)) < hoyClave,
  );
  const enLaSemana = dias.reduce((s, d) => s + (porDia.get(clave(d))?.length ?? 0), 0);

  const titulo =
    lunes.getMonth() === dias[6].getMonth()
      ? `${lunes.getDate()} al ${dias[6].getDate()} de ${MESES[lunes.getMonth()]}`
      : `${lunes.getDate()} de ${MESES[lunes.getMonth()]} al ${dias[6].getDate()} de ${MESES[dias[6].getMonth()]}`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Agenda</h1>
          <p className="mt-1 text-sm text-marino-400">
            Qué hay que hacer esta semana y quién lo va a hacer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/agenda?semana=${desplazamiento - 1}`}
            className="rounded-lg border border-marino-200 bg-white px-3 py-2 text-sm text-marino-700 hover:bg-marino-50"
          >
            ←
          </Link>
          <span className="min-w-[190px] text-center text-sm font-medium text-marino-700">
            {desplazamiento === 0 ? 'Esta semana' : titulo}
          </span>
          <Link
            href={`/agenda?semana=${desplazamiento + 1}`}
            className="rounded-lg border border-marino-200 bg-white px-3 py-2 text-sm text-marino-700 hover:bg-marino-50"
          >
            →
          </Link>
          {desplazamiento !== 0 && (
            <Link href="/agenda" className="text-sm text-naranja-600 hover:underline">
              hoy
            </Link>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(enLaSemana)} etiqueta="Citas esta semana" tono="marca" />
        <Indicador
          valor={numero(porDia.get(hoyClave)?.length ?? 0)}
          etiqueta="Para hoy"
          tono="ok"
        />
        <Indicador
          valor={numero(atrasadas.length)}
          etiqueta="Se pasaron de fecha"
          tono={atrasadas.length > 0 ? 'falla' : 'ok'}
        />
        <Indicador
          valor={numero(sinFecha.length)}
          etiqueta="Sin agendar"
          tono={sinFecha.length > 0 ? 'aviso' : 'ok'}
        />
      </div>

      {atrasadas.length > 0 && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-falla">
          <strong>{atrasadas.length}</strong>{' '}
          {atrasadas.length === 1 ? 'orden quedó' : 'órdenes quedaron'} con fecha vencida y siguen
          abiertas. Cada una es una persona esperando en su casa.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dias.map((d) => {
          const k = clave(d);
          const lista = porDia.get(k) ?? [];
          const esHoy = k === hoyClave;
          return (
            <div
              key={k}
              className={`rounded-xl border bg-white p-3 shadow-tarjeta ${
                esHoy ? 'border-naranja-300 ring-1 ring-naranja-200' : 'border-marino-100'
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span
                  className={`text-sm font-semibold ${esHoy ? 'text-naranja-600' : 'text-marino-700'}`}
                >
                  {DIAS[d.getDay()]}
                </span>
                <span className="text-xs text-marino-400">{d.getDate()}</span>
              </div>
              {lista.length === 0 ? (
                <p className="py-3 text-center text-xs text-marino-300">libre</p>
              ) : (
                <ul className="space-y-2">
                  {lista.map((o) => {
                    const e = etiqueta(ESTADO_ORDEN, o.status);
                    const p = etiqueta(PRIORIDAD, o.priority);
                    return (
                      <li key={o.id}>
                        <Link
                          href={`/ordenes/${o.id}`}
                          className="block rounded-lg border border-marino-100 p-2 hover:bg-marino-50"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-medium text-marino-800">
                              {TIPO_ORDEN[o.type] ?? o.type}
                            </span>
                            <span className="shrink-0 text-[11px] text-marino-400">
                              {new Date(o.scheduled_for!).toLocaleTimeString('es-MX', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-marino-600">
                            {o.cliente ?? o.order_number}
                          </p>
                          <p className="truncate text-[11px] text-marino-400">{o.zona}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Insignia tono={e.tono}>{e.texto}</Insignia>
                            {['high', 'urgent'].includes(o.priority) && (
                              <Insignia tono={p.tono}>{p.texto}</Insignia>
                            )}
                            {o.tecnicos ? null : <Insignia tono="aviso">sin técnico</Insignia>}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {sinFecha.length > 0 && (
        <div className="mt-6">
          <Tarjeta
            titulo="Sin agendar"
            descripcion="Órdenes abiertas que todavía no tienen día. Mientras no lo tengan, nadie va."
          >
            <ul className="divide-y divide-marino-100">
              {sinFecha.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Link
                    href={`/ordenes/${o.id}`}
                    className="font-mono text-xs text-naranja-600 hover:underline"
                  >
                    {o.order_number}
                  </Link>
                  <span className="text-sm font-medium text-marino-800">
                    {TIPO_ORDEN[o.type] ?? o.type}
                  </span>
                  <span className="text-sm text-marino-500">
                    {o.cliente ?? '—'} · {o.zona}
                  </span>
                  <span className="ml-auto">
                    <Insignia tono={etiqueta(ESTADO_ORDEN, o.status).tono}>
                      {etiqueta(ESTADO_ORDEN, o.status).texto}
                    </Insignia>
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
