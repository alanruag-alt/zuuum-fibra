'use client';

import { useActionState, useEffect, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { eliminarArticulo } from '@/modulos/almacen/acciones';
import { borrarTrazo, eliminarCable, eliminarEquipo } from '@/modulos/ftth/acciones';
import { eliminarPlano, eliminarPoste } from '@/modulos/posteria/acciones';
import { eliminarDispositivo, eliminarElemento, eliminarSitio } from '@/modulos/red/acciones';
import type { Respuesta } from '@/modulos/admin/acciones';

const ACCIONES = {
  sitio: eliminarSitio,
  dispositivo: eliminarDispositivo,
  elemento: eliminarElemento,
  articulo: eliminarArticulo,
  cable: eliminarCable,
  trazo: borrarTrazo,
  equipo: eliminarEquipo,
  plano: eliminarPlano,
  poste: eliminarPoste,
} as const;

interface Props {
  tipo: keyof typeof ACCIONES;
  id: string;
  /** Cómo se llama la cosa. Se enseña en la pregunta, para no borrar a ciegas. */
  nombre: string;
  /** Cómo se llama el botón, cuando «borrar» no es la palabra exacta. */
  texto?: string;
  /**
   * Qué hacer cuando ya se borró.
   *
   * Lo usa el mapa: además de refrescar, cierra la ficha de lo que acaba de
   * desaparecer. Sin esto quedaba abierta enseñando algo que ya no existe.
   */
  alTerminar?: () => void;
}

/**
 * Borrar, con una pregunta en medio.
 *
 * El botón no borra: abre la pregunta. Y la pregunta dice el nombre de lo que
 * se va a borrar, porque en una lista larga es facilísimo darle al renglón de
 * junto. Es un clic de más que evita una llamada al día siguiente.
 *
 * Si la base se niega —porque hay clientes colgados, existencia o historia—
 * su mensaje se enseña tal cual: ya viene explicando qué hacer primero.
 */
export function Borrar({ tipo, id, nombre, texto = 'borrar', alTerminar }: Props) {
  const [preguntando, setPreguntando] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    ACCIONES[tipo],
    null,
  );

  useEffect(() => {
    if (estado?.ok) alTerminar?.();
    // Solo cuando cambia el resultado: si dependiera también de alTerminar,
    // una función distinta en cada render lo dispararía sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado?.ok]);

  if (estado?.ok) {
    return <span className="text-xs text-marino-400">{estado.mensaje}</span>;
  }

  if (!preguntando) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setPreguntando(true)}
          className="rounded-lg px-2 py-1 text-xs text-marino-400 transition-colors hover:bg-red-50 hover:text-falla"
        >
          {texto}
        </button>
        {estado && !estado.ok && (
          <p className="mt-1 max-w-md rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">
            {estado.mensaje}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-2">
      <p className="mb-2 text-xs text-marino-700">
        ¿{texto === 'borrar' ? 'Borrar' : texto} <strong>{nombre}</strong>?
      </p>
      <form action={accion} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={id} />
        <Boton type="submit" variante="oscuro" cargando={enviando} className="px-3 py-1.5 text-xs">
          Sí, borrar
        </Boton>
        <Boton
          type="button"
          variante="secundario"
          onClick={() => setPreguntando(false)}
          className="px-3 py-1.5 text-xs"
        >
          No
        </Boton>
      </form>
      {estado && !estado.ok && (
        <p className="mt-2 max-w-md rounded-lg bg-white px-3 py-2 text-xs text-falla">
          {estado.mensaje}
        </p>
      )}
    </div>
  );
}
