import Link from 'next/link';
import { Logo } from '@/componentes/ui/Logo';

export default function NoEncontrado() {
  return (
    <div className="grid min-h-screen place-items-center bg-marino-50 p-4">
      <div className="max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo alto={28} />
        </div>
        <p className="text-5xl">🔍</p>
        <h1 className="mt-4 text-lg font-semibold text-marino-800">
          Esa pantalla todavía no existe
        </h1>
        <p className="mt-2 text-sm text-marino-400">
          Puede que el módulo no esté construido aún, o que la dirección esté mal escrita.
        </p>
        <Link
          href="/tablero"
          className="mt-6 inline-block rounded-lg bg-naranja-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-naranja-600"
        >
          Volver al tablero
        </Link>
      </div>
    </div>
  );
}
