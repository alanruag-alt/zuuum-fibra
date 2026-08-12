'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { guardarSplitter } from '@/modulos/ftth/acciones_splitter';
import { RAZONES, TIPO_CAJA } from '@/modulos/ftth/splitter_tipos';
import type { Splitter } from '@/modulos/ftth/splitter_tipos';
import type { Respuesta } from '@/modulos/admin/acciones';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

function Aviso({ estado }: { estado: Respuesta | null }) {
  if (!estado) return null;
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${
        estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
      }`}
    >
      {estado.mensaje}
    </p>
  );
}

interface Caja {
  id: string;
  code: string;
  tipo: string;
  zona: string | null;
}

/**
 * Alta y edición de splitter.
 *
 * Solo captura lo que no se puede jalar: código, razón (de ahí salen las
 * salidas), pérdida y notas. Alimentar la entrada y conectar cada salida se
 * hace arrastrando en el dibujo de la caja, no aquí.
 *
 * Cuando se pone desde adentro de una caja (cajaFija), no se pregunta dónde va:
 * ya se sabe. El usuario está parado en esa caja; volver a elegirla solo invita
 * a equivocarse de renglón.
 */
export function EditarSplitter({
  cajas,
  splitter,
  cajaFija,
}: {
  cajas: Caja[];
  splitter?: Splitter;
  cajaFija?: { id: string; code: string; tipo: string };
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarSplitter,
    null,
  );

  if (!abierto) {
    return splitter ? (
      <Boton
        variante="texto"
        onClick={() => setAbierto(true)}
        className="px-1.5 py-0.5 text-[10px]"
      >
        editar
      </Boton>
    ) : (
      <Boton onClick={() => setAbierto(true)}>Poner un splitter</Boton>
    );
  }

  return (
    <Tarjeta titulo={splitter ? `Editar ${splitter.code}` : 'Splitter nuevo'} className="w-full">
      <Aviso estado={estado} />
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          {splitter && <input type="hidden" name="id" value={splitter.id} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cajaFija ? (
              <div className="block sm:col-span-2">
                <span className="text-sm font-medium text-marino-600">Va montado en</span>
                <input type="hidden" name="caja" value={cajaFija.id} />
                <p className="mt-1 rounded-lg border border-marino-100 bg-marino-50 px-3 py-2 text-sm text-marino-700">
                  <span className="font-mono">{cajaFija.code}</span>
                  <span className="text-marino-400">
                    {' '}
                    — {TIPO_CAJA[cajaFija.tipo] ?? cajaFija.tipo}
                  </span>
                </p>
              </div>
            ) : (
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-marino-600">
                  ¿En qué caja va montado?
                </span>
                <select
                  name="caja"
                  required
                  defaultValue={splitter?.housing_id ?? ''}
                  className={CAMPO}
                  autoFocus
                >
                  <option value="">Elige la caja primero</option>
                  {cajas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {TIPO_CAJA[c.tipo] ?? c.tipo}
                      {c.zona ? ` · ${c.zona}` : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-marino-400">
                  Una caja de empalme, una NAP, o el ODF si es de rack.
                </span>
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Código</span>
              <input
                name="codigo"
                required
                defaultValue={splitter?.code}
                placeholder="SPL-CE005-01"
                className={`${CAMPO} font-mono`}
                autoFocus={!!cajaFija && !splitter}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Razón</span>
              <select name="razon" defaultValue={splitter?.ratio ?? '1x8'} className={CAMPO}>
                {RAZONES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-marino-400">
                Las salidas se crean solas: un 1x8 nace con ocho.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Pérdida (dB)</span>
              <input
                name="perdida"
                type="number"
                step="0.01"
                min="0"
                defaultValue={splitter?.loss_db ?? ''}
                placeholder="10.5"
                className={CAMPO}
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-sm font-medium text-marino-600">Notas</span>
              <input name="notas" defaultValue={splitter?.notes ?? ''} className={CAMPO} />
            </label>
          </div>

          <div className="flex gap-2">
            <Boton type="submit" cargando={enviando}>
              Guardar
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
      {estado?.ok && (
        <Boton variante="secundario" onClick={() => setAbierto(false)} className="mt-3">
          Cerrar
        </Boton>
      )}
    </Tarjeta>
  );
}
