'use client';

import { useState, useTransition } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { cerrarRuta } from '@/modulos/mapa/acciones';
import type { Cable } from '@/modulos/ftth/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

/**
 * Terminar la ruta.
 *
 * Una sola pregunta: ¿cable nuevo, o la trayectoria de uno que ya existe?
 *
 * Se pregunta AL FINAL y no al principio porque así es como se trabaja: uno
 * primero recorre y marca, y hasta que llega al otro extremo sabe qué acaba de
 * dibujar. Obligar a elegir el cable antes de empezar es lo que hacía que la
 * gente agarrara el que ya estaba seleccionado y le encimara el trazo.
 */
export function Terminar({
  ruta,
  cables,
  zona,
  deriva,
  onListo,
  onCancelar,
}: {
  ruta: [number, number][];
  cables: Cable[];
  zona: string;
  deriva: string | null;
  onListo: (r: { ok: boolean; mensaje: string }) => void;
  onCancelar: () => void;
}) {
  const [cable, setCable] = useState('');
  const [codigo, setCodigo] = useState('');
  const [hilos, setHilos] = useState(12);
  const [tipo, setTipo] = useState('adss');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const elegido = cables.find((c) => c.id === cable);
  const metros = Math.round(
    ruta.reduce((s, p, i) => {
      if (i === 0) return 0;
      const [a, b] = [ruta[i - 1], p];
      const R = 6371000;
      const dLat = ((b[0] - a[0]) * Math.PI) / 180;
      const dLon = ((b[1] - a[1]) * Math.PI) / 180;
      const q =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((a[0] * Math.PI) / 180) *
          Math.cos((b[0] * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      return s + 2 * R * Math.asin(Math.sqrt(q));
    }, 0),
  );

  return (
    <div className="mb-3 rounded-lg border border-naranja-300 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-marino-800">
        Guardar la ruta · {ruta.length} puntos · {metros} m
      </p>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-marino-600">¿A qué cable pertenece?</span>
        <select
          value={cable}
          onChange={(e) => {
            setCable(e.target.value);
            setError(null);
          }}
          className={CAMPO}
        >
          <option value="">— crear un cable nuevo —</option>
          {cables.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} ({c.fiber_count} hilos)
              {c.puntos_trazo >= 2
                ? ` · ya trazado, ${Math.round(Number(c.length_m ?? 0))} m`
                : ' · sin trazo'}
            </option>
          ))}
        </select>
      </label>

      {elegido ? (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            elegido.puntos_trazo >= 2 ? 'bg-amber-50 text-aviso' : 'bg-marino-50 text-marino-600'
          }`}
        >
          <p>
            Se usan el código y los hilos que ya tiene <strong>{elegido.code}</strong> (
            {elegido.fiber_count} hilos); solo se actualiza su trayectoria.
          </p>
          {elegido.puntos_trazo >= 2 && (
            <p className="mt-1">
              <strong>Ojo:</strong> ya tiene {elegido.puntos_trazo} puntos y{' '}
              {Math.round(Number(elegido.length_m ?? 0))} m dibujados. Se van a reemplazar por estos{' '}
              {metros} m, y no hay cómo deshacerlo. Si lo que quieres es otro cable que sale de la
              misma caja, mejor deja «crear un cable nuevo».
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Código del cable</span>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="DI-CUE-02"
              className={`${CAMPO} font-mono`}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Nº de hilos</span>
            <select
              value={hilos}
              onChange={(e) => setHilos(Number(e.target.value))}
              className={CAMPO}
            >
              {[6, 12, 24, 48, 96, 144].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO}>
              <option value="adss">ADSS</option>
              <option value="armado">Armado</option>
              <option value="canalizado">Canalizado</option>
              <option value="drop">Drop</option>
              <option value="otro">Otro</option>
            </select>
          </label>
        </div>
      )}

      <p className="mt-3 text-xs text-marino-400">
        Al guardarlo, el cable queda enganchado a las cajas que le quedan en los extremos, para que
        puedas abrirlas y empalmar adentro.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Boton
          cargando={guardando}
          disabled={!cable && codigo.trim().length < 2}
          onClick={() =>
            empezar(async () => {
              const r = await cerrarRuta(ruta, {
                cable: cable || null,
                codigo: codigo.trim(),
                hilos,
                tipo,
                zona,
                deriva,
              });
              if (!r.ok) {
                setError(r.mensaje);
                return;
              }
              onListo(r);
            })
          }
        >
          Guardar la ruta
        </Boton>
        <Boton variante="secundario" onClick={onCancelar}>
          Seguir marcando
        </Boton>
      </div>
    </div>
  );
}
