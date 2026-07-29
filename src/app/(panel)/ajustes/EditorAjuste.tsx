'use client';

import { useActionState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { guardarAjuste, type Respuesta } from '@/modulos/admin/acciones';
import type { Ajuste } from '@/modulos/admin/tipos';

/**
 * Cada ajuste se guarda solo, con su propio botón.
 *
 * Un formulario único con "Guardar todo" se ve más limpio, pero cuando uno de
 * los valores no pasa la validación de la base, el resto queda a medias y nadie
 * sabe qué entró y qué no.
 */
export function EditorAjuste({ ajuste }: { ajuste: Ajuste }) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarAjuste,
    null,
  );

  const valor =
    typeof ajuste.value === 'string'
      ? ajuste.value
      : JSON.stringify(ajuste.value).replace(/^"|"$/g, '');

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-marino-800">{ajuste.name}</p>
          {ajuste.description && (
            <p className="mt-0.5 text-xs text-marino-400">{ajuste.description}</p>
          )}
          <p className="mt-0.5 font-mono text-[11px] text-marino-300">{ajuste.key}</p>
        </div>

        <form action={accion} className="flex shrink-0 items-center gap-2">
          <input type="hidden" name="key" value={ajuste.key} />
          {ajuste.value_type === 'boolean' ? (
            <select
              name="valor"
              defaultValue={String(ajuste.value)}
              className="rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none"
            >
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          ) : (
            <input
              name="valor"
              type={ajuste.value_type === 'number' ? 'number' : 'text'}
              step="any"
              defaultValue={valor}
              className="w-32 rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none"
            />
          )}
          <Boton type="submit" variante="secundario" cargando={enviando}>
            Guardar
          </Boton>
        </form>
      </div>

      {estado && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </li>
  );
}
