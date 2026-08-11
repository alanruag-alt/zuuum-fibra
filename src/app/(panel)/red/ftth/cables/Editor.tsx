'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { guardarCable, guardarHilo } from '@/modulos/ftth/acciones';
import { COLOR_HILO, ESTADO_HILO, TIPO_CABLE, etiqueta } from '@/modulos/ftth/etiquetas';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Cable, Hilo } from '@/modulos/ftth/tipos';
import type { Zona } from '@/modulos/clientes/tipos';

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

/** El puntito del color, que es como se identifica un hilo en la caja. */
export function Punto({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-full border border-marino-200 align-middle"
      style={{ background: COLOR_HILO[color] ?? '#ccc' }}
      title={color}
      aria-hidden="true"
    />
  );
}

export function EditarCable({ zonas, cable }: { zonas: Zona[]; cable?: Cable }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(guardarCable, null);

  if (!abierto) {
    return cable ? (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        editar
      </Boton>
    ) : (
      <Boton onClick={() => setAbierto(true)}>Dar de alta un cable</Boton>
    );
  }

  return (
    <Tarjeta titulo={cable ? `Editar ${cable.code}` : 'Cable nuevo'} className="w-full">
      <Aviso estado={estado} />
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          {cable && <input type="hidden" name="id" value={cable.id} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Código</span>
              <input
                name="codigo"
                required
                defaultValue={cable?.code}
                placeholder="TR-CUE-01"
                className={`${CAMPO} font-mono`}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Tipo</span>
              <select name="tipo" defaultValue={cable?.cable_type ?? 'adss'} className={CAMPO}>
                {Object.entries(TIPO_CABLE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Cuántos hilos</span>
              <input
                name="hilos"
                type="number"
                min="1"
                max="288"
                required
                defaultValue={cable?.fiber_count}
                className={CAMPO}
              />
              <span className="mt-1 block text-xs text-marino-400">
                Los hilos se crean solos, con su color y su tubo según la norma.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Zona</span>
              <select name="zona" defaultValue={cable?.zone_id ?? ''} className={CAMPO}>
                <option value="">—</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Sale de</span>
              <input
                name="de_texto"
                defaultValue={cable?.de ?? ''}
                placeholder="Caseta de la OLT"
                className={CAMPO}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Llega a</span>
              <input
                name="a_texto"
                defaultValue={cable?.a ?? ''}
                placeholder="Esquina de la primaria"
                className={CAMPO}
              />
              <span className="mt-1 block text-xs text-marino-400">
                Como se dice en campo. Vale más que una dirección.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Metros</span>
              <input
                name="metros"
                type="number"
                step="0.01"
                min="0"
                defaultValue={cable?.length_m ?? ''}
                className={CAMPO}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Notas</span>
              <input name="notas" defaultValue={cable?.notes ?? ''} className={CAMPO} />
            </label>
          </div>

          {cable && (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="activo" value="no" defaultChecked={!cable.is_active} />
              <span className="text-sm text-marino-600">Ya no está en servicio</span>
            </label>
          )}

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

/**
 * Los hilos de un cable.
 *
 * Se dibujan en cuadrícula y por tubo, que es como se ven al abrir el cable:
 * doce colores, y luego los mismos doce en el siguiente tubo.
 */
export function Hilos({ hilos }: { hilos: Hilo[] }) {
  const [abierto, setAbierto] = useState(false);
  const [tocando, setTocando] = useState<Hilo | null>(null);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(guardarHilo, null);

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        ver los {hilos.length} hilos
      </Boton>
    );
  }

  const tubos = [...new Set(hilos.map((h) => h.tube_number))].sort((a, b) => a - b);

  return (
    <div className="mt-3 w-full rounded-lg border border-marino-100 bg-marino-50/40 p-3">
      {tubos.map((t) => (
        <div key={t} className="mb-3 last:mb-0">
          {tubos.length > 1 && (
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-marino-400">
              Tubo {t}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {hilos
              .filter((h) => h.tube_number === t)
              .map((h) => {
                const e = etiqueta(ESTADO_HILO, h.status);
                const tono =
                  e.tono === 'ok'
                    ? 'border-green-200 bg-green-50'
                    : e.tono === 'falla'
                      ? 'border-red-200 bg-red-50'
                      : e.tono === 'aviso'
                        ? 'border-amber-200 bg-amber-50'
                        : e.tono === 'marca'
                          ? 'border-naranja-200 bg-naranja-50'
                          : 'border-marino-200 bg-white';
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setTocando(h)}
                    title={`${h.color} · ${e.texto}${h.fusiones ? ` · ${h.fusiones} fusión(es)` : ''}`}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:border-naranja-400 ${tono}`}
                  >
                    <Punto color={h.color} />
                    <span className="font-medium text-marino-700">{h.strand_number}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {tocando && (
        <div className="mt-3 rounded-lg border border-naranja-200 bg-white p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-marino-800">
            <Punto color={tocando.color} />
            Hilo {tocando.strand_number} · {tocando.color}
            {tocando.tube_number > 1 && ` · tubo ${tocando.tube_number}`}
            {tocando.fusiones > 0 && (
              <span className="text-xs font-normal text-marino-400">
                {tocando.fusiones} {tocando.fusiones === 1 ? 'fusión' : 'fusiones'}
              </span>
            )}
          </p>
          <form action={accion} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={tocando.id} />
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Cómo está</span>
              <select name="estado" defaultValue={tocando.status} className={`${CAMPO} w-44`}>
                {Object.entries(ESTADO_HILO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.texto}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1 min-w-[180px]">
              <span className="text-xs font-medium text-marino-600">Nota</span>
              <input name="notas" defaultValue={tocando.notes ?? ''} className={CAMPO} />
            </label>
            <Boton type="submit" cargando={enviando} className="px-3 py-2 text-xs">
              Guardar
            </Boton>
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setTocando(null)}
              className="px-3 py-2 text-xs"
            >
              Cerrar
            </Boton>
          </form>
          <Aviso estado={estado} />
        </div>
      )}

      <Boton
        variante="secundario"
        onClick={() => {
          setAbierto(false);
          setTocando(null);
        }}
        className="mt-3 px-3 py-1.5 text-xs"
      >
        Ocultar los hilos
      </Boton>
    </div>
  );
}
