import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import Diagrama from '@/app/(panel)/red/ftth/caja/[id]/Diagrama';
import { TablaConexiones } from '@/app/(panel)/red/ftth/caja/[id]/TablaConexiones';
import { cablesEnCaja, destinosEnCaja, hilosEnCaja } from '@/modulos/ftth/caja';
import { listarCables } from '@/modulos/ftth/consultas';
import { listarSplitters, salidasDe } from '@/modulos/ftth/splitters';
import { crearClienteServidor } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

export default async function PaginaCaja({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: elemento }, cables, hilos, dest, todos, splittersTodos] = await Promise.all([
    supabase
      .from('v_elementos_red')
      .select('id, code, name, element_type, zona')
      .eq('id', id)
      .maybeSingle(),
    cablesEnCaja(id),
    hilosEnCaja(id),
    destinosEnCaja(id),
    listarCables(),
    listarSplitters(),
  ]);

  const caja = elemento as unknown as {
    id: string;
    code: string;
    name: string | null;
    element_type: string;
    zona: string | null;
  } | null;

  if (!caja) notFound();

  const destinos = [
    ...dest.naps.map((n) => ({
      id: n.id,
      code: n.code,
      que: 'nap' as const,
      alimentado: n.alimentado,
      detalle: null,
    })),
    ...dest.splitters.map((s) => ({
      id: s.id,
      code: s.code,
      que: 'splitter' as const,
      alimentado: s.alimentado,
      detalle: s.ratio,
    })),
  ];

  // Los splitters de esta caja, con sus salidas, para dibujarlos como nodos con
  // entrada y salidas que se arrastran.
  const splittersCaja = splittersTodos.filter((s) => s.housing_id === id);
  const salidasPorSplitter = Object.fromEntries(
    await Promise.all(splittersCaja.map(async (s) => [s.id, await salidasDe(s.id)] as const)),
  );
  // Qué hilo alimenta cada splitter (la vista no lo expone; se lee de la tabla).
  const { data: feedsData } = await supabase
    .from('splitters')
    .select('id, in_strand_id')
    .eq('housing_id', id);
  const feedPorSplitter = new Map(
    ((feedsData ?? []) as { id: string; in_strand_id: string | null }[]).map((f) => [
      f.id,
      f.in_strand_id,
    ]),
  );
  const splitters = splittersCaja.map((s) => ({
    splitter: s,
    salidas: (salidasPorSplitter[s.id] ?? []).map((o) => ({
      id: o.id,
      numero: o.port_number,
      estado: o.status,
      destino: o.nap
        ? o.nap
        : o.cable
          ? `${o.cable} h${o.strand_number}`
          : o.puerto_nap
            ? `puerto ${o.puerto_nap}`
            : null,
    })),
  }));

  // Las líneas curvas del dibujo (además de hilo↔hilo, que el diagrama saca
  // solo de los empalmes). Se casan los puntos aquí, en el servidor:
  //  · hilo → entrada de un splitter o NAP  (por `termina_en` = código destino)
  //  · salida de un splitter → hilo (por cable + número) o → NAP (por código)
  const porCodigo = new Map(destinos.map((d) => [d.code, d]));
  const hiloPorCableNum = new Map<string, string>();
  for (const h of hilos) hiloPorCableNum.set(`${h.cable}|${h.numero}`, h.hilo_id);

  const conexiones: { desde: string; hasta: string; color: string | null }[] = [];

  for (const h of hilos) {
    if (!h.termina_en) continue;
    const d = porCodigo.get(h.termina_en);
    if (d) conexiones.push({ desde: h.hilo_id, hasta: d.id, color: h.color });
  }

  for (const s of splittersCaja) {
    for (const o of salidasPorSplitter[s.id] ?? []) {
      if (o.nap) {
        const d = porCodigo.get(o.nap);
        if (d) conexiones.push({ desde: `sal:${o.id}`, hasta: d.id, color: null });
      } else if (o.cable && o.strand_number != null) {
        const hiloId = hiloPorCableNum.get(`${o.cable}|${o.strand_number}`);
        if (hiloId) conexiones.push({ desde: `sal:${o.id}`, hasta: hiloId, color: o.color_hilo });
      }
    }
  }

  // La ENTRADA del splitter: el hilo que lo alimenta se une a su punto de
  // entrada, igual que las salidas. Se dibuja aunque el hilo esté cortado.
  const colorDeHilo = new Map(hilos.map((h) => [h.hilo_id, h.color]));
  for (const s of splittersCaja) {
    const feed = feedPorSplitter.get(s.id);
    if (feed) conexiones.push({ desde: feed, hasta: s.id, color: colorDeHilo.get(feed) ?? null });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-marino-500">
          <Link href="/red/ftth/caja" className="text-naranja-600 hover:underline">
            ← Todas las cajas
          </Link>
          <span className="mx-2 text-marino-300">·</span>
          {caja.zona ?? 'sin zona'}
        </p>
      </div>

      {caja.element_type !== 'closure' && caja.element_type !== 'nap' ? (
        <Tarjeta>
          <p className="py-10 text-center text-sm text-marino-400">
            {caja.code} no es una caja de empalme. Adentro de eso no se fusiona.
          </p>
        </Tarjeta>
      ) : (
        <>
          <Diagrama
            caja={{ id: caja.id, code: caja.code, name: caja.name, tipo: caja.element_type }}
            cables={cables}
            hilos={hilos}
            destinos={destinos}
            splitters={splitters}
            conexiones={conexiones}
            disponibles={todos.map((c) => ({ id: c.id, code: c.code, hilos: c.fiber_count }))}
          />
          <TablaConexiones caja={caja.id} />
        </>
      )}
    </div>
  );
}
