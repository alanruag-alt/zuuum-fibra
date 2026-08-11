import Link from 'next/link';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Punto } from '@/app/(panel)/red/ftth/cables/Editor';
import { Buscador } from '@/app/(panel)/red/ftth/traza/Buscador';
import { hilosParaFusionar, trazarCliente, trazarHilo } from '@/modulos/ftth/consultas';
import { ESTADO_HILO, TIPO_EMPALME, etiqueta } from '@/modulos/ftth/etiquetas';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Salto } from '@/modulos/ftth/tipos';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ cliente?: string; hilo?: string }>;
}

async function buscarCliente(codigo: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from('v_clientes')
    .select('id, full_name, customer_code, zona, phone')
    .or(`customer_code.ilike.%${codigo}%,full_name.ilike.%${codigo}%`)
    .limit(8);
  return (data ?? []) as {
    id: string;
    full_name: string;
    customer_code: string;
    zona: string;
    phone: string | null;
  }[];
}

export default async function PaginaTraza({ searchParams }: Props) {
  const { cliente, hilo } = await searchParams;
  const hilos = await hilosParaFusionar();

  let saltos: Salto[] = [];
  let fallo: string | null = null;
  let candidatos: Awaited<ReturnType<typeof buscarCliente>> = [];
  let elegido: (typeof candidatos)[number] | null = null;

  if (cliente) {
    candidatos = await buscarCliente(cliente.trim());
    // Con un solo resultado se traza directo: nadie quiere dar dos clics para
    // ver lo mismo. Con varios se pregunta cuál.
    if (candidatos.length === 1) {
      elegido = candidatos[0];
      const r = await trazarCliente(elegido.id);
      saltos = r.saltos;
      fallo = r.error;
    }
  } else if (hilo) {
    saltos = await trazarHilo(hilo);
  }

  const perdidaTotal = saltos.reduce((s, x) => s + Number(x.perdida_db ?? 0), 0);
  const metros = saltos.reduce((s, x) => s + Number(x.metros ?? 0), 0);
  const fusiones = saltos.filter((s) => s.caja).length;
  const cortado = saltos.find((s) => ['cortado', 'danado'].includes(s.estado));

  return (
    <div>
      <p className="mb-5 text-sm text-marino-500">
        Por dónde viene la fibra de alguien. Es la consulta de las once de la noche.
      </p>

      <Buscador hilos={hilos} cliente={cliente ?? ''} hilo={hilo ?? ''} />

      {candidatos.length > 1 && (
        <Tarjeta titulo="¿Cuál de todos?" className="mt-5">
          <ul className="divide-y divide-marino-100">
            {candidatos.map((c) => (
              <li key={c.id} className="py-2.5">
                <Link
                  href={`/red/ftth/traza?cliente=${encodeURIComponent(c.customer_code)}`}
                  className="flex flex-wrap items-baseline gap-2 hover:underline"
                >
                  <span className="font-medium text-marino-800">{c.full_name}</span>
                  <span className="font-mono text-xs text-marino-500">{c.customer_code}</span>
                  <span className="text-sm text-marino-400">{c.zona}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {candidatos.length === 0 && cliente && (
        <div className="mt-5 rounded-lg bg-marino-50 px-4 py-3 text-sm text-marino-500">
          No hay ningún cliente que se llame así ni que tenga esa clave.
        </div>
      )}

      {fallo && (
        <div className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          {fallo}
          <span className="mt-1 block text-xs">
            Para poder trazar hace falta que su NAP tenga capturado de qué hilo cuelga. Eso se pone
            en la pestaña de <strong>NAP y puertos</strong>.
          </span>
        </div>
      )}

      {elegido && saltos.length > 0 && (
        <div className="mt-5 rounded-lg border border-marino-200 bg-white px-4 py-3">
          <p className="text-sm font-medium text-marino-800">{elegido.full_name}</p>
          <p className="mt-0.5 text-sm text-marino-500">
            {elegido.customer_code} · {elegido.zona}
            {elegido.phone && ` · ${elegido.phone}`}
          </p>
        </div>
      )}

      {saltos.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <Insignia tono="marca">
              {saltos.length} {saltos.length === 1 ? 'tramo' : 'tramos'}
            </Insignia>
            {fusiones > 0 && (
              <Insignia tono="neutro">
                {fusiones} {fusiones === 1 ? 'empalme' : 'empalmes'}
              </Insignia>
            )}
            {metros > 0 && <Insignia tono="neutro">{numero(metros)} m de fibra</Insignia>}
            <Insignia tono={perdidaTotal > 1.5 ? 'falla' : perdidaTotal > 0.8 ? 'aviso' : 'ok'}>
              {perdidaTotal.toFixed(2)} dB en empalmes
            </Insignia>
          </div>

          {cortado && (
            <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-falla">
              Este camino pasa por un hilo marcado como <strong>{cortado.estado}</strong> en{' '}
              {cortado.cable}. Si el cliente no tiene servicio, empieza por ahí.
            </div>
          )}

          <div className="mt-4 space-y-0">
            {saltos.map((s, i) => (
              <div key={`${s.hilo_id}-${i}`}>
                {i > 0 && (
                  <div className="ml-6 flex items-center gap-3 py-1">
                    <span className="text-lg text-marino-300">↑</span>
                    <span className="text-xs text-marino-500">
                      {s.caja && (
                        <>
                          empalme en <strong className="font-mono">{s.caja}</strong>
                          {s.tipo_union && ` · ${TIPO_EMPALME[s.tipo_union] ?? s.tipo_union}`}
                          {s.perdida_db !== null && (
                            <span
                              className={
                                Number(s.perdida_db) > 0.3 ? ' font-semibold text-falla' : ''
                              }
                            >
                              {' '}
                              · {s.perdida_db} dB
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                )}
                <div
                  className={`rounded-lg border p-3 ${
                    i === 0 ? 'border-naranja-300 bg-naranja-50/60' : 'border-marino-200 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Punto color={s.color} />
                    <span className="font-mono text-sm font-semibold text-marino-800">
                      {s.cable}
                    </span>
                    <span className="text-sm text-marino-600">
                      hilo {s.numero} · {s.color}
                      {s.tubo > 1 && ` · tubo ${s.tubo}`}
                    </span>
                    <Insignia tono={etiqueta(ESTADO_HILO, s.estado).tono}>
                      {etiqueta(ESTADO_HILO, s.estado).texto}
                    </Insignia>
                    {i === 0 && (
                      <span className="text-xs text-marino-400">— de aquí cuelga la NAP</span>
                    )}
                    {s.destino && (
                      <span className="ml-auto text-xs text-marino-500">
                        termina en <strong className="font-mono">{s.destino}</strong>
                      </span>
                    )}
                  </div>
                  {s.metros && (
                    <p className="mt-1 text-xs text-marino-400">{numero(Number(s.metros))} m</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-marino-400">
            El recorrido va de abajo hacia arriba: empieza en el hilo del que cuelga la NAP y sube
            hasta donde se acaben las fusiones capturadas. Si termina antes de llegar al ODF, es que
            falta capturar una fusión en el camino.
          </p>
        </>
      )}

      {!cliente && !hilo && (
        <Tarjeta className="mt-5">
          <div className="py-10 text-center">
            <p className="text-3xl">🔍</p>
            <p className="mt-3 text-sm font-medium text-marino-800">
              Escribe el nombre o la clave de un cliente
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              El sistema sube desde el puerto de su NAP hasta donde llegue la fibra, pasando por
              cada empalme y sumando la pérdida de cada uno. También puedes partir de un hilo.
            </p>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
