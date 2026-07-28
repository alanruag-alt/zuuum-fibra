'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { Zona } from '@/modulos/clientes/tipos';

const CAMPO =
  'rounded-lg border border-marino-200 bg-white px-3 py-2 text-sm text-marino-800 placeholder:text-marino-300 focus:border-naranja-400';

export function FiltrosMora({ zonas }: { zonas: Zona[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pendiente, iniciar] = useTransition();
  const [buscar, setBuscar] = useState(params.get('buscar') ?? '');

  function aplicar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    Object.entries(cambios).forEach(([k, v]) => {
      if (v) p.set(k, v);
      else p.delete(k);
    });
    p.delete('pagina');
    iniciar(() => router.push(`/cobranza?${p.toString()}`));
  }

  useEffect(() => {
    const actual = params.get('buscar') ?? '';
    if (buscar === actual) return;
    const t = setTimeout(() => aplicar({ buscar }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar]);

  const zona = params.get('zona') ?? '';
  const dias = params.get('dias') ?? '';
  const hayFiltros = Boolean(buscar || zona || dias);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por nombre, folio o teléfono…"
        className={`${CAMPO} w-full sm:w-80`}
        aria-label="Buscar entre los morosos"
      />

      <select
        value={zona}
        onChange={(e) => aplicar({ zona: e.target.value })}
        className={CAMPO}
        aria-label="Filtrar por zona"
      >
        <option value="">Todas las zonas</option>
        {zonas.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>

      <select
        value={dias}
        onChange={(e) => aplicar({ dias: e.target.value })}
        className={CAMPO}
        aria-label="Filtrar por días de atraso"
      >
        <option value="">Cualquier atraso</option>
        <option value="1">Ya vencidos</option>
        <option value="11">Pasado el corte</option>
        <option value="30">Más de 30 días</option>
        <option value="60">Más de 60 días</option>
      </select>

      {hayFiltros && (
        <button
          onClick={() => {
            setBuscar('');
            iniciar(() => router.push('/cobranza'));
          }}
          className="text-sm text-marino-400 underline underline-offset-2 hover:text-marino-600"
        >
          Limpiar
        </button>
      )}

      {pendiente && <span className="text-xs text-marino-400">buscando…</span>}
    </div>
  );
}
