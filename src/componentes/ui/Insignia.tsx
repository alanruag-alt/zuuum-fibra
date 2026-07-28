import { type ReactNode } from 'react';

type Tono = 'neutro' | 'marca' | 'ok' | 'aviso' | 'falla';

const ESTILOS: Record<Tono, string> = {
  neutro: 'bg-marino-100 text-marino-600',
  marca: 'bg-naranja-100 text-naranja-700',
  ok: 'bg-green-50 text-exito',
  aviso: 'bg-amber-50 text-aviso',
  falla: 'bg-red-50 text-falla',
};

interface Props {
  children: ReactNode;
  tono?: Tono;
}

export function Insignia({ children, tono = 'neutro' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[tono]}`}
    >
      {children}
    </span>
  );
}
