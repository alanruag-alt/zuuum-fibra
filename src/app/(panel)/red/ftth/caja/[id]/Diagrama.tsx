'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import {
  empalmarHilos,
  engancharCable,
  soltarCableDeCaja,
  soltarEmpalme,
  terminarHilo,
} from '@/modulos/ftth/acciones_caja';
import { toPng } from 'html-to-image';
import {
  conectarSalidaArrastre,
  soltarSalida,
  soltarEntradaSplitter,
} from '@/modulos/ftth/acciones_splitter';
import { EditarSplitter } from '@/app/(panel)/red/ftth/caja/[id]/SplitterEditor';
import { Borrar } from '@/componentes/ui/Borrar';
import { COLOR_HILO, ESTADO_HILO } from '@/modulos/ftth/etiquetas';
import { PAPEL_CABLE } from '@/modulos/ftth/caja_tipos';
import type { CableEnCaja, HiloEnCaja } from '@/modulos/ftth/caja_tipos';
import type { Splitter } from '@/modulos/ftth/splitter_tipos';
import type { Respuesta } from '@/modulos/admin/acciones';

interface Destino {
  id: string;
  code: string;
  que: 'nap' | 'splitter';
  alimentado: boolean;
  detalle?: string | null;
}

interface SalidaVista {
  id: string;
  numero: number;
  estado: string;
  destino: string | null;
}

interface SplitterEnCaja {
  splitter: Splitter;
  salidas: SalidaVista[];
}

interface Conexion {
  desde: string;
  hasta: string;
  color: string | null;
}

interface Props {
  caja: { id: string; code: string; name: string | null; tipo: string };
  cables: CableEnCaja[];
  hilos: HiloEnCaja[];
  destinos: Destino[];
  splitters: SplitterEnCaja[];
  conexiones: Conexion[];
  disponibles: { id: string; code: string; hilos: number }[];
}

/**
 * La caja abierta.
 *
 * Adentro de una caja de empalme hay cables de un lado y cables del otro, y
 * el trabajo consiste en pegar un hilo con otro. Una lista de renglones dice
 * lo mismo pero no se parece a nada; esto sí. Se arrastra del punto de un
 * hilo al punto de otro y quedan empalmados, igual que con la fusionadora.
 *
 * Los colores son los de verdad —los doce de la norma— porque parado frente
 * a la caja lo que se ve es el color, no el número.
 */
export default function Diagrama({
  caja,
  cables,
  hilos,
  destinos,
  splitters,
  conexiones,
  disponibles,
}: Props) {
  const router = useRouter();
  const [recado, setRecado] = useState<Respuesta | null>(null);
  const [guardando, empezar] = useTransition();
  const [soloLibres, setSoloLibres] = useState(false);
  const [agregando, setAgregando] = useState(false);

  const lienzo = useRef<HTMLDivElement>(null);
  const puntos = useRef(new Map<string, HTMLElement>());
  const [medidas, setMedidas] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [tam, setTam] = useState({ w: 0, h: 0 });

  const [arrastre, setArrastre] = useState<null | {
    desde: string;
    x: number;
    y: number;
    sobre: string | null;
  }>(null);

  const aplicar = useCallback(
    (r: Respuesta) => {
      setRecado(r);
      if (r.ok) router.refresh();
    },
    [router],
  );

  // ── acomodo libre de las tarjetas ────────────────────────────────────────
  // Cada tarjeta (cable, splitter, NAP) se puede arrastrar de su encabezado
  // para ponerla donde uno quiera. El acomodo se guarda por caja en el
  // navegador, para que la próxima vez esté igual. Es estado de presentación:
  // no toca la base.
  const contenido = useRef<HTMLDivElement>(null);
  const nodos = useRef(new Map<string, HTMLElement>());
  const [posiciones, setPosiciones] = useState<Record<string, { x: number; y: number }>>({});
  const [moviendo, setMoviendo] = useState<null | { id: string; dx: number; dy: number }>(null);
  const [exportando, setExportando] = useState(false);

  const CLAVE_POS = `diagpos:${caja.id}`;

  const registrarNodo = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodos.current.set(id, el);
    else nodos.current.delete(id);
  }, []);

  const posDe = (id: string) => posiciones[id] ?? { x: 20, y: 20 };

  const empezarMover = useCallback(
    (id: string, e: React.PointerEvent) => {
      const cont = contenido.current;
      if (!cont) return;
      e.preventDefault();
      const base = cont.getBoundingClientRect();
      const pos = posiciones[id] ?? { x: 20, y: 20 };
      setMoviendo({ id, dx: e.clientX - base.left - pos.x, dy: e.clientY - base.top - pos.y });
    },
    [posiciones],
  );

  const exportarImagen = useCallback(() => {
    const nodo = contenido.current;
    if (!nodo) return;
    setExportando(true);
    toPng(nodo, { backgroundColor: '#ffffff', pixelRatio: 2, width: tam.w, height: tam.h })
      .then((url) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `caja-${caja.code}.png`;
        a.click();
      })
      .catch(() =>
        setRecado({ ok: false, mensaje: 'No se pudo generar la imagen. Intenta de nuevo.' }),
      )
      .finally(() => setExportando(false));
  }, [caja.code, tam.w, tam.h]);

  const reacomodar = () => {
    try {
      localStorage.removeItem(CLAVE_POS);
    } catch {}
    const naps0 = destinos.filter((d) => d.que === 'nap');
    const def: Record<string, { x: number; y: number }> = {};
    cables.forEach((c, i) => (def[`cable:${c.cable_id}`] = { x: 20 + i * 300, y: 20 }));
    const baseX = 20 + cables.length * 300 + 40;
    splitters.forEach((s, i) => (def[`spl:${s.splitter.id}`] = { x: baseX, y: 20 + i * 280 }));
    naps0.forEach((d, i) => (def[`nap:${d.id}`] = { x: baseX + 280, y: 20 + i * 130 }));
    setPosiciones(def);
  };

  // ── dónde queda cada punto ───────────────────────────────────────────────
  // Se mide del DOM y no se calcula: las tarjetas crecen con el contenido y
  // cualquier cuenta a mano se desfasa en cuanto un cable trae 48 hilos.
  const medir = useCallback(() => {
    const cont = contenido.current;
    if (!cont) return;
    const base = cont.getBoundingClientRect();
    const m = new Map<string, { x: number; y: number }>();
    for (const [id, el] of puntos.current) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      m.set(id, { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 });
    }
    setMedidas(m);
    // El lienzo se agranda para que quepan las tarjetas donde las pusieron.
    let w = 900;
    let h = 400;
    for (const [, el] of nodos.current) {
      if (!el.isConnected) continue;
      w = Math.max(w, el.offsetLeft + el.offsetWidth + 60);
      h = Math.max(h, el.offsetTop + el.offsetHeight + 60);
    }
    setTam({ w, h });
  }, []);

  useLayoutEffect(() => {
    medir();
  }, [medir, hilos, cables, splitters, soloLibres, posiciones]);

  useEffect(() => {
    const caja0 = lienzo.current;
    if (!caja0) return;
    const obs = new ResizeObserver(() => medir());
    obs.observe(caja0);
    window.addEventListener('resize', medir);
    caja0.addEventListener('scroll', medir);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', medir);
      caja0.removeEventListener('scroll', medir);
    };
  }, [medir]);

  // ── arrastrar de un hilo a otro ──────────────────────────────────────────
  useEffect(() => {
    if (!arrastre) return;

    const mover = (e: PointerEvent) => {
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      const nodo = bajo?.closest('[data-punto]') as HTMLElement | null;
      const sobre = nodo?.dataset.punto ?? null;
      setArrastre((a) =>
        a ? { ...a, x: e.clientX, y: e.clientY, sobre: sobre === a.desde ? null : sobre } : a,
      );
    };

    const soltar = () => {
      const a = arrastre;
      setArrastre(null);
      if (!a || !a.sobre) return;
      const sobre = a.sobre;

      // Arrastrar una SALIDA de splitter: solo va a una NAP o a un hilo.
      if (a.desde.startsWith('sal:')) {
        const salida = a.desde.slice(4);
        const nap = destinos.find((d) => d.id === sobre && d.que === 'nap');
        const esHilo = hilos.some((h) => h.hilo_id === sobre);
        empezar(async () => {
          if (nap) aplicar(await conectarSalidaArrastre(salida, 'nap', nap.id));
          else if (esHilo) aplicar(await conectarSalidaArrastre(salida, 'hilo', sobre));
          else
            aplicar({
              ok: false,
              mensaje: 'La salida del splitter va a una NAP o a un hilo de un cable.',
            });
        });
        return;
      }

      // Arrastrar un HILO: a otro hilo (empalme) o a una NAP/splitter (terminar).
      const destino = destinos.find((d) => d.id === sobre);
      empezar(async () => {
        if (destino) {
          aplicar(await terminarHilo(caja.id, a.desde, destino.id));
        } else {
          aplicar(await empalmarHilos(caja.id, a.desde, sobre));
        }
      });
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
  }, [arrastre, caja.id, destinos, hilos, aplicar]);

  // Carga el acomodo guardado; a lo que sea nuevo le da una posición por defecto.
  const cablesKey = cables.map((c) => c.cable_id).join();
  const splittersKey = splitters.map((s) => s.splitter.id).join();
  const destinosKey = destinos.map((d) => d.id).join();
  useEffect(() => {
    const naps0 = destinos.filter((d) => d.que === 'nap');
    const def: Record<string, { x: number; y: number }> = {};
    cables.forEach((c, i) => (def[`cable:${c.cable_id}`] = { x: 20 + i * 300, y: 20 }));
    const baseX = 20 + cables.length * 300 + 40;
    splitters.forEach((s, i) => (def[`spl:${s.splitter.id}`] = { x: baseX, y: 20 + i * 280 }));
    naps0.forEach((d, i) => (def[`nap:${d.id}`] = { x: baseX + 280, y: 20 + i * 130 }));
    let guardadas: Record<string, { x: number; y: number }> = {};
    try {
      const r = localStorage.getItem(CLAVE_POS);
      if (r) guardadas = JSON.parse(r) as Record<string, { x: number; y: number }>;
    } catch {}
    setPosiciones({ ...def, ...guardadas });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [CLAVE_POS, cablesKey, splittersKey, destinosKey]);

  // Arrastrar una tarjeta de su encabezado para moverla.
  useEffect(() => {
    if (!moviendo) return;
    const cont = contenido.current;
    const mover = (e: PointerEvent) => {
      if (!cont) return;
      const base = cont.getBoundingClientRect();
      const x = Math.max(0, e.clientX - base.left - moviendo.dx);
      const y = Math.max(0, e.clientY - base.top - moviendo.dy);
      setPosiciones((p) => ({ ...p, [moviendo.id]: { x, y } }));
    };
    const soltar = () => {
      setMoviendo(null);
      setPosiciones((p) => {
        try {
          localStorage.setItem(CLAVE_POS, JSON.stringify(p));
        } catch {}
        return p;
      });
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
  }, [moviendo, CLAVE_POS]);

  const registrar = useCallback((id: string, el: HTMLElement | null) => {
    if (el) puntos.current.set(id, el);
    else puntos.current.delete(id);
  }, []);

  // Un renglón por fusión, sin repetirla: cada empalme toca dos hilos.
  const lineas: { a: string; b: string; color: string; fusion: string }[] = [];
  const vistas = new Set<string>();
  for (const h of hilos) {
    if (!h.fusion_id || !h.par_id || vistas.has(h.fusion_id)) continue;
    vistas.add(h.fusion_id);
    lineas.push({
      a: h.hilo_id,
      b: h.par_id,
      color: COLOR_HILO[h.color] ?? '#64748b',
      fusion: h.fusion_id,
    });
  }

  const porCable = new Map<string, HiloEnCaja[]>();
  for (const h of hilos) {
    if (!porCable.has(h.cable_id)) porCable.set(h.cable_id, []);
    porCable.get(h.cable_id)!.push(h);
  }

  const empalmados = lineas.length;
  const libres = hilos.filter((h) => !h.viene_de && !h.va_a).length;

  // Las NAP se dibujan como cajita simple; los splitters, como tarjeta con
  // entrada y salidas (más abajo). Los splitters siguen en `destinos` solo para
  // que arrastrar un hilo a su entrada los encuentre como destino de fusión.
  const naps = destinos.filter((d) => d.que === 'nap');

  const puntoDe = (id: string) => medidas.get(id);

  // La punta del hilo que se está arrastrando, en coordenadas del lienzo interno.
  let cursor: { x: number; y: number } | null = null;
  if (arrastre && contenido.current) {
    const base = contenido.current.getBoundingClientRect();
    cursor = { x: arrastre.x - base.left, y: arrastre.y - base.top };
  }

  return (
    <div>
      {recado && (
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            recado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
          }`}
        >
          {recado.ok ? '✓ ' : '⚠ '}
          {recado.mensaje}
        </p>
      )}

      <Tarjeta
        titulo={`${caja.code}${caja.name ? ` · ${caja.name}` : ''}`}
        descripcion={`${cables.length} cables · ${hilos.length} hilos · ${empalmados} empalmes · ${libres} hilos sin usar`}
        acciones={
          <div className="flex flex-wrap gap-2">
            <Boton
              variante="secundario"
              className="px-3 py-1.5 text-xs"
              onClick={() => setSoloLibres((v) => !v)}
            >
              {soloLibres ? 'Ver todos los hilos' : 'Ver solo los libres'}
            </Boton>
            <Boton
              variante="secundario"
              className="px-3 py-1.5 text-xs"
              onClick={() => setAgregando(true)}
            >
              Agregar cable al dibujo
            </Boton>
            <Boton variante="secundario" className="px-3 py-1.5 text-xs" onClick={reacomodar}>
              Reacomodar
            </Boton>
            <Boton
              variante="secundario"
              className="px-3 py-1.5 text-xs"
              onClick={exportarImagen}
              cargando={exportando}
            >
              🖼️ Descargar imagen
            </Boton>
            <a
              href={`/red/ftth/caja/${caja.id}/fusiones.xlsx`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-marino-200 bg-white px-3 py-1.5 text-xs font-medium text-marino-700 transition-colors hover:bg-marino-50"
            >
              ⬇ Excel de fusiones
            </a>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <p className="max-w-3xl text-xs text-marino-400">
            Arrastra del punto de un hilo al punto de otro para empalmarlos. La base decide sola
            cuál alimenta a cuál: el que ya trae luz. Toca la etiqueta de un empalme para soltarlo.{' '}
            <strong className="text-marino-500">Splitter:</strong> arrastra un hilo a su{' '}
            <em>entrada</em> para alimentarlo, y arrastra cada <em>salida</em> (●) a una NAP o a un
            hilo. <strong className="text-marino-500">Acomodar:</strong> arrastra el{' '}
            <em>encabezado</em> de una tarjeta para moverla; el acomodo se guarda solo.
          </p>
          <EditarSplitter cajas={[]} cajaFija={{ id: caja.id, code: caja.code, tipo: caja.tipo }} />
        </div>

        <div
          ref={lienzo}
          className="relative overflow-auto rounded-lg border border-marino-100 bg-marino-50/60 p-4"
          style={{ maxHeight: '42rem' }}
        >
          <div
            ref={contenido}
            className="relative"
            style={{ width: tam.w, height: tam.h, minWidth: '100%' }}
          >
            {/* las líneas van detrás de las tarjetas */}
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={tam.w}
              height={tam.h}
              style={{ zIndex: 1 }}
            >
              {lineas.map((l) => {
                const a = puntoDe(l.a);
                const b = puntoDe(l.b);
                if (!a || !b) return null;
                const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
                return (
                  <path
                    key={l.fusion}
                    d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={2.5}
                    opacity={0.85}
                  />
                );
              })}
              {conexiones.map((c, i) => {
                const a = puntoDe(c.desde);
                const b = puntoDe(c.hasta);
                if (!a || !b) return null;
                const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
                return (
                  <path
                    key={`cx-${i}`}
                    d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                    fill="none"
                    stroke={c.color ? (COLOR_HILO[c.color] ?? '#64748b') : '#0fb5ad'}
                    strokeWidth={2.5}
                    opacity={0.85}
                  />
                );
              })}
              {arrastre &&
                cursor &&
                (() => {
                  const a = puntoDe(arrastre.desde);
                  if (!a) return null;
                  return (
                    <path
                      d={`M ${a.x} ${a.y} L ${cursor.x} ${cursor.y}`}
                      fill="none"
                      stroke={arrastre.sobre ? '#1a9e3e' : '#94a3b8'}
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                    />
                  );
                })()}
            </svg>

            {cables.length === 0 && (
              <p className="absolute left-4 top-4 text-sm text-marino-400">
                Esta caja todavía no tiene cables. Trázalos en el mapa, o agrégalos al dibujo con el
                botón de arriba.
              </p>
            )}

            {cables.map((c) => {
              const pos = posDe(`cable:${c.cable_id}`);
              return (
                <div
                  key={c.cable_id}
                  ref={(el) => registrarNodo(`cable:${c.cable_id}`, el)}
                  className="absolute"
                  style={{ left: pos.x, top: pos.y, zIndex: 2 }}
                >
                  <TarjetaCable
                    cable={c}
                    hilos={(porCable.get(c.cable_id) ?? []).filter(
                      (h) => !soloLibres || (!h.viene_de && !h.va_a),
                    )}
                    registrar={registrar}
                    arrastre={arrastre}
                    guardando={guardando}
                    onMover={(e) => empezarMover(`cable:${c.cable_id}`, e)}
                    onEmpezarArrastre={(id, e) =>
                      setArrastre({ desde: id, x: e.clientX, y: e.clientY, sobre: null })
                    }
                    onSoltarEmpalme={(id) => empezar(async () => aplicar(await soltarEmpalme(id)))}
                    onQuitar={() =>
                      empezar(async () => aplicar(await soltarCableDeCaja(caja.id, c.cable_id)))
                    }
                  />
                </div>
              );
            })}

            {naps.map((d) => {
              const pos = posDe(`nap:${d.id}`);
              return (
                <div
                  key={d.id}
                  ref={(el) => registrarNodo(`nap:${d.id}`, el)}
                  className="absolute w-52"
                  style={{ left: pos.x, top: pos.y, zIndex: 2 }}
                >
                  <div
                    onPointerDown={(e) => empezarMover(`nap:${d.id}`, e)}
                    className="cursor-grab rounded-t-lg bg-green-600 px-3 py-1 text-center text-[10px] font-semibold text-white active:cursor-grabbing"
                  >
                    ⤢ {d.code}
                  </div>
                  <div
                    data-punto={d.id}
                    ref={(el) => registrar(d.id, el)}
                    className={`rounded-b-lg border-2 border-t-0 bg-white px-3 py-2.5 text-center shadow-sm transition-colors ${
                      arrastre?.sobre === d.id
                        ? 'border-green-500 bg-green-50'
                        : arrastre
                          ? 'border-dashed border-green-300'
                          : 'border-marino-200'
                    }`}
                  >
                    <p className="text-sm font-semibold text-marino-800">📡 {d.code}</p>
                    <p className="mt-0.5 text-[11px] text-marino-400">Caja NAP</p>
                    <p
                      className={`mt-1 text-[11px] font-medium ${
                        d.alimentado ? 'text-exito' : 'text-aviso'
                      }`}
                    >
                      {d.alimentado ? '✓ alimentado' : '⚠ sin alimentar'}
                    </p>
                  </div>
                </div>
              );
            })}

            {splitters.map((s) => {
              const pos = posDe(`spl:${s.splitter.id}`);
              return (
                <div
                  key={s.splitter.id}
                  ref={(el) => registrarNodo(`spl:${s.splitter.id}`, el)}
                  className="absolute w-56"
                  style={{ left: pos.x, top: pos.y, zIndex: 2 }}
                >
                  <TarjetaSplitter
                    caja={caja}
                    sp={s}
                    registrar={registrar}
                    arrastre={arrastre}
                    guardando={guardando}
                    onMover={(e) => empezarMover(`spl:${s.splitter.id}`, e)}
                    onEmpezarArrastreSalida={(id, e) =>
                      setArrastre({ desde: 'sal:' + id, x: e.clientX, y: e.clientY, sobre: null })
                    }
                    onSoltarSalida={(id) => empezar(async () => aplicar(await soltarSalida(id)))}
                    onSoltarEntrada={() =>
                      empezar(async () => aplicar(await soltarEntradaSplitter(s.splitter.id)))
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg bg-marino-50 px-3 py-2 text-[11px] text-marino-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-marino-300 bg-white" />
            hilo libre
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            empalmado aquí
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            en servicio
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono">✂️</span>
            cortado en esta caja
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono">▶</span>a dónde va ·<span className="font-mono">◀</span>de
            dónde viene
          </span>
        </div>
      </Tarjeta>

      {agregando && (
        <Agregar
          caja={caja.id}
          disponibles={disponibles.filter((d) => !cables.some((c) => c.cable_id === d.id))}
          onCerrar={() => setAgregando(false)}
          onListo={(r) => {
            aplicar(r);
            if (r.ok) setAgregando(false);
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────── tarjeta cable
function TarjetaCable({
  cable,
  hilos,
  registrar,
  arrastre,
  guardando,
  onEmpezarArrastre,
  onSoltarEmpalme,
  onQuitar,
  onMover,
}: {
  cable: CableEnCaja;
  hilos: HiloEnCaja[];
  registrar: (id: string, el: HTMLElement | null) => void;
  arrastre: { desde: string; sobre: string | null } | null;
  guardando: boolean;
  onEmpezarArrastre: (id: string, e: React.PointerEvent) => void;
  onSoltarEmpalme: (id: string) => void;
  onQuitar: () => void;
  onMover: (e: React.PointerEvent) => void;
}) {
  const papel = PAPEL_CABLE[cable.papel] ?? PAPEL_CABLE.pasa;
  let tuboAnterior: number | null = null;

  return (
    <div className="w-64 shrink-0 rounded-lg border border-marino-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 rounded-t-lg bg-marino-700 px-3 py-2">
        <span
          onPointerDown={onMover}
          title="Arrástrame para mover esta tarjeta"
          className="min-w-0 flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
        >
          <span className="block truncate font-mono text-xs font-semibold text-white">
            {cable.codigo}
          </span>
          <span className="block text-[10px] text-marino-200">
            {papel.icono} {papel.texto} · {cable.hilos} hilos
          </span>
        </span>
        {cable.papel === 'pasa' && (
          <button
            type="button"
            title="Quitar este cable del dibujo (el cable no se borra)"
            disabled={guardando}
            onClick={onQuitar}
            className="shrink-0 text-marino-300 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto py-1">
        {hilos.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] text-marino-400">
            Ningún hilo de este cable está libre.
          </p>
        ) : (
          hilos.map((h) => {
            const nuevoTubo = h.tubo !== null && h.tubo !== tuboAnterior;
            if (nuevoTubo) tuboAnterior = h.tubo;
            const est = ESTADO_HILO[h.estado] ?? ESTADO_HILO.sin_identificar;
            const ocupado = !!(h.viene_de || h.va_a);
            const destacado = arrastre?.sobre === h.hilo_id;

            return (
              <div key={h.hilo_id}>
                {nuevoTubo && (
                  <p className="bg-marino-50 px-3 py-0.5 text-[10px] font-semibold text-marino-500">
                    Tubo {h.tubo}
                  </p>
                )}
                <div
                  className={`flex items-center gap-1.5 px-1.5 py-1 ${
                    destacado ? 'bg-green-50' : ''
                  }`}
                >
                  <button
                    type="button"
                    data-punto={h.hilo_id}
                    ref={(el) => registrar(h.hilo_id, el)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onEmpezarArrastre(h.hilo_id, e);
                    }}
                    title={[
                      `${cable.codigo} · hilo ${h.numero} (${h.color})`,
                      h.viene_de ? `Viene de ${h.viene_de}` : 'Sin alimentar',
                      h.va_a ? `Va a ${h.va_a}` : 'Sin destino',
                      h.cortado_aqui ? 'Cortado en esta caja' : null,
                    ]
                      .filter(Boolean)
                      .join('\n')}
                    className={`h-4 w-4 shrink-0 cursor-grab rounded-full border-2 transition-transform active:cursor-grabbing ${
                      destacado ? 'scale-125' : ''
                    }`}
                    style={{
                      borderColor: COLOR_HILO[h.color] ?? '#64748b',
                      background: ocupado ? (COLOR_HILO[h.color] ?? '#64748b') : '#fff',
                    }}
                  />
                  <span className="w-5 shrink-0 text-right font-mono text-[11px] font-semibold text-marino-700">
                    {h.numero}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-marino-600">
                    {h.color}
                  </span>
                  {h.cortado_aqui && (
                    <span className="shrink-0 text-[10px]" title="Cortado en esta caja">
                      ✂️
                    </span>
                  )}
                  <span className={`shrink-0 text-[9.5px] ${TONO[est.tono]}`}>{est.texto}</span>
                </div>

                {(h.viene_de || h.va_a) && (
                  <div className="flex flex-col gap-0.5 px-1.5 pb-1 pl-7 text-[9.5px] leading-tight text-marino-400">
                    {h.viene_de && <span className="truncate">◀ {h.viene_de}</span>}
                    {h.fusion_id && h.par_texto ? (
                      <button
                        type="button"
                        disabled={guardando}
                        onClick={() => onSoltarEmpalme(h.fusion_id!)}
                        title="Soltar este empalme"
                        className="truncate text-left font-semibold text-marino-500 hover:text-falla"
                      >
                        ▶ {h.par_texto} · soltar
                      </button>
                    ) : (
                      h.va_a && <span className="truncate font-semibold">▶ {h.va_a}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const TONO: Record<string, string> = {
  ok: 'text-exito',
  marca: 'text-naranja-600',
  aviso: 'text-aviso',
  falla: 'text-falla',
  neutro: 'text-marino-400',
};

// ─────────────────────────────────────────────────────── tarjeta de splitter
/**
 * El splitter dentro de la caja, como el técnico lo ve: una tarjeta con un
 * punto de ENTRADA (se le arrastra un hilo para alimentarlo) y un punto por
 * cada SALIDA (se arrastra a una NAP o a un hilo). Nada de menús: todo se
 * conecta jalando, igual que la fusionadora.
 */
function TarjetaSplitter({
  caja,
  sp,
  registrar,
  arrastre,
  guardando,
  onEmpezarArrastreSalida,
  onSoltarSalida,
  onSoltarEntrada,
  onMover,
}: {
  caja: { id: string; code: string; tipo: string };
  sp: SplitterEnCaja;
  registrar: (id: string, el: HTMLElement | null) => void;
  arrastre: { desde: string; sobre: string | null } | null;
  guardando: boolean;
  onEmpezarArrastreSalida: (salidaId: string, e: React.PointerEvent) => void;
  onSoltarSalida: (salidaId: string) => void;
  onSoltarEntrada: () => void;
  onMover: (e: React.PointerEvent) => void;
}) {
  const s = sp.splitter;
  const arrastrandoHilo = !!arrastre && !arrastre.desde.startsWith('sal:');
  const entradaActiva = arrastre?.sobre === s.id;

  return (
    <div className="rounded-lg border-2 border-marino-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 rounded-t-lg bg-marino-100 px-2.5 py-1.5">
        <span
          onPointerDown={onMover}
          title="Arrástrame para mover el splitter"
          className="min-w-0 flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
        >
          <span className="block truncate font-mono text-xs font-semibold text-marino-800">
            🔱 {s.code}
          </span>
          <span className="block text-[10px] text-marino-500">
            {s.ratio} · {s.libres} libres
          </span>
        </span>
        <EditarSplitter
          cajas={[]}
          cajaFija={{ id: caja.id, code: caja.code, tipo: caja.tipo }}
          splitter={s}
        />
        <Borrar tipo="splitter" id={s.id} nombre={s.code} />
      </div>

      {/* entrada: se le suelta un hilo para alimentarlo */}
      <div
        data-punto={s.id}
        ref={(el) => registrar(s.id, el)}
        className={`m-1.5 rounded-md border px-2 py-1.5 text-center transition-colors ${
          entradaActiva
            ? 'border-green-500 bg-green-50'
            : arrastrandoHilo
              ? 'border-dashed border-green-300'
              : 'border-marino-200'
        }`}
      >
        <p className="text-[11px] font-semibold text-marino-700">Entrada</p>
        <p
          className={`text-[10px] ${s.entrada ? 'text-marino-400' : 'font-medium text-aviso'}`}
          title={s.entrada ?? undefined}
        >
          {s.entrada ? `◀ ${s.entrada}` : '⚠ sin alimentar'}
        </p>
        {s.entrada && (
          <button
            type="button"
            disabled={guardando}
            onClick={onSoltarEntrada}
            title="Soltar la entrada para alimentar el splitter desde otro hilo"
            className="mt-0.5 text-[9.5px] text-marino-300 hover:text-falla"
          >
            soltar entrada
          </button>
        )}
      </div>

      {/* salidas: cada una se arrastra a una NAP o a un hilo */}
      <div className="px-1.5 pb-1.5">
        {sp.salidas.map((o) => {
          const soy = arrastre?.desde === 'sal:' + o.id;
          const danada = o.estado === 'danada';
          return (
            <div key={o.id} className="flex items-center gap-1.5 py-0.5">
              <span className="w-6 shrink-0 text-right font-mono text-[10px] font-semibold text-marino-600">
                S{o.numero}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-marino-500">
                {o.destino ? (
                  <span className="text-marino-700">▶ {o.destino}</span>
                ) : danada ? (
                  <span className="text-falla">dañada</span>
                ) : (
                  <span className="text-marino-300">libre</span>
                )}
              </span>
              {o.destino && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => onSoltarSalida(o.id)}
                  title="Soltar esta salida (queda disponible)"
                  className="shrink-0 text-[9.5px] text-marino-300 hover:text-falla"
                >
                  soltar
                </button>
              )}
              <button
                type="button"
                ref={(el) => registrar('sal:' + o.id, el)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onEmpezarArrastreSalida(o.id, e);
                }}
                title={`Salida ${o.numero}: arrástrala a una NAP o a un hilo`}
                className={`h-3.5 w-3.5 shrink-0 cursor-grab rounded-full border-2 border-naranja-500 transition-transform active:cursor-grabbing ${
                  soy ? 'scale-125 bg-naranja-500' : o.destino ? 'bg-naranja-500' : 'bg-white'
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── agregar cable
function Agregar({
  caja,
  disponibles,
  onCerrar,
  onListo,
}: {
  caja: string;
  disponibles: { id: string; code: string; hilos: number }[];
  onCerrar: () => void;
  onListo: (r: Respuesta) => void;
}) {
  const [cable, setCable] = useState(disponibles[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-marino-800/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold text-marino-800">Agregar un cable al dibujo</h2>
        <p className="mt-1 text-sm text-marino-400">
          Sirve para el cable que pasa de largo por la calle y del que se derivan hilos aquí. El
          cable no se mueve de su ruta: solo se dibuja a un costado de esta caja.
        </p>

        {disponibles.length === 0 ? (
          <p className="mt-4 rounded-lg bg-marino-50 px-3 py-2 text-sm text-marino-500">
            Todos los cables ya están en el dibujo, o todavía no hay ninguno trazado.
          </p>
        ) : (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-marino-600">Cable</span>
            <select
              value={cable}
              onChange={(e) => setCable(e.target.value)}
              className="mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none"
            >
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} ({c.hilos} hilos)
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Boton
            cargando={guardando}
            disabled={!cable}
            onClick={() =>
              empezar(async () => {
                const r = await engancharCable(caja, cable);
                if (!r.ok) setError(r.mensaje);
                else onListo(r);
              })
            }
          >
            Agregar al dibujo
          </Boton>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
        </div>
      </div>
    </div>
  );
}
