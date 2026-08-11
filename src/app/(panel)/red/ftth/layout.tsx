import { type ReactNode } from 'react';
import { Pestanas } from '@/componentes/ui/Pestanas';

const SECCIONES = [
  { ruta: '/red/ftth', etiqueta: 'Elementos', exacta: true },
  { ruta: '/red/ftth/cables', etiqueta: 'Cables e hilos' },
  { ruta: '/red/ftth/fusiones', etiqueta: 'Fusiones' },
  { ruta: '/red/ftth/naps', etiqueta: 'NAP y puertos' },
  { ruta: '/red/ftth/mapa', etiqueta: 'Mapa' },
  { ruta: '/red/ftth/traza', etiqueta: 'Trazabilidad' },
  { ruta: '/red/ftth/impacto', etiqueta: 'Impacto de corte' },
];

export default function LayoutFTTH({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Red FTTH</h1>
        <p className="mt-1 text-sm text-marino-400">
          La fibra hilo por hilo: por dónde va, con qué se fusiona y a quién alimenta.
        </p>
      </div>
      <Pestanas secciones={SECCIONES} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
