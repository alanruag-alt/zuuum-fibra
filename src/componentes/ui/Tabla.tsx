import { type ReactNode } from 'react';

interface Props {
  encabezados: string[];
  children: ReactNode;
  /** Mensaje cuando no hay filas. */
  vacio?: string;
  hayFilas?: boolean;
}

export function Tabla({
  encabezados,
  children,
  vacio = 'No hay nada que mostrar',
  hayFilas = true,
}: Props) {
  if (!hayFilas) {
    return <p className="py-8 text-center text-sm text-marino-300">{vacio}</p>;
  }

  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-marino-100">
            {encabezados.map((e) => (
              <th
                key={e}
                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-marino-400"
              >
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-marino-100">{children}</tbody>
      </table>
    </div>
  );
}
