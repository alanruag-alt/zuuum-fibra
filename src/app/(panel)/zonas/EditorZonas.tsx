'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { guardarZona, type Respuesta } from '@/modulos/admin/acciones';
import type { ZonaDetalle } from '@/modulos/admin/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

export function EditorZonas({ zonas }: { zonas: ZonaDetalle[] }) {
  const [editando, setEditando] = useState<ZonaDetalle | null>(null);
  const [nueva, setNueva] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(guardarZona, null);

  const z = editando;

  if (!nueva && !z) {
    return (
      <Tarjeta titulo="Editar zonas">
        {estado && (
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
            }`}
          >
            {estado.mensaje}
          </p>
        )}
        <div className="mb-4 flex flex-wrap gap-2">
          {zonas.map((zz) => (
            <button
              key={zz.id}
              onClick={() => setEditando(zz)}
              className="rounded-lg border border-marino-200 px-3 py-1.5 text-sm text-marino-600 hover:bg-marino-50"
            >
              {zz.name}
            </button>
          ))}
        </div>
        <Boton onClick={() => setNueva(true)}>Agregar una zona</Boton>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo={z ? `Editar ${z.name}` : 'Nueva zona'}>
      <form action={accion} className="space-y-4">
        {z && <input type="hidden" name="id" value={z.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Nombre</span>
            <input
              name="nombre"
              required
              defaultValue={z?.name ?? ''}
              className={CAMPO}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Código corto</span>
            <input
              name="codigo"
              required={!z}
              disabled={Boolean(z)}
              defaultValue={z?.code ?? ''}
              maxLength={6}
              placeholder="CUE"
              className={`${CAMPO} font-mono uppercase disabled:bg-marino-50 disabled:text-marino-400`}
            />
            <span className="mt-1 block text-xs text-marino-400">
              {z
                ? 'No se puede cambiar: ya está impreso en folios que existen.'
                : 'Va en todos los folios de esta zona: OI-CUE-0001, RC-CUE-0001.'}
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Estado</span>
            <select
              name="activa"
              defaultValue={z ? (z.is_active ? 'si' : 'no') : 'si'}
              className={CAMPO}
            >
              <option value="si">Activa</option>
              <option value="no">Inactiva</option>
            </select>
          </label>
        </div>

        {z && z.clientes > 0 && !z.is_active && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-aviso">
            Esta zona tiene {z.clientes} clientes. Desactivarla no los borra ni los da de baja; solo
            la quita de las listas para dar de alta cosas nuevas.
          </p>
        )}

        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Guardar
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            onClick={() => {
              setEditando(null);
              setNueva(false);
            }}
            disabled={enviando}
          >
            Cancelar
          </Boton>
        </div>
      </form>

      {estado && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </Tarjeta>
  );
}
