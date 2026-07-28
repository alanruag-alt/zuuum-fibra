'use client';

import { useState, type ReactNode } from 'react';
import { MenuLateral } from '@/componentes/layout/MenuLateral';
import { BarraSuperior } from '@/componentes/layout/BarraSuperior';

interface Props {
  nombre: string;
  rol: string;
  children: ReactNode;
}

export function CarcasaPanel({ nombre, rol, children }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="min-h-screen bg-marino-50">
      <MenuLateral abierto={menuAbierto} alCerrar={() => setMenuAbierto(false)} />
      <div className="lg:pl-64">
        <BarraSuperior nombre={nombre} rol={rol} alAbrirMenu={() => setMenuAbierto(true)} />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
