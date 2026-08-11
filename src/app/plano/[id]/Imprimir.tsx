'use client';

/**
 * El tamaño de la hoja tiene que ir en una regla @page, y esa regla no se
 * puede poner con clases: el navegador solo la lee de una hoja de estilo.
 */
export function Imprimir({ tamano }: { tamano: string }) {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `@page { size: ${tamano}; margin: 8mm; }
@media print {
  body { background: #fff; }
  .print\\:hidden { display: none !important; }
}`,
      }}
    />
  );
}
