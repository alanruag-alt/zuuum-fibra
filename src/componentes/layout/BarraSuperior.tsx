'use client';

import { Isotipo } from '@/componentes/ui/Logo';

interface Props {
  nombre: string;
  rol: string;
  alAbrirMenu: () => void;
}

export function BarraSuperior({ nombre, rol, alAbrirMenu }: Props) {
  const iniciales = nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    // La barra es pegajosa y opaca a propósito. Antes era translúcida con
    // backdrop-blur, y eso obliga al navegador a volver a desenfocar todo lo
    // que pasa por detrás en CADA cuadro del desplazamiento. En una máquina
    // con gráficos integrados —la de la oficina— eso se siente como que el
    // sistema va lento. Blanco sólido: se ve casi igual y el scroll queda liso.
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-marino-100 bg-white px-4 sm:px-6">
      <button
        onClick={alAbrirMenu}
        className="grid h-9 w-9 place-items-center rounded-lg text-marino-500 hover:bg-marino-50 lg:hidden"
        aria-label="Abrir el menú"
      >
        ☰
      </button>

      {/* En teléfono el menú está escondido, así que se muestra el isotipo */}
      <span className="lg:hidden">
        <Isotipo tam={28} />
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-medium text-marino-800">{nombre}</p>
          <p className="text-xs text-marino-400">{rol}</p>
        </div>
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marino-500 text-xs font-semibold text-white"
          aria-hidden="true"
        >
          {iniciales || '·'}
        </span>
        <form action="/auth/salir" method="post">
          <button
            type="submit"
            className="rounded-lg border border-marino-200 px-3 py-1.5 text-sm text-marino-600 transition-colors hover:border-naranja-300 hover:bg-naranja-50 hover:text-naranja-700"
          >
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
