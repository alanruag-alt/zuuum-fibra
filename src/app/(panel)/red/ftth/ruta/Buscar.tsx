'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';

/**
 * El buscador.
 *
 * Manda por la barra de direcciones a propósito: así la ruta de un cliente se
 * puede copiar y pegar en un mensaje, y el que la recibe abre exactamente lo
 * mismo. Es lo que uno quiere cuando le está explicando a un técnico por
 * dónde va la fibra.
 */
export function Buscar({ q }: { q: string }) {
  const [texto, setTexto] = useState(q);
  const router = useRouter();

  function buscar() {
    const t = texto.trim();
    if (t.length < 2) return;
    router.push(`/red/ftth/ruta?q=${encodeURIComponent(t)}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && buscar()}
        placeholder="Nombre del cliente o su código"
        className="w-full max-w-sm rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none"
        autoFocus
      />
      <Boton onClick={buscar} disabled={texto.trim().length < 2}>
        Ver su ruta
      </Boton>
      {q && (
        <Boton variante="texto" onClick={() => router.push('/red/ftth/ruta')}>
          Limpiar
        </Boton>
      )}
    </div>
  );
}
