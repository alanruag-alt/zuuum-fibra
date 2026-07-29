'use client';

import { Boton } from '@/componentes/ui/Boton';

/**
 * Imprimir usa el diálogo del navegador, que también sabe "Guardar como PDF".
 * Con eso se cubre imprimir en la oficina, mandar por WhatsApp y archivar,
 * sin una librería de PDF más que mantener.
 */
export function Imprimir() {
  return (
    <div className="flex gap-2">
      <Boton onClick={() => window.print()}>Imprimir o guardar PDF</Boton>
      <Boton variante="secundario" onClick={() => window.history.back()}>
        Volver
      </Boton>
    </div>
  );
}
