import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Alimentacion, Puerto } from '@/app/(panel)/red/ftth/naps/Editor';
import { hilosParaFusionar, listarNaps, todosLosPuertos } from '@/modulos/ftth/consultas';
import { numero } from '@/lib/formato';
import { crearClienteServidor } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

interface NapConHilo {
  id: string;
  code: string;
  name: string | null;
  zona: string | null;
  capacity: number | null;
  feed_strand_id: string | null;
  input_dbm: number | null;
}

/**
 * Se lee directo de la tabla porque hacen falta dos columnas que la vista de
 * elementos no trae: de qué hilo cuelga y con cuánta potencia entra.
 */
async function napsConAlimentacion(): Promise<NapConHilo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('network_elements')
    .select('id, code, name, capacity, feed_strand_id, input_dbm, zones(name)')
    .eq('element_type', 'nap')
    .eq('is_active', true)
    .order('code');

  if (error) return [];

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((n) => {
    const z = Array.isArray(n.zones) ? n.zones[0] : n.zones;
    return {
      id: n.id as string,
      code: n.code as string,
      name: (n.name as string) ?? null,
      zona: (z as { name?: string })?.name ?? null,
      capacity: (n.capacity as number) ?? null,
      feed_strand_id: (n.feed_strand_id as string) ?? null,
      input_dbm: (n.input_dbm as number) ?? null,
    };
  });
}

export default async function PaginaNaps() {
  const [naps, puertos, hilos] = await Promise.all([
    napsConAlimentacion(),
    todosLosPuertos(),
    hilosParaFusionar(),
  ]);

  await listarNaps();

  const porNap = new Map<string, typeof puertos>();
  for (const p of puertos) {
    if (!porNap.has(p.element_id)) porNap.set(p.element_id, []);
    porNap.get(p.element_id)!.push(p);
  }

  const ocupados = puertos.filter((p) => p.status === 'ocupado');
  const conProblema = ocupados.filter((p) => p.semaforo_rx === 'mal');
  const alLimite = ocupados.filter((p) => p.semaforo_rx === 'al_limite');
  const sinHilo = naps.filter((n) => !n.feed_strand_id);
  const cupo = naps.reduce((s, n) => s + Number(n.capacity ?? 0), 0);

  return (
    <div>
      <p className="mb-5 text-sm text-marino-500">
        Cada NAP con sus puertos, quién está en cada uno y con cuánta señal llega.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={`${numero(ocupados.length)} / ${numero(cupo)}`}
          etiqueta="Puertos ocupados"
          tono="marca"
        />
        <Indicador
          valor={numero(conProblema.length)}
          etiqueta="Con señal baja"
          tono={conProblema.length > 0 ? 'falla' : 'ok'}
          detalle="abajo de −27 dBm"
        />
        <Indicador
          valor={numero(alLimite.length)}
          etiqueta="Al límite"
          tono={alLimite.length > 0 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={numero(sinHilo.length)}
          etiqueta="Sin hilo capturado"
          tono={sinHilo.length > 0 ? 'aviso' : 'ok'}
          detalle="no se pueden trazar"
        />
      </div>

      {conProblema.length > 0 && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-falla">
          <strong>{conProblema.length}</strong>{' '}
          {conProblema.length === 1 ? 'cliente recibe' : 'clientes reciben'} menos señal de la que
          aguanta una ONT:{' '}
          {conProblema.map((p) => `${p.cliente ?? p.nap} (${p.rx_dbm} dBm)`).join(', ')}. Ahí el
          problema es óptico —empalme, splitter o fibra lastimada—, no el módem.
        </div>
      )}

      {sinHilo.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          <strong>{sinHilo.length}</strong>{' '}
          {sinHilo.length === 1 ? 'NAP no tiene' : 'NAP no tienen'} capturado de qué hilo cuelgan:{' '}
          {sinHilo.map((n) => n.code).join(', ')}. Mientras no lo tengan, sus clientes no se pueden
          trazar ni salen en el impacto de un corte.
        </div>
      )}

      {naps.length === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">📡</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay NAP</p>
            <p className="mt-1 text-sm text-marino-400">
              Captúralas en la pestaña de Elementos, con su código y cuántos puertos tienen.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          {naps.map((n) => {
            const suyos = porNap.get(n.id) ?? [];
            const usados = suyos.filter((p) => p.status === 'ocupado').length;
            const cap = n.capacity ?? suyos.length;
            const pct = cap ? Math.round((usados / cap) * 100) : 0;
            return (
              <Tarjeta key={n.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-marino-800">
                        {n.code}
                      </span>
                      {n.name && <span className="text-sm text-marino-500">{n.name}</span>}
                      {n.zona && <Insignia tono="neutro">{n.zona}</Insignia>}
                      {!n.feed_strand_id && <Insignia tono="aviso">sin hilo</Insignia>}
                      {n.input_dbm !== null && (
                        <span className="text-xs text-marino-400">entra con {n.input_dbm} dBm</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-medium text-marino-700">
                        {usados}/{cap} <span className="font-normal text-marino-400">puertos</span>
                      </p>
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-marino-100">
                        <div
                          className={`h-full ${
                            pct >= 100 ? 'bg-falla' : pct >= 85 ? 'bg-aviso' : 'bg-exito'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Alimentacion
                  napId={n.id}
                  hiloActual={n.feed_strand_id}
                  entradaActual={n.input_dbm}
                  hilos={hilos}
                />

                {suyos.length === 0 ? (
                  <p className="mt-3 text-sm text-marino-400">
                    Sus puertos se crean solos en cuanto la NAP tenga capacidad. Ponle cuántos
                    puertos tiene en la pestaña de Elementos.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {suyos.map((p) => (
                      <Puerto key={p.id} p={p} />
                    ))}
                  </div>
                )}
              </Tarjeta>
            );
          })}
        </div>
      )}
    </div>
  );
}
