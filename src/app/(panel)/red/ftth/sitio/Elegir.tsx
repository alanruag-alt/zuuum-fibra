'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { guardarSitio } from '@/modulos/red/acciones';
import type { Respuesta } from '@/modulos/admin/acciones';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

export interface OpcionSitio {
  id: string;
  name: string;
  zona: string | null;
  racks: number;
  olts: number;
  odfs: number;
}

/**
 * Elegir la comunidad.
 *
 * La selección va en la dirección (`?sitio=…`) y no en la memoria de la
 * pantalla, a propósito: así se puede mandar el enlace de una caseta por
 * WhatsApp y quien lo abra ve exactamente lo mismo. Guardarlo en la memoria
 * del navegador haría que ese enlace abriera cualquier otra cosa.
 */
export function Elegir({
  sitios,
  elegido,
  zonas,
}: {
  sitios: OpcionSitio[];
  elegido: string | null;
  zonas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState(false);

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <label className="block">
        <span className="text-xs font-medium text-marino-600">Comunidad</span>
        <select
          value={elegido ?? ''}
          onChange={(e) => router.push(`/red/ftth/sitio?sitio=${e.target.value}`)}
          className={`${CAMPO} min-w-72`}
        >
          {sitios.length === 0 && <option value="">— todavía no hay ninguna —</option>}
          {sitios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.zona ? ` · ${s.zona}` : ''} — {s.racks} rack{s.racks === 1 ? '' : 's'}, {s.olts}{' '}
              OLT, {s.odfs} ODF
            </option>
          ))}
        </select>
      </label>

      <Boton variante="secundario" onClick={() => setNuevo(true)}>
        Nueva comunidad
      </Boton>

      {nuevo && (
        <NuevoSitio
          zonas={zonas}
          onCerrar={() => setNuevo(false)}
          onListo={(id) => {
            setNuevo(false);
            router.push(`/red/ftth/sitio${id ? `?sitio=${id}` : ''}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NuevoSitio({
  zonas,
  onCerrar,
  onListo,
}: {
  zonas: { id: string; name: string }[];
  onCerrar: () => void;
  onListo: (id: string | null) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [zona, setZona] = useState(zonas[0]?.id ?? '');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-marino-800/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-lg">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-marino-800">Una comunidad nueva</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-marino-400 hover:text-marino-700"
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-marino-400">
          Es la caseta del pueblo: donde va el gabinete con la OLT y el ODF. Adentro se le cuelga
          todo lo demás.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Caseta Cuencamé"
              className={CAMPO}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Zona</span>
            <select value={zona} onChange={(e) => setZona(e.target.value)} className={CAMPO}>
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Latitud</span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder="24.870000"
              className={`${CAMPO} font-mono`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Longitud</span>
            <input
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              inputMode="decimal"
              placeholder="-103.700000"
              className={`${CAMPO} font-mono`}
            />
          </label>
        </div>

        <p className="mt-2 rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
          Las coordenadas no son obligatorias, pero sin ellas la caseta no sale en el mapa, y el ODF
          que le cuelgues tampoco.
        </p>

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

        <div className="mt-3 flex gap-2">
          <Boton
            cargando={guardando}
            disabled={nombre.trim().length < 2}
            onClick={() =>
              empezar(async () => {
                const datos = new FormData();
                datos.set('nombre', nombre.trim());
                datos.set('tipo', 'olt_site');
                datos.set('zona', zona);
                if (lat.trim()) datos.set('lat', lat.trim());
                if (lon.trim()) datos.set('lon', lon.trim());
                const r = (await guardarSitio(null, datos)) as Respuesta & { id?: string };
                if (!r.ok) setError(r.mensaje);
                else onListo(r.id ?? null);
              })
            }
          >
            Dar de alta la comunidad
          </Boton>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
        </div>
      </div>
    </div>
  );
}
