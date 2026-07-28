import { type ButtonHTMLAttributes } from 'react';

type Variante = 'principal' | 'secundario' | 'oscuro' | 'texto';

const ESTILOS: Record<Variante, string> = {
  principal: 'bg-naranja-500 text-white hover:bg-naranja-600 disabled:bg-naranja-200',
  secundario:
    'bg-white text-marino-700 border border-marino-200 hover:bg-marino-50 disabled:text-marino-300',
  oscuro: 'bg-marino-500 text-white hover:bg-marino-600 disabled:bg-marino-300',
  texto: 'text-naranja-600 hover:bg-naranja-50 disabled:text-marino-300',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  cargando?: boolean;
}

export function Boton({
  variante = 'principal',
  cargando = false,
  children,
  className = '',
  disabled,
  ...resto
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${ESTILOS[variante]} ${className}`}
      disabled={disabled || cargando}
      {...resto}
    >
      {cargando && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
