'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MENU } from '@/componentes/layout/menu';
import { Logo } from '@/componentes/ui/Logo';

interface Props {
  abierto: boolean;
  alCerrar: () => void;
}

export function MenuLateral({ abierto, alCerrar }: Props) {
  const ruta = usePathname();

  return (
    <>
      {/* Fondo oscuro en teléfono */}
      {abierto && (
        <div
          className="fixed inset-0 z-30 bg-marino-950/60 lg:hidden"
          onClick={alCerrar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-marino-500 transition-transform duration-200 lg:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-5">
          <Link href="/tablero" onClick={alCerrar} aria-label="Ir al tablero">
            <Logo variante="blanco" alto={24} prioridad />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {MENU.map((grupo) => (
            <div key={grupo.titulo} className="mb-5">
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                {grupo.titulo}
              </p>
              <ul className="space-y-0.5">
                {grupo.elementos.map((el) => {
                  const activo = ruta === el.ruta || ruta.startsWith(`${el.ruta}/`);

                  if (!el.listo) {
                    return (
                      <li key={el.id}>
                        <span
                          className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-white/25"
                          title="Este módulo todavía no está construido"
                        >
                          <span aria-hidden="true">{el.icono}</span>
                          <span className="flex-1">{el.etiqueta}</span>
                          <span className="text-[10px] uppercase tracking-wide">pronto</span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={el.id}>
                      <Link
                        href={el.ruta}
                        onClick={alCerrar}
                        className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
                          activo
                            ? 'bg-naranja-500 font-medium text-white shadow-sm'
                            : 'text-white/75 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span aria-hidden="true">{el.icono}</span>
                        {el.etiqueta}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-3">
          <p className="text-[11px] text-white/35">Etapa 5 · esqueleto del panel</p>
        </div>
      </aside>
    </>
  );
}
