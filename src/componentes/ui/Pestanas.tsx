'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Seccion {
  ruta: string;
  etiqueta: string;
  /** Solo se marca activa si la ruta es exactamente esta. Para la raíz. */
  exacta?: boolean;
}

export function Pestanas({ secciones }: { secciones: Seccion[] }) {
  const aqui = usePathname();

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-marino-100">
      {secciones.map((s) => {
        const activa = s.exacta ? aqui === s.ruta : aqui.startsWith(s.ruta);
        return (
          <Link
            key={s.ruta}
            href={s.ruta}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
              activa
                ? 'border-naranja-500 font-medium text-naranja-600'
                : 'border-transparent text-marino-500 hover:border-marino-200 hover:text-marino-700'
            }`}
          >
            {s.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
