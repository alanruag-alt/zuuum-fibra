import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Cancelar, Firmar, Generar } from '@/app/(panel)/contratos/Editor';
import { listarContratos, serviciosSinContrato } from '@/modulos/contratos/consultas';
import { fecha, numero, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const ESTADO: Record<
  string,
  { texto: string; tono: 'ok' | 'aviso' | 'falla' | 'neutro' | 'marca' }
> = {
  draft: { texto: 'Borrador', tono: 'neutro' },
  active: { texto: 'Vigente', tono: 'ok' },
  expired: { texto: 'Vencido', tono: 'aviso' },
  cancelled: { texto: 'Cancelado', tono: 'neutro' },
};

export default async function PaginaContratos() {
  const [contratos, pendientes] = await Promise.all([listarContratos(), serviciosSinContrato()]);

  const vigentes = contratos.filter((c) => c.status === 'active');
  const sinFirmar = contratos.filter((c) => c.sin_firmar);

  // Se agrupan por zona: el papel se junta y se sale a firmar por localidad,
  // no cliente por cliente.
  const porZona = new Map<string, typeof pendientes>();
  for (const s of pendientes) {
    if (!porZona.has(s.zona)) porZona.set(s.zona, []);
    porZona.get(s.zona)!.push(s);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Contratos</h1>
        <p className="mt-1 text-sm text-marino-400">
          El papel que respalda cada servicio. Con folio propio de cada zona.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(vigentes.length)} etiqueta="Vigentes" tono="ok" />
        <Indicador
          valor={numero(sinFirmar.length)}
          etiqueta="Sin firma"
          tono={sinFirmar.length > 0 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={numero(pendientes.length)}
          etiqueta="Servicios sin contrato"
          tono={pendientes.length > 0 ? 'falla' : 'ok'}
        />
        <Indicador
          valor={pesos(pendientes.reduce((s, p) => s + p.mensualidad, 0))}
          etiqueta="Mensualidad sin respaldo"
        />
      </div>

      {pendientes.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          El padrón se cargó desde los Excel y ninguno de esos clientes traía contrato. Genera el
          folio aquí, imprímelo y júntalo cuando pases a cobrar: es lo que sirve el día que alguien
          no paga o no devuelve el equipo.
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="mb-6 space-y-5">
          {[...porZona.entries()].map(([zona, lista]) => (
            <Tarjeta
              key={zona}
              titulo={`Sin contrato · ${zona}`}
              descripcion={`${lista.length} servicios activos`}
            >
              <ul className="divide-y divide-marino-100">
                {lista.map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/clientes/${s.customer_id}`}
                          className="font-medium text-marino-800 hover:text-naranja-600 hover:underline"
                        >
                          {s.cliente}
                        </Link>
                        <p className="mt-0.5 text-sm text-marino-500">
                          {s.customer_code} · {s.plan} · {pesos(s.mensualidad)} ·{' '}
                          {s.network_type === 'ftth' ? 'fibra' : 'inalámbrico'}
                          {s.desde && ` · desde ${fecha(s.desde)}`}
                        </p>
                      </div>
                      <Generar servicio={s} />
                    </div>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ))}
        </div>
      )}

      <Tarjeta titulo="Contratos generados">
        {contratos.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">📄</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay contratos</p>
            <p className="mt-1 text-sm text-marino-400">
              Genera el primero desde la lista de arriba.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-marino-100">
            {contratos.map((c) => {
              const e = ESTADO[c.status] ?? { texto: c.status, tono: 'neutro' as const };
              return (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium text-marino-800">
                          {c.contract_number}
                        </span>
                        <Insignia tono={e.tono}>{e.texto}</Insignia>
                        {c.sin_firmar && <Insignia tono="aviso">sin firma</Insignia>}
                      </div>
                      <p className="mt-0.5 text-sm text-marino-500">
                        <Link
                          href={`/clientes/${c.customer_id}`}
                          className="text-naranja-600 hover:underline"
                        >
                          {c.cliente}
                        </Link>{' '}
                        · {c.customer_code} · {c.zona} · {c.plan ?? '—'} ·{' '}
                        {pesos(Number(c.mensualidad ?? 0))}
                      </p>
                      <p className="mt-0.5 text-xs text-marino-400">
                        {c.start_date ? `del ${fecha(c.start_date)}` : 'sin fecha de inicio'}
                        {c.end_date && ` al ${fecha(c.end_date)}`}
                        {c.signed_at && ` · firmado el ${fecha(c.signed_at)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {c.sin_firmar && <Firmar contrato={c} />}
                      {c.status !== 'cancelled' && <Cancelar contrato={c} />}
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
