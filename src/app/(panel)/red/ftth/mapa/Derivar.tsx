'use client';

import { useEffect, useState, useTransition } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { hilosDeCable, insertarCajaEnCable } from '@/modulos/mapa/acciones';
import type { HiloDeCable } from '@/modulos/mapa/acciones';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

export interface Derivacion {
  cableId: string;
  cable: string;
  lat: number;
  lon: number;
}

type Que = null | 'caja' | 'napcaja' | 'nada';

/**
 * Qué se coloca donde arranca la ruta.
 *
 * Esta pregunta es el corazón del asunto. Cuando alguien empieza a trazar
 * encima de la línea de un cable, en la calle ahí va un nodo: una caja donde
 * se abre la fibra y se derivan los hilos. Un ramal que sale de la nada no
 * existe, y dejar que se dibuje así es lo que después deja rutas sin origen.
 *
 * La lista de hilos con su ocupación va enfrente a propósito: es la única
 * forma de no volver a usar un hilo que ya está dando servicio.
 */
export function Derivar({
  de,
  onListo,
  onCancelar,
}: {
  de: Derivacion;
  onListo: (caja: string | null, mensaje: string) => void;
  onCancelar: () => void;
}) {
  const [que, setQue] = useState<Que>(null);
  const [hilos, setHilos] = useState<HiloDeCable[]>([]);
  const [cortar, setCortar] = useState<Set<string>>(new Set());
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [puertos, setPuertos] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  useEffect(() => {
    if (que !== 'caja' && que !== 'napcaja') return;
    let vivo = true;
    hilosDeCable(de.cableId).then((h) => vivo && setHilos(h));
    return () => {
      vivo = false;
    };
  }, [que, de.cableId]);

  const libres = hilos.filter((h) => !h.ocupado).length;

  function alternar(id: string) {
    setCortar((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (que === null) {
    return (
      <div className="mb-3 rounded-lg border border-naranja-300 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-marino-800">
          La ruta arranca sobre <span className="font-mono">{de.cable}</span>
        </p>
        <p className="mt-1 text-xs text-marino-500">
          Marcaste el inicio encima de la trayectoria de {de.cable} ({de.lat.toFixed(6)},{' '}
          {de.lon.toFixed(6)}). En campo, ahí va el nodo donde se abre la fibra. ¿Qué colocamos en
          ese punto?
        </p>

        <div className="mt-3 space-y-2">
          <Opcion
            icono="📦"
            titulo="Caja de empalme"
            sub={`Corta los hilos que elijas de ${de.cable} y los deriva al cable nuevo.`}
            onClick={() => setQue('caja')}
          />
          <Opcion
            icono="📦📡"
            titulo="NAP + caja de empalme"
            sub="Nodo híbrido: reparte a clientes y además deja empalmar hilos hacia el cable nuevo."
            onClick={() => setQue('napcaja')}
          />
          <Opcion
            icono="✏️"
            titulo="Solo empezar la ruta aquí"
            sub={`Sin colocar nada; el punto queda pegado a la línea de ${de.cable}.`}
            onClick={() => onListo(null, `La ruta arranca sobre ${de.cable}. Sigue marcando.`)}
          />
        </div>

        <Boton variante="texto" onClick={onCancelar} className="mt-2 px-2 py-1 text-xs">
          cancelar
        </Boton>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-naranja-300 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-marino-800">
        {que === 'napcaja' ? 'NAP + caja de empalme' : 'Caja de empalme'} sobre {de.cable}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Código</span>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder={que === 'napcaja' ? 'NAP-CUE-012' : 'CE-CUE-005'}
            className={`${CAMPO} font-mono`}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Nombre o referencia</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Esquina de la primaria"
            className={CAMPO}
          />
        </label>
        {que === 'napcaja' && (
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Puertos</span>
            <select
              value={puertos}
              onChange={(e) => setPuertos(Number(e.target.value))}
              className={CAMPO}
            >
              {[4, 8, 16, 32].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <p className="mt-3 text-xs font-medium text-marino-600">
        Hilos que se CORTAN y se derivan en esta caja
        <span className="ml-1 font-normal text-marino-400">
          — aguas abajo dejan de venir del ODF · {libres} libres de {hilos.length}
        </span>
      </p>
      <div className="mt-1 flex gap-2">
        <Boton
          variante="secundario"
          className="px-2 py-1 text-xs"
          onClick={() => setCortar(new Set(hilos.filter((h) => !h.ocupado).map((h) => h.id)))}
        >
          Todos los libres
        </Boton>
        <Boton
          variante="secundario"
          className="px-2 py-1 text-xs"
          onClick={() => setCortar(new Set())}
        >
          Ninguno
        </Boton>
      </div>

      <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-marino-100 p-2">
        {hilos.length === 0 ? (
          <p className="p-2 text-xs text-marino-400">Cargando los hilos…</p>
        ) : (
          hilos.map((h) => (
            <label
              key={h.id}
              className={`flex items-center gap-2 px-1 py-1 text-xs ${
                h.ocupado ? 'opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={cortar.has(h.id)}
                disabled={!!h.ocupado}
                onChange={() => alternar(h.id)}
              />
              <span className="font-medium text-marino-700">
                {h.numero} · {h.color}
              </span>
              <span className="text-marino-400">{h.estado}</span>
              {h.ocupado && <span className="text-aviso">ocupado: {h.ocupado}</span>}
              {h.cortado && <span className="text-marino-400">✂️ ya cortado en {h.cortado}</span>}
            </label>
          ))
        )}
      </div>

      <p className="mt-2 rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
        Los que no marques siguen de largo. Es lo normal: en un cable de 24 se derivan dos y pasan
        veintidós.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Boton
          cargando={guardando}
          disabled={codigo.trim().length < 2}
          onClick={() =>
            empezar(async () => {
              const r = await insertarCajaEnCable(
                de.cableId,
                de.lat,
                de.lon,
                codigo.trim(),
                nombre.trim() || null,
                [...cortar],
                que === 'napcaja',
                puertos,
              );
              if (!r.ok) {
                setError(r.mensaje);
                return;
              }
              onListo(r.caja ?? null, `${r.mensaje} Sigue marcando la ruta.`);
            })
          }
        >
          Colocar y seguir la ruta
        </Boton>
        <Boton variante="secundario" onClick={() => setQue(null)}>
          Atrás
        </Boton>
      </div>
    </div>
  );
}

function Opcion({
  icono,
  titulo,
  sub,
  onClick,
}: {
  icono: string;
  titulo: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg border border-marino-200 px-3 py-2.5 text-left transition-colors hover:border-naranja-400 hover:bg-naranja-50/40"
    >
      <span className="text-sm font-medium text-marino-800">
        {icono} {titulo}
      </span>
      <span className="mt-0.5 block text-xs text-marino-500">{sub}</span>
    </button>
  );
}
