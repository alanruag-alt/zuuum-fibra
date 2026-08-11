'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { ImportarKmz } from '@/app/(panel)/red/posteria/Editor';
import {
  type Corte,
  colocarElemento,
  colocarNapConCaja,
  colocarPoste,
  colocarSitio,
  diagnosticarCorte,
  guardarTrazo,
  guardarVistaZona,
  moverPunto,
} from '@/modulos/mapa/acciones';
import type { PuntoMapa, TrazoMapa } from '@/modulos/mapa/tipos';
import type { Cable } from '@/modulos/ftth/tipos';
import type { Zona } from '@/modulos/clientes/tipos';

/* ─────────────────────────────────────────────── proyección de mapa deslizante
 * La misma que usa cualquier mapa web: Mercator esférico en mosaicos de 256.
 * Son ocho líneas; traerse una librería entera por esto sería cargar un
 * camión para llevar una caja.
 */
const TAM = 256;

function proyectar(lat: number, lon: number, z: number) {
  const s = TAM * Math.pow(2, z);
  const x = ((lon + 180) / 360) * s;
  const sen = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sen) / (1 - sen)) / (4 * Math.PI)) * s;
  return { x, y };
}

function desproyectar(x: number, y: number, z: number) {
  const s = TAM * Math.pow(2, z);
  const lon = (x / s) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / s;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

function metros(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const COLOR_TRAZO = ['#f2820c', '#16a34a', '#2563eb', '#db2777', '#0ea5e9', '#7c3aed'];

type Modo = 'ver' | 'sitio' | 'nap' | 'caja' | 'napcaja' | 'odf' | 'poste' | 'ruta' | 'mover';

const MODOS: { id: Modo; texto: string; icono: string }[] = [
  { id: 'ver', texto: 'Navegar', icono: '🧭' },
  { id: 'sitio', texto: 'Colocar sitio', icono: '🏢' },
  { id: 'caja', texto: 'Colocar caja', icono: '📦' },
  { id: 'nap', texto: 'Colocar NAP', icono: '📡' },
  { id: 'napcaja', texto: 'NAP + caja', icono: '📦📡' },
  { id: 'odf', texto: 'Colocar ODF', icono: '🗄️' },
  { id: 'poste', texto: 'Colocar poste', icono: '📍' },
  { id: 'ruta', texto: 'Dibujar ruta', icono: '✏️' },
  { id: 'mover', texto: 'Mover punto', icono: '✋' },
];

/** Lo que dice cada modo, para no tener que adivinar qué hace. */
const AYUDA: Record<Modo, string> = {
  ver: 'Arrastra para moverte, rueda para acercar. Pasa el cursor por un punto para ver qué es.',
  sitio: 'Clic donde está la torre, el POP o la caseta de la OLT.',
  caja: 'Clic donde está la caja de empalme. Va sobre la línea del cable.',
  nap: 'Clic donde está la NAP. Va sobre la línea del cable.',
  napcaja:
    'Pone la NAP y su caja de empalme en el mismo punto, que es como van en la calle: la NAP colgada de la caja donde se hace el empalme.',
  odf: 'Clic donde está el distribuidor, normalmente dentro de la caseta.',
  poste: 'Clic en cada poste. También los puedes traer de golpe con «Importar postes».',
  ruta: 'Clic para ir marcando el recorrido del cable, poste por poste. Arrastra para moverte.',
  mover: 'Clic a lo que quieras mover y luego a su lugar correcto.',
};

interface Props {
  zonas: Zona[];
  zonaActual: string;
  vista: { lat: number; lon: number; zoom: number };
  puntos: PuntoMapa[];
  trazos: TrazoMapa[];
  cables: Cable[];
  puedeEditar: boolean;
}

export function Mapa({ zonas, zonaActual, vista, puntos, trazos, cables, puedeEditar }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [centro, setCentro] = useState({ lat: vista.lat, lon: vista.lon });
  const [zoom, setZoom] = useState(vista.zoom);
  const [tam, setTam] = useState({ w: 900, h: 560 });
  const [modo, setModo] = useState<Modo>('ver');
  const [dibujando, setDibujando] = useState<[number, number][]>([]);
  const [cableRuta, setCableRuta] = useState<string>('');
  // Cuánto se movió el ratón con el botón apretado. Es lo que distingue un
  // clic de un arrastre, y por eso se puede desplazar el mapa en cualquier
  // modo: dibujando una ruta larga uno TIENE que poder moverse.
  const gesto = useRef<{ movido: number } | null>(null);
  const [moviendo, setMoviendo] = useState<PuntoMapa | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [verPostes, setVerPostes] = useState(true);
  const [verNumeros, setVerNumeros] = useState(true);
  const [pegarAPostes, setPegarAPostes] = useState(true);
  const [corte, setCorte] = useState<Corte | null>(null);
  const [abrirCorte, setAbrirCorte] = useState(false);
  const [guardando, empezar] = useTransition();

  // El centro cambia cuando uno cambia de zona: cada localidad tiene el suyo.
  useEffect(() => {
    setCentro({ lat: vista.lat, lon: vista.lon });
    setZoom(vista.zoom);
    setDibujando([]);
  }, [vista.lat, vista.lon, vista.zoom]);

  useEffect(() => {
    const medir = () => {
      const c = caja.current;
      if (c)
        setTam({ w: c.clientWidth, h: Math.max(420, Math.min(700, window.innerHeight - 340)) });
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const cuantosPostes = puntos.filter((p) => p.clase === 'poste').length;
  const origen = proyectar(centro.lat, centro.lon, zoom);
  const izq = origen.x - tam.w / 2;
  const arriba = origen.y - tam.h / 2;

  const aPantalla = useCallback(
    (lat: number, lon: number) => {
      const p = proyectar(lat, lon, zoom);
      return { x: p.x - izq, y: p.y - arriba };
    },
    [zoom, izq, arriba],
  );

  const aCoordenada = useCallback(
    (x: number, y: number) => desproyectar(izq + x, arriba + y, zoom),
    [zoom, izq, arriba],
  );

  /* ── mosaicos ─────────────────────────────────────────────────────────────
   * Se calculan los que caben en la ventana y ya. El navegador se encarga de
   * pedirlos y de guardarlos en su caché; si no hay internet no se ven, pero
   * todo lo demás —los puntos, los trazos, las medidas— sigue funcionando
   * sobre la cuadrícula. El mapa nunca deja de servir.
   */
  const mosaicos: { k: string; url: string; x: number; y: number }[] = [];
  const n = Math.pow(2, zoom);
  const x0 = Math.floor(izq / TAM);
  const y0 = Math.floor(arriba / TAM);
  const x1 = Math.floor((izq + tam.w) / TAM);
  const y1 = Math.floor((arriba + tam.h) / TAM);
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      const xn = ((tx % n) + n) % n;
      mosaicos.push({
        k: `${zoom}/${xn}/${ty}`,
        url: `https://tile.openstreetmap.org/${zoom}/${xn}/${ty}.png`,
        x: tx * TAM - izq,
        y: ty * TAM - arriba,
      });
    }
  }

  function posicionEnMapa(e: React.MouseEvent) {
    const r = caja.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function alPresionar() {
    gesto.current = { movido: 0 };
  }

  /**
   * Pegar a postes.
   *
   * La ruta del cable va por la postería, no por en medio de la calle. Si cada
   * clic se ajusta al poste más cercano, el trazo queda exactamente donde está
   * la fibra —y de paso los vanos salen bien, porque se miden entre postes de
   * verdad y no entre puntos aproximados.
   */
  function ajustar(lat: number, lon: number): [number, number] {
    if (!pegarAPostes || !verPostes) return [lat, lon];
    const aqui = aPantalla(lat, lon);
    let mejor: PuntoMapa | null = null;
    let cerca = 22; // píxeles
    for (const p of puntos) {
      if (p.clase !== 'poste') continue;
      const s2 = aPantalla(p.lat, p.lon);
      const d = Math.hypot(s2.x - aqui.x, s2.y - aqui.y);
      if (d < cerca) {
        cerca = d;
        mejor = p;
      }
    }
    return mejor ? [mejor.lat, mejor.lon] : [lat, lon];
  }

  function alSoltar(e: React.MouseEvent) {
    // Seis píxeles de tolerancia: un clic normal mueve dos o tres sin querer,
    // sobre todo con la almohadilla de una laptop.
    const arrastro = (gesto.current?.movido ?? 0) > 6;
    gesto.current = null;
    if (arrastro) return;

    const { x, y } = posicionEnMapa(e);
    const c = aCoordenada(x, y);

    if (modo === 'ruta') {
      setDibujando((d) => [...d, ajustar(c.lat, c.lon)]);
      return;
    }

    if (modo === 'mover' && moviendo) {
      empezar(async () => {
        const r = await moverPunto(moviendo.id, moviendo.clase, c.lat, c.lon);
        setRecado(r.mensaje);
        setMoviendo(null);
      });
      return;
    }

    if (modo === 'sitio') {
      const nombre = window.prompt('¿Cómo se llama el sitio? (Cerro de Velardeña, caseta OLT…)');
      if (!nombre?.trim()) return;
      empezar(async () => {
        const r = await colocarSitio(zonaActual, nombre.trim(), 'tower', c.lat, c.lon);
        setRecado(r.mensaje);
      });
      return;
    }

    if (modo === 'napcaja') {
      const nap = window.prompt('Código de la NAP (por ejemplo NAP-CUE-012)');
      if (!nap?.trim()) return;
      const caja = window.prompt('Código de la caja', nap.trim().replace(/^NAP/i, 'CAJA')) ?? '';
      if (!caja.trim()) return;
      const puertos = Number(window.prompt('¿Cuántos puertos tiene la NAP?', '8') ?? 8);
      empezar(async () => {
        const r = await colocarNapConCaja(
          nap.trim(),
          caja.trim(),
          zonaActual,
          c.lat,
          c.lon,
          puertos,
        );
        setRecado(r.mensaje);
      });
      return;
    }

    if (['nap', 'caja', 'odf'].includes(modo)) {
      const codigo = window.prompt(
        modo === 'nap'
          ? 'Código de la NAP (por ejemplo NAP-CUE-012)'
          : modo === 'caja'
            ? 'Código de la caja (por ejemplo CAJA-CUE-03)'
            : 'Código del ODF',
      );
      if (!codigo?.trim()) return;
      const cap =
        modo === 'nap' ? Number(window.prompt('¿Cuántos puertos tiene?', '8') ?? 8) : null;
      empezar(async () => {
        const r = await colocarElemento(
          modo === 'nap' ? 'nap' : modo === 'caja' ? 'closure' : 'odf',
          codigo.trim(),
          zonaActual,
          c.lat,
          c.lon,
          cap,
        );
        setRecado(r.mensaje);
      });
      return;
    }

    if (modo === 'poste') {
      empezar(async () => {
        const r = await colocarPoste(zonaActual, c.lat, c.lon);
        setRecado(r.mensaje);
      });
    }
  }

  function alRueda(e: React.WheelEvent) {
    e.preventDefault();
    const { x, y } = posicionEnMapa(e);
    const antes = aCoordenada(x, y);
    const nuevo = Math.max(3, Math.min(19, zoom + (e.deltaY < 0 ? 1 : -1)));
    if (nuevo === zoom) return;
    // Se acerca hacia donde está el cursor, no hacia el centro: es lo que uno
    // espera cuando está mirando un poste en la esquina de la pantalla.
    const p = proyectar(antes.lat, antes.lon, nuevo);
    const c = desproyectar(p.x - (x - tam.w / 2), p.y - (y - tam.h / 2), nuevo);
    setZoom(nuevo);
    setCentro({ lat: c.lat, lon: c.lon });
  }

  function alArrastrar(e: React.MouseEvent) {
    if (e.buttons !== 1 || !gesto.current) return;
    gesto.current.movido += Math.abs(e.movementX) + Math.abs(e.movementY);
    const p = proyectar(centro.lat, centro.lon, zoom);
    const c = desproyectar(p.x - e.movementX, p.y - e.movementY, zoom);
    setCentro({ lat: c.lat, lon: c.lon });
  }

  const largoDibujo = dibujando.reduce(
    (s, p, i) => (i === 0 ? 0 : s + metros(dibujando[i - 1], p)),
    0,
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={zonaActual}
          onChange={(e) => {
            const u = new URL(window.location.href);
            u.searchParams.set('zona', e.target.value);
            window.location.href = u.toString();
          }}
          className="rounded-lg border border-marino-200 px-3 py-2 text-sm font-medium text-marino-800"
        >
          {zonas.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>

        {puedeEditar &&
          MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setModo(m.id);
                setDibujando([]);
                setMoviendo(null);
              }}
              className={`rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                modo === m.id
                  ? 'border-naranja-400 bg-naranja-500 text-white'
                  : 'border-marino-200 bg-white text-marino-600 hover:bg-marino-50'
              }`}
            >
              {m.icono} {m.texto}
            </button>
          ))}

        {puedeEditar && (
          <ImportarKmz
            zonas={zonas}
            zonaPorDefecto={zonaActual}
            texto="📥 Importar postes"
            clase="px-2.5 py-2 text-xs"
          />
        )}

        {puedeEditar && (
          <Boton
            variante="oscuro"
            onClick={() => {
              setAbrirCorte((v) => !v);
              setModo('ver');
            }}
            className="bg-falla px-3 py-2 text-xs hover:opacity-90"
          >
            🚨 Diagnosticar corte
          </Boton>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(3, z - 1))}
            className="h-8 w-8 rounded-lg border border-marino-200 bg-white text-marino-600 hover:bg-marino-50"
          >
            −
          </button>
          <span className="w-8 text-center text-xs text-marino-400">{zoom}</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(19, z + 1))}
            className="h-8 w-8 rounded-lg border border-marino-200 bg-white text-marino-600 hover:bg-marino-50"
          >
            +
          </button>
          <Boton
            variante="secundario"
            className="ml-1 px-3 py-1.5 text-xs"
            cargando={guardando}
            onClick={() =>
              empezar(async () => {
                const r = await guardarVistaZona(zonaActual, centro.lat, centro.lon, zoom);
                setRecado(r.mensaje);
              })
            }
          >
            Dejar así esta vista
          </Boton>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-marino-600">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={verPostes}
            onChange={(e) => setVerPostes(e.target.checked)}
          />
          📍 Ver postes ({cuantosPostes})
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={verNumeros}
            onChange={(e) => setVerNumeros(e.target.checked)}
          />
          Nº
        </label>
        {puedeEditar && (
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={pegarAPostes}
              onChange={(e) => setPegarAPostes(e.target.checked)}
            />
            🧲 Pegar a postes
            <span className="text-marino-400">
              — al dibujar, cada clic se ajusta al poste más cercano
            </span>
          </label>
        )}
        <span className="ml-auto text-marino-400">{AYUDA[modo]}</span>
      </div>

      {modo === 'ruta' && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-naranja-200 bg-naranja-50/60 p-3">
          <label className="block">
            <span className="text-xs font-medium text-marino-600">¿De qué cable es la ruta?</span>
            <select
              value={cableRuta}
              onChange={(e) => setCableRuta(e.target.value)}
              className="mt-1 w-56 rounded-lg border border-marino-200 px-3 py-2 text-sm"
            >
              <option value="">Elige el cable</option>
              {cables.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-2 text-sm text-marino-600">
            {dibujando.length} {dibujando.length === 1 ? 'punto' : 'puntos'}
            {largoDibujo > 0 && ` · ${Math.round(largoDibujo)} m`}
          </span>
          <Boton
            cargando={guardando}
            disabled={!cableRuta || dibujando.length < 2}
            onClick={() =>
              empezar(async () => {
                const r = await guardarTrazo(cableRuta, dibujando);
                setRecado(r.mensaje);
                if (r.ok) setDibujando([]);
              })
            }
          >
            Guardar el trazo
          </Boton>
          <Boton
            variante="secundario"
            onClick={() => setDibujando((d) => d.slice(0, -1))}
            disabled={dibujando.length === 0}
          >
            Quitar el último
          </Boton>
          <Boton variante="texto" onClick={() => setDibujando([])}>
            Empezar de nuevo
          </Boton>
          <p className="w-full text-xs text-marino-500">
            Clic para poner un punto, <strong>arrastra para moverte</strong> sin perder lo que
            llevas, y la rueda para acercar. El trazo aguanta los puntos que quieras.
          </p>
        </div>
      )}

      {abrirCorte && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
          <p className="mb-2 text-sm font-medium text-marino-800">🚨 ¿Dónde está el corte?</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const cable = String(d.get('cable') ?? '');
              const metros = Number(d.get('metros') ?? 0);
              if (!cable || !metros) return;
              empezar(async () => {
                const r = await diagnosticarCorte(
                  cable,
                  metros,
                  d.get('desde') !== 'fin',
                  d.get('descontar') === 'si',
                );
                setRecado(r.mensaje);
                if (r.corte) {
                  setCorte(r.corte);
                  setCentro({ lat: Number(r.corte.lat), lon: Number(r.corte.lon) });
                  if (zoom < 16) setZoom(16);
                }
              });
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Cable</span>
              <select
                name="cable"
                required
                className="mt-1 w-48 rounded-lg border border-marino-200 px-3 py-2 text-sm"
              >
                <option value="">Elige</option>
                {cables
                  .filter((c) => trazos.some((t) => t.id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Metros del OTDR</span>
              <input
                name="metros"
                type="number"
                step="0.1"
                min="1"
                required
                placeholder="1340"
                className="mt-1 w-32 rounded-lg border border-marino-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Medido desde</span>
              <select
                name="desde"
                className="mt-1 w-36 rounded-lg border border-marino-200 px-3 py-2 text-sm"
              >
                <option value="inicio">El inicio</option>
                <option value="fin">El final</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2.5">
              <input type="checkbox" name="descontar" value="si" defaultChecked />
              <span className="text-xs text-marino-600">
                Descontar las reservas
                <span className="block text-[11px] text-marino-400">
                  Sin esto el punto sale más adelante de donde está.
                </span>
              </span>
            </label>
            <Boton type="submit" variante="oscuro" cargando={guardando}>
              Ubicar el corte
            </Boton>
            {corte && (
              <Boton
                type="button"
                variante="texto"
                onClick={() => {
                  setCorte(null);
                  setRecado(null);
                }}
              >
                Quitar la marca
              </Boton>
            )}
          </form>
          <p className="mt-2 text-xs text-marino-500">
            El OTDR mide fibra, no banqueta: sus metros incluyen lo que se dejó enrollado en el
            sitio, en cada poste y en cada caja. Esta cuenta descuenta esas reservas para poner el
            punto donde de verdad hay que abrir.
          </p>
        </div>
      )}

      {modo === 'mover' && (
        <div className="mb-3 rounded-lg bg-marino-50 px-4 py-2.5 text-sm text-marino-600">
          {moviendo
            ? `Ahora dale clic al lugar correcto de «${moviendo.nombre}».`
            : 'Dale clic a lo que quieras mover y luego a su lugar correcto.'}
        </div>
      )}

      {recado && (
        <div className="mb-3 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-exito">{recado}</div>
      )}

      <div
        ref={caja}
        onMouseMove={alArrastrar}
        onMouseDown={alPresionar}
        onMouseUp={alSoltar}
        onMouseLeave={() => {
          gesto.current = null;
        }}
        onWheel={alRueda}
        className={`relative select-none overflow-hidden rounded-xl border border-marino-200 bg-marino-100 active:cursor-grabbing ${
          modo === 'ver' ? 'cursor-grab' : modo === 'mover' ? 'cursor-pointer' : 'cursor-crosshair'
        }`}
        style={{ height: tam.h }}
      >
        {mosaicos.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.k}
            src={t.url}
            alt=""
            width={TAM}
            height={TAM}
            draggable={false}
            className="pointer-events-none absolute"
            style={{ left: t.x, top: t.y }}
          />
        ))}

        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {trazos.map((t, i) => {
            const d = t.puntos
              .map((q, j) => {
                const p = aPantalla(q[0], q[1]);
                return `${j === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
              })
              .join(' ');
            const color = t.color ?? COLOR_TRAZO[i % COLOR_TRAZO.length];
            return (
              <g key={t.id}>
                <path d={d} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text
                  x={aPantalla(t.puntos[0][0], t.puntos[0][1]).x}
                  y={aPantalla(t.puntos[0][0], t.puntos[0][1]).y - 8}
                  fontSize="11"
                  fontWeight="700"
                  fill={color}
                  stroke="#fff"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {t.codigo}
                </text>
              </g>
            );
          })}

          {dibujando.length > 0 && (
            <>
              <path
                d={dibujando
                  .map((q, j) => {
                    const p = aPantalla(q[0], q[1]);
                    return `${j === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#dc2626"
                strokeWidth="3"
                strokeDasharray="7 5"
              />
              {dibujando.map((q, j) => {
                const p = aPantalla(q[0], q[1]);
                return <circle key={j} cx={p.x} cy={p.y} r="4" fill="#dc2626" />;
              })}
            </>
          )}
        </svg>

        {puntos.map((p) => {
          const esPoste = p.clase === 'poste';
          if (esPoste && !verPostes) return null;
          const s = aPantalla(p.lat, p.lon);
          if (s.x < -40 || s.y < -40 || s.x > tam.w + 40 || s.y > tam.h + 40) return null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                if (modo === 'mover') {
                  e.stopPropagation();
                  setMoviendo(p);
                }
              }}
              title={`${p.nombre}${p.detalle ? ` · ${p.detalle}` : ''}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: s.x, top: s.y, zIndex: esPoste ? 5 : 10 }}
            >
              <span
                className={`block rounded-full border-2 border-white shadow ${
                  esPoste ? 'h-2.5 w-2.5' : 'h-4 w-4'
                } ${moviendo?.id === p.id ? 'ring-2 ring-red-500' : ''}`}
                style={{ background: p.color }}
              />
              {(!esPoste || verNumeros) && (
                <span
                  className={`pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap font-semibold ${
                    esPoste ? 'text-[9px] text-marino-500' : 'text-[10px]'
                  }`}
                  style={{ textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff' }}
                >
                  {p.nombre}
                </span>
              )}
            </button>
          );
        })}

        {corte && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: aPantalla(Number(corte.lat), Number(corte.lon)).x,
              top: aPantalla(Number(corte.lat), Number(corte.lon)).y,
              zIndex: 20,
            }}
          >
            <span className="block h-6 w-6 animate-pulse rounded-full border-4 border-red-600 bg-red-500/40" />
            <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              corte · {Math.round(Number(corte.geo_m))} m
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-1 right-1 rounded bg-white/85 px-1.5 py-0.5 text-[9px] text-marino-500">
          © OpenStreetMap
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-marino-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#16a34a]" /> NAP con lugar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#dc2626]" /> NAP llena
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#7c3aed]" /> caja de empalme
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[#f2820c]" /> ODF / sitio
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#1e40af]" /> poste
        </span>
        <span className="ml-auto">Rueda del ratón para acercar · arrastra para mover</span>
      </div>
    </div>
  );
}
