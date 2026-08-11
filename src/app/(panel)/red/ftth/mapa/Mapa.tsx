'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { Borrar } from '@/componentes/ui/Borrar';
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
  ramalDesde,
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

/**
 * El punto más cercano de un trazo, y a cuántos metros quedó.
 *
 * Es la misma cuenta que hace la base con proyectar_en_ruta: se proyecta
 * perpendicularmente sobre cada tramo y se toma el mejor. Se repite aquí para
 * poder avisar ANTES de preguntar el código, no después de haberlo escrito.
 */
function proyectarEnTrazo(
  ruta: [number, number][],
  lat: number,
  lon: number,
): { lat: number; lon: number; metros: number } | null {
  if (ruta.length < 2) return null;
  const k = Math.cos((lat * Math.PI) / 180);
  let mejor: { lat: number; lon: number; metros: number } | null = null;

  for (let i = 0; i < ruta.length - 1; i++) {
    const [y1, lo1] = ruta[i];
    const [y2, lo2] = ruta[i + 1];
    const x1 = lo1 * k;
    const x2 = lo2 * k;
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = lon * k - x1;
    const wy = lat - y1;
    const largo = vx * vx + vy * vy;
    const t = largo === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / largo));
    const px = x1 + t * vx;
    const py = y1 + t * vy;
    const p: [number, number] = [py, px / k];
    const d = metros([lat, lon], p);
    if (!mejor || d < mejor.metros) mejor = { lat: p[0], lon: p[1], metros: d };
  }
  return mejor;
}

type Modo =
  | 'ver'
  | 'sitio'
  | 'nap'
  | 'caja'
  | 'napcaja'
  | 'odf'
  | 'poste'
  | 'ruta'
  | 'ramal'
  | 'mover';

const MODOS: { id: Modo; texto: string; icono: string }[] = [
  { id: 'ver', texto: 'Navegar', icono: '🧭' },
  { id: 'sitio', texto: 'Colocar sitio', icono: '🏢' },
  { id: 'caja', texto: 'Colocar caja', icono: '📦' },
  { id: 'nap', texto: 'Colocar NAP', icono: '📡' },
  { id: 'napcaja', texto: 'NAP + caja', icono: '📦📡' },
  { id: 'odf', texto: 'Colocar ODF', icono: '🗄️' },
  { id: 'poste', texto: 'Colocar poste', icono: '📍' },
  { id: 'ruta', texto: 'Dibujar ruta', icono: '✏️' },
  { id: 'ramal', texto: 'Ramal desde caja', icono: '🌿' },
  { id: 'mover', texto: 'Mover punto', icono: '✋' },
];

/** Lo que dice cada modo, para no tener que adivinar qué hace. */
const AYUDA: Record<Modo, string> = {
  ver: 'Arrastra para moverte y la rueda para acercar. Dale clic a una NAP, caja o poste para ver su ficha y poder borrarlo.',
  sitio: 'Clic donde está la torre, el POP o la caseta de la OLT.',
  caja: 'Clic SOBRE la línea del cable. Ahí se abre la caja de empalme, no a media cuadra.',
  nap: 'Clic SOBRE la línea del cable. La NAP cuelga de la fibra: si ahí no pasa, no entra.',
  napcaja:
    'Sobre la línea del cable. Pone la NAP y su caja en el mismo punto, que es como van en la calle: la NAP colgada de la caja donde se hace el empalme.',
  odf: 'Clic donde está el distribuidor, normalmente dentro de la caseta.',
  poste: 'Clic en cada poste. También los puedes traer de golpe con «Importar postes».',
  ruta: 'Clic para ir marcando el recorrido del cable, poste por poste. Arrastra para moverte.',
  ramal:
    'Dale clic a la caja de la que sale el cable nuevo. De una caja pueden salir todos los ramales que necesites, y ninguno le borra el trazo a otro.',
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
  /** A cuántos metros de la línea del cable se acepta una NAP o una caja. */
  margen: number;
}

export function Mapa({
  zonas,
  zonaActual,
  vista,
  puntos,
  trazos,
  cables,
  puedeEditar,
  margen,
}: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [centro, setCentro] = useState({ lat: vista.lat, lon: vista.lon });
  const [zoom, setZoom] = useState(vista.zoom);
  const [tam, setTam] = useState({ w: 900, h: 560 });
  const [modo, setModo] = useState<Modo>('ver');
  const [dibujando, setDibujando] = useState<[number, number][]>([]);
  const [cableRuta, setCableRuta] = useState<string>('');
  // Reemplazar borra lo que había y no hay cómo deshacerlo, así que se elige a
  // propósito y por omisión se ofrece continuar cuando ya hay algo dibujado.
  const [modoTrazo, setModoTrazo] = useState<'reemplazar' | 'continuar'>('reemplazar');
  // Cuánto se movió el ratón con el botón apretado. Es lo que distingue un
  // clic de un arrastre, y por eso se puede desplazar el mapa en cualquier
  // modo: dibujando una ruta larga uno TIENE que poder moverse.
  const gesto = useRef<{ movido: number } | null>(null);
  const [moviendo, setMoviendo] = useState<PuntoMapa | null>(null);
  // El recado guarda si salió bien o mal. Antes todo se pintaba de verde, y un
  // rechazo con fondo verde se lee como «quedó»: por eso una caja que la base
  // no aceptó parecía haberse agregado.
  const [recado, decirRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const fallo = (texto: string) => decirRecado({ ok: false, texto });
  // Lo que se está viendo de cerca: la ficha de un punto del mapa.
  const [elegido, setElegido] = useState<PuntoMapa | null>(null);
  const [verPostes, setVerPostes] = useState(true);
  const [verNumeros, setVerNumeros] = useState(true);
  const [pegarAPostes, setPegarAPostes] = useState(true);
  const [corte, setCorte] = useState<Corte | null>(null);
  const [abrirCorte, setAbrirCorte] = useState(false);
  const [guardando, empezar] = useTransition();
  const router = useRouter();

  /**
   * Lo que contestó el servidor.
   *
   * Además de enseñar el recado, vuelve a pedir la zona. Sin esto lo que se
   * guardaba SÍ quedaba en la base, pero el mapa seguía enseñando lo de antes
   * —y una caja que no aparece se siente igualito a una caja que no se
   * guardó—. Por eso se pide el refresco explícito y no se confía en que la
   * pantalla se entere sola.
   */
  function aplicar(r: { ok: boolean; mensaje: string }) {
    decirRecado({ ok: r.ok, texto: r.mensaje });
    if (r.ok) router.refresh();
  }

  // El centro cambia cuando uno cambia de zona: cada localidad tiene el suyo.
  useEffect(() => {
    setCentro({ lat: vista.lat, lon: vista.lon });
    setZoom(vista.zoom);
    setDibujando([]);
  }, [vista.lat, vista.lon, vista.zoom]);

  useEffect(() => {
    if (elegido && !puntos.some((p) => p.id === elegido.id)) setElegido(null);
  }, [puntos, elegido]);

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
  // En estos modos el clic solo vale encima de la fibra, así que la fibra se
  // resalta y el cursor deja de ser una cruz cualquiera.
  const apuntandoALaFibra =
    modo === 'nap' ||
    modo === 'caja' ||
    modo === 'napcaja' ||
    (modo === 'mover' && (moviendo?.clase === 'nap' || moviendo?.clase === 'caja'));
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

  /**
   * Una NAP o una caja SIEMPRE va sobre la fibra.
   *
   * En la calle la caja se abre donde pasa el cable, no a media cuadra. Aquí
   * es igual: el clic se corre solo hasta la línea del cable más cercano, y si
   * no hay ninguna cerca no se pregunta nada — se dice por qué.
   *
   * La base vuelve a revisarlo por su cuenta al guardar. Esto de aquí es para
   * no hacerlo escribir el código de una NAP que de todos modos va a rebotar.
   */
  function sobreLaFibra(
    lat: number,
    lon: number,
  ): { lat: number; lon: number; cable: string } | null {
    let mejor: { lat: number; lon: number; cable: string; metros: number } | null = null;

    for (const t of trazos) {
      const p = proyectarEnTrazo(t.puntos, lat, lon);
      if (p && (!mejor || p.metros < mejor.metros)) {
        mejor = { ...p, cable: t.codigo };
      }
    }

    if (!mejor || mejor.metros > margen) {
      fallo(
        trazos.length === 0
          ? 'Aquí no hay ningún cable dibujado, y las NAP y las cajas van encima de la fibra. ' +
              'Dale a «Dibujar ruta» y marca primero el recorrido del cable.'
          : `Ahí no pasa ninguna fibra: la más cercana queda a ${Math.round(
              mejor?.metros ?? 0,
            )} m y la tolerancia es de ${margen} m. Dale el clic encima de la línea del cable.`,
      );
      return null;
    }

    return { lat: mejor.lat, lon: mejor.lon, cable: mejor.cable };
  }

  function alSoltar(e: React.MouseEvent) {
    // Seis píxeles de tolerancia: un clic normal mueve dos o tres sin querer,
    // sobre todo con la almohadilla de una laptop.
    const arrastro = (gesto.current?.movido ?? 0) > 6;
    gesto.current = null;
    if (arrastro) return;

    const { x, y } = posicionEnMapa(e);
    const c = aCoordenada(x, y);

    // Clic al vacío: se cierra la ficha que estuviera abierta.
    if (elegido) setElegido(null);

    if (modo === 'ruta') {
      setDibujando((d) => [...d, ajustar(c.lat, c.lon)]);
      return;
    }

    if (modo === 'mover' && moviendo) {
      // Arrastrar una NAP fuera de la fibra sería la puerta de atrás para la
      // misma regla: se coloca bien y luego se saca. Aquí tampoco se puede.
      const pega = moviendo.clase === 'nap' || moviendo.clase === 'caja';
      const f = pega ? sobreLaFibra(c.lat, c.lon) : { lat: c.lat, lon: c.lon };
      if (!f) return;
      empezar(async () => {
        const r = await moverPunto(moviendo.id, moviendo.clase, f.lat, f.lon);
        aplicar(r);
        setMoviendo(null);
      });
      return;
    }

    if (modo === 'sitio') {
      const nombre = window.prompt('¿Cómo se llama el sitio? (Cerro de Velardeña, caseta OLT…)');
      if (!nombre?.trim()) return;
      empezar(async () => {
        const r = await colocarSitio(zonaActual, nombre.trim(), 'tower', c.lat, c.lon);
        aplicar(r);
      });
      return;
    }

    if (modo === 'napcaja') {
      const f = sobreLaFibra(c.lat, c.lon);
      if (!f) return;
      const nap = window.prompt(`Sobre ${f.cable}. Código de la NAP (por ejemplo NAP-CUE-012)`);
      if (!nap?.trim()) return;
      const caja = window.prompt('Código de la caja', nap.trim().replace(/^NAP/i, 'CAJA')) ?? '';
      if (!caja.trim()) return;
      const puertos = Number(window.prompt('¿Cuántos puertos tiene la NAP?', '8') ?? 8);
      empezar(async () => {
        const r = await colocarNapConCaja(
          nap.trim(),
          caja.trim(),
          zonaActual,
          f.lat,
          f.lon,
          puertos,
        );
        aplicar(r);
      });
      return;
    }

    if (['nap', 'caja', 'odf'].includes(modo)) {
      // El ODF vive dentro de la caseta, donde el cable ya terminó: a ese no
      // le toca la regla. A la NAP y a la caja sí.
      const f = modo === 'odf' ? { lat: c.lat, lon: c.lon, cable: '' } : sobreLaFibra(c.lat, c.lon);
      if (!f) return;

      const codigo = window.prompt(
        modo === 'nap'
          ? `Sobre ${f.cable}. Código de la NAP (por ejemplo NAP-CUE-012)`
          : modo === 'caja'
            ? `Sobre ${f.cable}. Código de la caja (por ejemplo CAJA-CUE-03)`
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
          f.lat,
          f.lon,
          cap,
        );
        aplicar(r);
      });
      return;
    }

    if (modo === 'poste') {
      empezar(async () => {
        const r = await colocarPoste(zonaActual, c.lat, c.lon);
        aplicar(r);
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

  // El cable elegido para dibujar, cuando ya trae recorrido. Es lo que decide
  // si hay que enseñar el aviso de reemplazo.
  const elegidoRuta = cables.find((c) => c.id === cableRuta);
  const yaTrazado = elegidoRuta && elegidoRuta.puntos_trazo >= 2 ? elegidoRuta : null;

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
                aplicar(r);
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
              onChange={(e) => {
                setCableRuta(e.target.value);
                // Si el cable ya trae recorrido, lo que casi siempre se quiere
                // es alargarlo. Reemplazar se elige a mano, viendo el aviso.
                const c = cables.find((x) => x.id === e.target.value);
                setModoTrazo(c && c.puntos_trazo >= 2 ? 'continuar' : 'reemplazar');
              }}
              className="mt-1 w-56 rounded-lg border border-marino-200 px-3 py-2 text-sm"
            >
              <option value="">Elige el cable</option>
              {cables.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                  {c.puntos_trazo >= 2
                    ? ` · ya trazado (${Math.round(Number(c.length_m ?? 0))} m)`
                    : ''}
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
                const r = await guardarTrazo(cableRuta, dibujando, modoTrazo);
                aplicar(r);
                if (r.ok) setDibujando([]);
              })
            }
          >
            {modoTrazo === 'continuar' && yaTrazado ? 'Alargar el trazo' : 'Guardar el trazo'}
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
          {/* Lo que se dibuja encima de un cable que ya tenía recorrido no se
              puede deshacer. Por eso la decisión se pone enfrente, no en un
              menú de ajustes, y por omisión viene en «continuar». */}
          {yaTrazado && (
            <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-aviso">
                <strong>{yaTrazado.code}</strong> ya tiene {yaTrazado.puntos_trazo} puntos y{' '}
                {Math.round(Number(yaTrazado.length_m ?? 0))} m dibujados.
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-marino-700">
                <label className="flex cursor-pointer items-start gap-1.5">
                  <input
                    type="radio"
                    name="modotrazo"
                    className="mt-0.5"
                    checked={modoTrazo === 'continuar'}
                    onChange={() => setModoTrazo('continuar')}
                  />
                  <span>
                    <strong>Continuar</strong>
                    <span className="block text-marino-400">
                      Lo alarga: lo que marques se pega al final de lo que ya había.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-1.5">
                  <input
                    type="radio"
                    name="modotrazo"
                    className="mt-0.5"
                    checked={modoTrazo === 'reemplazar'}
                    onChange={() => setModoTrazo('reemplazar')}
                  />
                  <span>
                    <strong>Reemplazar</strong>
                    <span className="block text-falla">
                      Borra los {yaTrazado.puntos_trazo} puntos anteriores. No hay cómo deshacerlo.
                    </span>
                  </span>
                </label>
              </div>
              <p className="mt-2 text-xs text-marino-500">
                ¿Es otro cable que sale de una caja? No uses este: dale a{' '}
                <strong>🌿 Ramal desde caja</strong> y clic a la caja. Así cada ramal tiene su
                propio trazo y ninguno le borra el suyo a otro.
              </p>
            </div>
          )}
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
                aplicar(r);
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
                  decirRecado(null);
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
        <div
          className={`mb-3 flex items-start gap-2 rounded-lg px-4 py-2.5 text-sm ${
            recado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
          }`}
        >
          <span aria-hidden="true">{recado.ok ? '✓' : '⚠'}</span>
          <span className="flex-1">{recado.texto}</span>
          <button
            type="button"
            onClick={() => decirRecado(null)}
            className="shrink-0 opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
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
                {/* Cuando se está colocando una NAP o una caja, la fibra se
                    engorda: es el único lugar donde se puede dar el clic, así
                    que tiene que verse desde lejos. */}
                {apuntandoALaFibra && (
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth="16"
                    strokeOpacity="0.22"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
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
              onMouseUp={(e) => {
                /* Ojo con el orden de los eventos: el «mouseup» de este punto
                 * sube al mapa de abajo. Si no se corta aquí, darle clic a una
                 * NAP estando en modo «Colocar NAP» pondría otra encima de la
                 * que ya estaba.
                 *
                 * Se corta SOLO cuando el clic sobre el punto significa algo:
                 * verlo, o agarrarlo para moverlo. Dibujando una ruta el clic
                 * tiene que llegar al mapa, porque ahí es donde se pega al
                 * poste.
                 */
                const arrastro = (gesto.current?.movido ?? 0) > 6;
                if (arrastro) return;

                const agarrar = modo === 'mover' && !moviendo;
                const inspeccionar = modo === 'ver';
                // El ramal nace de una caja, una NAP, un ODF o un sitio. De un
                // poste no: el poste sostiene el cable, no lo origina.
                const ramificar = modo === 'ramal' && p.clase !== 'poste';
                if (!agarrar && !inspeccionar && !ramificar) return;

                e.stopPropagation();
                gesto.current = null;

                if (agarrar) {
                  setMoviendo(p);
                  return;
                }

                if (ramificar) {
                  const codigo = window.prompt(
                    `Código del cable que sale de ${p.nombre} (por ejemplo DI-CUE-02)`,
                  );
                  if (!codigo?.trim()) return;
                  const hilos = Number(window.prompt('¿Cuántos hilos trae?', '12') ?? 12);
                  empezar(async () => {
                    const r = await ramalDesde(p.id.split(':')[1], codigo.trim(), hilos, 'adss');
                    aplicar(r);
                    if (r.ok && r.cable) {
                      // Queda listo para dibujar: el cable elegido es el nuevo,
                      // su primer punto es la caja, y el modo pasa a «continuar»
                      // para que lo que marque se agregue a ese arranque.
                      setCableRuta(r.cable);
                      setDibujando([[p.lat, p.lon]]);
                      setModoTrazo('continuar');
                      setModo('ruta');
                    }
                  });
                  return;
                }
                setElegido(p);
                decirRecado(null);
              }}
              title={`${p.nombre}${p.detalle ? ` · ${p.detalle}` : ''}${
                modo === 'ver' ? ' — clic para ver su ficha' : ''
              }`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: s.x, top: s.y, zIndex: esPoste ? 5 : 10 }}
            >
              <span
                className={`block rounded-full border-2 border-white shadow ${
                  esPoste ? 'h-2.5 w-2.5' : 'h-4 w-4'
                } ${
                  moviendo?.id === p.id
                    ? 'ring-2 ring-red-500'
                    : elegido?.id === p.id
                      ? 'ring-2 ring-naranja-500 ring-offset-1'
                      : ''
                }`}
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

        {/* ── la ficha ─────────────────────────────────────────────────────
            Va encima del mapa, arriba a la izquierda y no pegada al punto:
            pegada al punto tapa justo lo que uno quiere ver, y cuando el punto
            está en la orilla se sale de la pantalla. */}
        {elegido && (
          <div
            className="absolute left-3 top-3 w-72 rounded-xl border border-marino-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm"
            style={{ zIndex: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="block h-3 w-3 shrink-0 rounded-full border-2 border-white shadow"
                  style={{ background: elegido.color }}
                />
                <p className="truncate font-mono text-sm font-semibold text-marino-800">
                  {elegido.clase === 'poste' ? `Poste ${elegido.nombre}` : elegido.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setElegido(null)}
                className="shrink-0 rounded px-1 text-marino-400 hover:bg-marino-50 hover:text-marino-700"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <dl className="mt-2.5 space-y-1.5 text-xs">
              {elegido.ficha.map((f) => (
                <div key={f.que} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-marino-400">{f.que}</dt>
                  <dd className="flex-1 text-marino-700">{f.dato}</dd>
                </div>
              ))}
              {elegido.cables && elegido.cables.length > 0 && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-marino-400">Cables</dt>
                  <dd className="flex-1 text-marino-700">{elegido.cables.join(' · ')}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-marino-400">Dónde está</dt>
                <dd className="flex-1 font-mono text-[11px] text-marino-500">
                  {elegido.lat.toFixed(6)}, {elegido.lon.toFixed(6)}
                </dd>
              </div>
            </dl>

            {puedeEditar && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-marino-100 pt-2.5">
                <Boton
                  variante="secundario"
                  className="px-2.5 py-1 text-xs"
                  onClick={() => {
                    setModo('mover');
                    setMoviendo(elegido);
                    setElegido(null);
                  }}
                >
                  ✋ Mover
                </Boton>
                {/* Borrar de verdad, con la misma pregunta de siempre. Si la
                    base se niega —porque hay clientes colgados— su recado sale
                    aquí mismo, sin salir del mapa. */}
                <Borrar
                  tipo={elegido.borrarComo}
                  id={elegido.id.split(':')[1]}
                  nombre={elegido.clase === 'poste' ? `el poste ${elegido.nombre}` : elegido.nombre}
                  alTerminar={() => {
                    setElegido(null);
                    router.refresh();
                  }}
                />
              </div>
            )}
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
