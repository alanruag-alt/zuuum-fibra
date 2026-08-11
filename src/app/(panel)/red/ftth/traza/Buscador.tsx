'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import type { Hilo } from '@/modulos/ftth/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

/**
 * Las dos formas de preguntar lo mismo.
 *
 * Casi siempre se parte del cliente, porque es quien llama. Partir del hilo
 * sirve cuando ya se está en la caja con la fusionadora en la mano.
 */
export function Buscador({
  hilos,
  cliente,
  hilo,
}: {
  hilos: Hilo[];
  cliente: string;
  hilo: string;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(cliente);
  const [porHilo, setPorHilo] = useState(Boolean(hilo));

  return (
    <Tarjeta>
      <div className="mb-3 flex flex-wrap gap-2">
        <Boton
          variante={porHilo ? 'secundario' : 'principal'}
          onClick={() => setPorHilo(false)}
          className="px-3 py-1.5 text-xs"
        >
          Desde un cliente
        </Boton>
        <Boton
          variante={porHilo ? 'principal' : 'secundario'}
          onClick={() => setPorHilo(true)}
          className="px-3 py-1.5 text-xs"
        >
          Desde un hilo
        </Boton>
      </div>

      {!porHilo ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) {
              router.push(`/red/ftth/traza?cliente=${encodeURIComponent(texto.trim())}`);
            }
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="block flex-1 min-w-[240px]">
            <span className="text-xs font-medium text-marino-600">Nombre o clave del cliente</span>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="María López   ·   CL-CUE-0123"
              className={CAMPO}
              autoFocus
            />
          </label>
          <Boton type="submit">Trazar</Boton>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get('hilo');
            if (v) router.push(`/red/ftth/traza?hilo=${v}`);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="block flex-1 min-w-[280px]">
            <span className="text-xs font-medium text-marino-600">Hilo</span>
            <select name="hilo" defaultValue={hilo} required className={CAMPO}>
              <option value="">Elige</option>
              {hilos.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.cable} · hilo {h.strand_number} ({h.color}
                  {h.tube_number > 1 ? `, tubo ${h.tube_number}` : ''})
                </option>
              ))}
            </select>
          </label>
          <Boton type="submit">Trazar</Boton>
        </form>
      )}
    </Tarjeta>
  );
}
