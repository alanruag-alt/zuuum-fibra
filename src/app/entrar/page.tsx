import { Suspense } from 'react';
import { FormaEntrar } from '@/app/entrar/FormaEntrar';
import { Logo } from '@/componentes/ui/Logo';

export default function PaginaEntrar() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Lado izquierdo: la marca. En teléfono se esconde. */}
      <div className="relative hidden flex-col justify-between bg-marino-500 p-10 lg:flex">
        <Logo variante="blanco" alto={30} prioridad />

        <div className="relative">
          <h2 className="max-w-sm text-3xl font-semibold leading-tight text-white">
            Toda la red y todos los clientes en un solo lugar.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            Fibra e inalámbrico, cobranza, instalaciones e inventario. Lo que antes vivía en doce
            hojas de cálculo.
          </p>
        </div>

        <p className="text-xs text-white/35">Cuencamé, Durango</p>

        {/* Destello naranja de fondo */}
        <div
          className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-naranja-500/20 blur-3xl"
          aria-hidden="true"
        />
      </div>

      {/* Lado derecho: el formulario */}
      <div className="flex items-center justify-center bg-marino-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo alto={32} prioridad />
          </div>

          <div className="rounded-xl border border-marino-100 bg-white p-6 shadow-tarjeta sm:p-8">
            <h1 className="text-lg font-semibold text-marino-800">Entrar al panel</h1>
            <p className="mb-6 mt-1 text-sm text-marino-400">
              Usa el correo que te dio el administrador.
            </p>

            <Suspense fallback={<p className="text-sm text-marino-300">Cargando…</p>}>
              <FormaEntrar />
            </Suspense>
          </div>

          <p className="mt-6 text-center text-xs text-marino-400">
            ¿Problemas para entrar? Habla con el administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
