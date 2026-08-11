'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Boton } from '@/componentes/ui/Boton';
import { Insignia } from '@/componentes/ui/Insignia';
import { Punto } from '@/app/(panel)/red/ftth/cables/Editor';
import { alimentarNap, asignarPuerto } from '@/modulos/ftth/acciones';
import { ESTADO_PUERTO, SEMAFORO_RX, etiqueta } from '@/modulos/ftth/etiquetas';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Hilo, PuertoNap } from '@/modulos/ftth/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

function Aviso({ estado }: { estado: Respuesta | null }) {
  if (!estado) return null;
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${
        estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
      }`}
    >
      {estado.mensaje}
    </p>
  );
}

/** De qué hilo cuelga la NAP. Sin esto no se puede trazar nada. */
export function Alimentacion({
  napId,
  hiloActual,
  entradaActual,
  hilos,
}: {
  napId: string;
  hiloActual: string | null;
  entradaActual: number | null;
  hilos: Hilo[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(alimentarNap, null);

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        {hiloActual ? 'cambiar el hilo' : 'decir de qué hilo cuelga'}
      </Boton>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-naranja-200 bg-naranja-50/50 p-3">
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="nap" value={napId} />
        <label className="block min-w-[260px] flex-1">
          <span className="text-xs font-medium text-marino-600">Hilo que la alimenta</span>
          <select name="hilo" defaultValue={hiloActual ?? ''} className={CAMPO}>
            <option value="">— ninguno —</option>
            {hilos.map((h) => (
              <option key={h.id} value={h.id}>
                {h.cable} · hilo {h.strand_number} ({h.color}
                {h.tube_number > 1 ? `, tubo ${h.tube_number}` : ''})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Potencia de entrada (dBm)</span>
          <input
            name="entrada"
            type="number"
            step="0.1"
            defaultValue={entradaActual ?? ''}
            placeholder="-18.4"
            className={`${CAMPO} w-36`}
          />
        </label>
        <Boton type="submit" cargando={enviando}>
          Guardar
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

/** Un puerto. Se abre al tocarlo y ahí mismo se pone o se quita al cliente. */
export function Puerto({ p }: { p: PuertoNap }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    asignarPuerto,
    null,
  );

  const e = etiqueta(ESTADO_PUERTO, p.status);
  const rx = p.semaforo_rx ? etiqueta(SEMAFORO_RX, p.semaforo_rx) : null;

  const fondo =
    p.status === 'ocupado'
      ? rx?.tono === 'falla'
        ? 'border-red-300 bg-red-50'
        : rx?.tono === 'aviso'
          ? 'border-amber-300 bg-amber-50'
          : 'border-naranja-200 bg-naranja-50'
      : p.status === 'danado'
        ? 'border-red-200 bg-red-50'
        : p.status === 'reservado'
          ? 'border-amber-200 bg-amber-50'
          : 'border-marino-200 bg-white';

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`flex min-w-[132px] flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-naranja-400 ${fondo}`}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="text-xs font-semibold text-marino-700">P{p.port_number}</span>
          {p.rx_dbm !== null && (
            <span
              className={`text-[11px] font-medium ${
                rx?.tono === 'falla'
                  ? 'text-falla'
                  : rx?.tono === 'aviso'
                    ? 'text-aviso'
                    : 'text-exito'
              }`}
            >
              {p.rx_dbm} dBm
            </span>
          )}
        </span>
        <span className="w-full truncate text-[11px] text-marino-500">{p.cliente ?? e.texto}</span>
      </button>

      {abierto && (
        <div className="w-full rounded-lg border border-naranja-200 bg-white p-3">
          <p className="mb-2 text-sm font-medium text-marino-800">
            {p.nap} · puerto {p.port_number}
            {p.cliente && (
              <span className="ml-2 text-xs font-normal text-marino-500">
                {p.cliente} · {p.customer_code}
              </span>
            )}
          </p>

          {p.customer_id && (
            <Link
              href={`/clientes/${p.customer_id}`}
              className="mb-2 inline-block text-xs text-naranja-600 hover:underline"
            >
              ver su expediente →
            </Link>
          )}

          <form action={accion} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="nap" value={p.element_id} />
            <input type="hidden" name="puerto" value={p.port_number} />
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Clave del cliente</span>
              <input
                name="codigo"
                defaultValue={p.customer_code ?? ''}
                placeholder="CL-CUE-0123"
                className={`${CAMPO} w-40 font-mono`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Potencia (dBm)</span>
              <input
                name="rx"
                type="number"
                step="0.1"
                defaultValue={p.rx_dbm ?? ''}
                placeholder="-22.5"
                className={`${CAMPO} w-28`}
              />
            </label>
            <Boton type="submit" cargando={enviando}>
              Guardar
            </Boton>
            {p.service_id && (
              <Boton type="submit" name="soltar" value="si" variante="secundario">
                Liberar el puerto
              </Boton>
            )}
            <Boton type="button" variante="texto" onClick={() => setAbierto(false)}>
              Cerrar
            </Boton>
          </form>

          <p className="mt-2 text-xs text-marino-400">
            Una ONT sana recibe entre −8 y −25 dBm. Abajo de −27 el problema es óptico y reiniciar
            el módem no arregla nada.
          </p>
          <Aviso estado={estado} />
        </div>
      )}
    </>
  );
}

export function Semaforo({ p }: { p: PuertoNap }) {
  if (!p.semaforo_rx) return null;
  const rx = etiqueta(SEMAFORO_RX, p.semaforo_rx);
  return <Insignia tono={rx.tono}>{rx.texto}</Insignia>;
}

export { Punto };
