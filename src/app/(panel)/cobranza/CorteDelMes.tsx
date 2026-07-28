'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { ejecutarCorte, type RespuestaCobro } from '@/modulos/cobranza/acciones';
import type { PorCortar } from '@/modulos/cobranza/corte';
import { pesos } from '@/lib/formato';

interface Props {
  periodoId: string;
  periodoLabel: string;
  lista: PorCortar[];
  aviso: string | null;
}

/**
 * El corte del día 11.
 *
 * Se ve la lista completa antes de apretar nada, agrupada por zona, porque el
 * que va a recibir las llamadas es quien está viendo esta pantalla.
 */
export function CorteDelMes({ periodoId, periodoLabel, lista, aviso }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const [estado, accion, enviando] = useActionState<RespuestaCobro | null, FormData>(
    ejecutarCorte,
    null,
  );

  if (aviso) {
    return <p className="py-4 text-center text-sm text-marino-400">{aviso}</p>;
  }

  if (estado?.ok) {
    return <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-exito">{estado.mensaje}</p>;
  }

  if (lista.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-marino-400">
        Nadie pasó el corte de {periodoLabel} debiendo. No hay a quién suspender.
      </p>
    );
  }

  const porZona = lista.reduce<Record<string, { n: number; suma: number }>>((acc, c) => {
    const z = (acc[c.zona] ??= { n: 0, suma: 0 });
    z.n += 1;
    z.suma += c.adeudo;
    return acc;
  }, {});

  const total = lista.reduce((s, c) => s + c.adeudo, 0);
  const visibles = verTodos ? lista : lista.slice(0, 8);

  return (
    <div>
      <p className="mb-3 text-sm text-marino-600">
        A <strong>{lista.length}</strong> servicios les toca el corte de {periodoLabel}. Entre todos
        deben <strong>{pesos(total)}</strong>.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(porZona)
          .sort((a, b) => b[1].n - a[1].n)
          .map(([zona, d]) => (
            <span
              key={zona}
              className="rounded-lg bg-marino-50 px-2.5 py-1 text-xs text-marino-600"
            >
              {zona} <strong className="text-marino-800">{d.n}</strong> · {pesos(d.suma)}
            </span>
          ))}
      </div>

      <div className="mb-3 max-h-64 overflow-y-auto rounded-lg border border-marino-100">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-marino-100">
            {visibles.map((c) => (
              <tr key={c.service_id}>
                <td className="px-3 py-2 font-mono text-xs text-marino-400">{c.customer_code}</td>
                <td className="px-3 py-2 text-marino-800">{c.cliente}</td>
                <td className="px-3 py-2 text-marino-500">{c.zona}</td>
                <td className="px-3 py-2 text-right font-medium text-falla">{pesos(c.adeudo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lista.length > 8 && (
        <button
          onClick={() => setVerTodos(!verTodos)}
          className="mb-4 text-sm text-naranja-600 underline underline-offset-2"
        >
          {verTodos ? 'Ver menos' : `Ver los ${lista.length}`}
        </button>
      )}

      {estado && !estado.ok && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-falla">{estado.mensaje}</p>
      )}

      {!confirmando ? (
        <Boton variante="oscuro" onClick={() => setConfirmando(true)}>
          Suspender a los {lista.length}
        </Boton>
      ) : (
        <form action={accion} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="periodo" value={periodoId} />
          <input type="hidden" name="esperados" value={lista.length} />
          <span className="text-sm text-marino-600">
            Se van a quedar sin servicio {lista.length} casas. ¿Seguro?
          </span>
          <Boton type="submit" variante="oscuro" cargando={enviando}>
            {enviando ? 'Suspendiendo…' : 'Sí, suspender'}
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            onClick={() => setConfirmando(false)}
            disabled={enviando}
          >
            Mejor no
          </Boton>
        </form>
      )}
    </div>
  );
}
