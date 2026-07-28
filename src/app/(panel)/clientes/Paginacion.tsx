'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface Props {
  pagina: number;
  porPagina: number;
  total: number;
}

export function Paginacion({ pagina, porPagina, total }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  // La ruta sale de dónde está puesta. Antes estaba escrita a mano como
  // '/clientes', y al reusar el componente en cobranza mandaba al padrón.
  const ruta = usePathname();
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  if (paginas <= 1) return null;

  function ir(p: number) {
    const q = new URLSearchParams(params.toString());
    if (p <= 1) q.delete('pagina');
    else q.set('pagina', String(p));
    const cola = q.toString();
    router.push(cola ? `${ruta}?${cola}` : ruta);
  }

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-marino-100 pt-4">
      <p className="text-sm text-marino-400">
        {desde}–{hasta} de {total.toLocaleString('es-MX')}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => ir(pagina - 1)}
          disabled={pagina <= 1}
          className="rounded-lg border border-marino-200 px-3 py-1.5 text-sm text-marino-600 disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="text-sm text-marino-400">
          {pagina} / {paginas}
        </span>
        <button
          onClick={() => ir(pagina + 1)}
          disabled={pagina >= paginas}
          className="rounded-lg border border-marino-200 px-3 py-1.5 text-sm text-marino-600 disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
