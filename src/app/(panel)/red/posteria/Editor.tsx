'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { eliminarPoste, guardarPoste, importarKmz, renumerar } from '@/modulos/posteria/acciones';
import { TIPO_POSTE } from '@/modulos/posteria/tipos';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Poste } from '@/modulos/posteria/tipos';
import type { Cable } from '@/modulos/ftth/tipos';
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

export function Renumerar({ cables }: { cables: Cable[] }) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(renumerar, null);

  return (
    <div>
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs font-medium text-marino-600">De qué cable</span>
          <select name="cable" className={`${CAMPO} w-48`}>
            <option value="">Todos</option>
            {cables.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2.5">
          <input type="checkbox" name="respetar" value="si" />
          <span className="text-xs text-marino-600">
            Conservar los números que ya traen
            <span className="block text-[11px] text-marino-400">
              Marca esto si vienen de un KMZ.
            </span>
          </span>
        </label>
        <Boton type="submit" cargando={enviando}>
          Renumerar y calcular vanos
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

export function ImportarKmz({ zonas }: { zonas: Zona[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(importarKmz, null);

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Importar un KMZ
      </Boton>
    );
  }

  return (
    <Tarjeta titulo="Importar KMZ o KML" className="w-full">
      <Aviso estado={estado} />
      <form action={accion} className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-marino-600">Archivo</span>
            <input
              type="file"
              name="archivo"
              accept=".kmz,.kml"
              required
              className="mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-700 file:mr-3 file:rounded-md file:border-0 file:bg-marino-100 file:px-3 file:py-1.5 file:text-sm file:text-marino-700"
            />
            <span className="mt-1 block text-xs text-marino-400">
              El mismo que abres en Google Earth. Hasta 20 MB.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Zona</span>
            <select name="zona" className={CAMPO}>
              <option value="">—</option>
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-3">
            <span className="text-sm font-medium text-marino-600">Los puntos son…</span>
            <select name="puntos_como" defaultValue="poste" className={CAMPO}>
              <option value="poste">Postes</option>
              <option value="ninguno">No los importes, solo los trazos</option>
            </select>
          </label>
        </div>

        <p className="rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
          Los <strong>trazos</strong> (líneas) se vuelven el recorrido de un cable: si ya existe uno
          con ese nombre se le pone la ruta, y si no, se crea. Los <strong>puntos</strong> entran
          como postes con su nombre y la carpeta de donde vienen. Nada se borra: si te equivocas, se
          corrige después.
        </p>

        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Importar
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

export function EditarPoste({
  zonas,
  cables,
  poste,
}: {
  zonas: Zona[];
  cables: Cable[];
  poste?: Poste;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(guardarPoste, null);

  if (!abierto) {
    return poste ? (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        editar
      </Boton>
    ) : (
      <Boton onClick={() => setAbierto(true)}>Capturar un poste</Boton>
    );
  }

  return (
    <Tarjeta titulo={poste ? `Poste ${poste.number ?? ''}` : 'Poste nuevo'} className="w-full">
      <Aviso estado={estado} />
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          {poste && <input type="hidden" name="id" value={poste.id} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Latitud</span>
              <input
                name="lat"
                type="number"
                step="0.0000001"
                required
                defaultValue={poste?.latitude ?? ''}
                placeholder="24.8700000"
                className={CAMPO}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Longitud</span>
              <input
                name="lon"
                type="number"
                step="0.0000001"
                required
                defaultValue={poste?.longitude ?? ''}
                placeholder="-103.7000000"
                className={CAMPO}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">De quién es</span>
              <select
                name="tipo"
                defaultValue={poste?.pole_type ?? 'cfe_concreto'}
                className={CAMPO}
              >
                {Object.entries(TIPO_POSTE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Zona</span>
              <select name="zona" defaultValue={poste?.zone_id ?? ''} className={CAMPO}>
                <option value="">—</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Cable</span>
              <select name="cable" defaultValue={poste?.cable_id ?? ''} className={CAMPO}>
                <option value="">Que lo acomode solo</option>
                {cables.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Etiqueta</span>
              <input name="codigo" defaultValue={poste?.code ?? ''} className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Altura (m)</span>
              <input
                name="altura"
                type="number"
                step="0.1"
                defaultValue={poste?.height_m ?? ''}
                className={CAMPO}
              />
            </label>
            <label className="flex items-start gap-2 pt-6">
              <input type="checkbox" name="nuevo" value="si" defaultChecked={poste?.is_new} />
              <span className="text-sm text-marino-600">
                Hay que plantarlo
                <span className="block text-xs text-marino-400">CFE los cuenta aparte.</span>
              </span>
            </label>
            <label className="block sm:col-span-2 lg:col-span-4">
              <span className="text-sm font-medium text-marino-600">Notas</span>
              <input name="notas" defaultValue={poste?.notes ?? ''} className={CAMPO} />
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

export function BorrarPoste({ poste }: { poste: Poste }) {
  const [preguntando, setPreguntando] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    eliminarPoste,
    null,
  );

  if (estado?.ok) return <span className="text-xs text-marino-400">borrado</span>;

  if (!preguntando) {
    return (
      <button
        type="button"
        onClick={() => setPreguntando(true)}
        className="rounded-lg px-2 py-1 text-xs text-marino-400 hover:bg-red-50 hover:text-falla"
      >
        borrar
      </button>
    );
  }

  return (
    <form action={accion} className="flex gap-1">
      <input type="hidden" name="id" value={poste.id} />
      <Boton type="submit" variante="oscuro" cargando={enviando} className="px-2 py-1 text-xs">
        Sí
      </Boton>
      <Boton
        type="button"
        variante="secundario"
        onClick={() => setPreguntando(false)}
        className="px-2 py-1 text-xs"
      >
        No
      </Boton>
    </form>
  );
}
