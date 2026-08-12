import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import Diagrama from '@/app/(panel)/red/ftth/caja/[id]/Diagrama';
import { SplittersDeCaja } from '@/app/(panel)/red/ftth/caja/[id]/Splitters';
import { cablesEnCaja, destinosEnCaja, hilosEnCaja } from '@/modulos/ftth/caja';
import { listarCables } from '@/modulos/ftth/consultas';
import { crearClienteServidor } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

export default async function PaginaCaja({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: elemento }, cables, hilos, dest, todos] = await Promise.all([
    supabase
      .from('v_elementos_red')
      .select('id, code, name, element_type, zona')
      .eq('id', id)
      .maybeSingle(),
    cablesEnCaja(id),
    hilosEnCaja(id),
    destinosEnCaja(id),
    listarCables(),
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
            disponibles={todos.map((c) => ({ id: c.id, code: c.code, hilos: c.fiber_count }))}
          />
          <SplittersDeCaja
            caja={{ id: caja.id, code: caja.code, tipo: caja.element_type, zona: caja.zona }}
          />
        </>
      )}
    </div>
  );
}
