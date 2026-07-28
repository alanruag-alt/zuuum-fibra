'use client';

import { useEffect } from 'react';

export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-marino-50 p-4">
      <div className="max-w-md text-center">
        <p className="text-5xl">⚠</p>
        <h1 className="mt-4 text-lg font-semibold text-marino-800">Algo se rompió</h1>
        <p className="mt-2 text-sm text-marino-400">
          Ya quedó registrado. Puedes intentar de nuevo; si sigue fallando, avisa al administrador.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-naranja-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-naranja-600"
        >
          Intentar otra vez
        </button>
      </div>
    </div>
  );
}
