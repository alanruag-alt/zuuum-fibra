'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { Zona } from '@/modulos/clientes/tipos';

const CAMPO =
  'rounded-lg border border-marino-200 bg-white px-3 py-2 text-sm text-marino-800 placeholder:text-marino-300 focus:border-naranja-400';

export function Filtros({ zonas }: { zonas: Zona[] }) {
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
    p.delete('pagina'); // cualquier filtro nuevo vuelve a la primera página
    iniciar(() => router.push(`/clientes?${p.toString()}`));
  }

  // La búsqueda espera a que dejes de teclear: si no, se dispara una consulta
  // por cada letra y con 1,102 clientes se siente lento.
  useEffect(() => {
    const actual = params.get('buscar') ?? '';
    if (buscar === actual) return;
    const t = setTimeout(() => aplicar({ buscar }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar]);

  const zona = params.get('zona') ?? '';
  const estado = params.get('estado') ?? '';
  const revisar = params.get('revisar') ?? '';
  const hayFiltros = Boolean(buscar || zona || estado || revisar);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por nombre, folio o teléfono…"
        className={`${CAMPO} w-full sm:w-80`}
        aria-label="Buscar clientes"
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
        value={estado}
        onChange={(e) => aplicar({ estado: e.target.value })}
        className={CAMPO}
        aria-label="Filtrar por estado"
      >
        <option value="">Todos los estados</option>
        <option value="active">Activos</option>
        <option value="overdue">Morosos</option>
        <option value="suspended">Suspendidos</option>
        <option value="cancelled">Baja</option>
      </select>

      <button
        onClick={() => aplicar({ revisar: revisar ? '' : '1' })}
        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
          revisar
            ? 'border-naranja-400 bg-naranja-50 text-naranja-700'
            : 'border-marino-200 bg-white text-marino-600 hover:bg-marino-50'
        }`}
        title="Los que entraron del Excel sin precio capturado"
      >
        Sin precio
      </button>

      {hayFiltros && (
        <button
          onClick={() => {
            setBuscar('');
            iniciar(() => router.push('/clientes'));
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
