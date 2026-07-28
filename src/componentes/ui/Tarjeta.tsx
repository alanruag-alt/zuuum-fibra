import { type ReactNode } from 'react';

interface Props {
  titulo?: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Tarjeta({ titulo, descripcion, acciones, children, className = '' }: Props) {
  return (
    <section
      className={`rounded-xl border border-marino-100 bg-white p-4 shadow-tarjeta sm:p-5 ${className}`}
    >
      {(titulo || acciones) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {titulo && <h2 className="text-base font-semibold text-marino-800">{titulo}</h2>}
            {descripcion && <p className="mt-1 text-sm text-marino-400">{descripcion}</p>}
          </div>
          {acciones && <div className="flex gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
