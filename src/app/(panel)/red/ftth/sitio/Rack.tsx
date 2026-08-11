'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import {
  desmontarDelRack,
  eliminarRack,
  guardarRack,
  montarEnRack,
  montarOdf,
  montarOlt,
  moverEnRack,
} from '@/modulos/red/acciones_rack';
import {
  ALTURAS_RACK,
  CONECTORES,
  ESTADOS,
  TIPOS_SUELTOS,
  estadoDe,
  tipoDe,
} from '@/modulos/red/rack_tipos';
import type { EquipoRack, Rack } from '@/modulos/red/racks';
import type { Respuesta } from '@/modulos/admin/acciones';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

/** Alto de una unidad, en píxeles. El zoom no hace otra cosa que mover esto. */
const U_MIN = 14;
const U_MAX = 44;

interface Props {
  /** Solo los gabinetes de la comunidad que se está viendo. */
  racks: Rack[];
  equipos: EquipoRack[];
  sitio: { id: string; name: string };
}

/**
 * El rack, de frente.
 *
 * La lista de equipos ya existía y no servía para lo que se necesita parado
 * enfrente del gabinete: saber si cabe la siguiente tarjeta, y en qué U está
 * la OLT que hay que reiniciar. Eso se ve, no se lee.
 *
 * Las unidades van numeradas desde el piso, como están impresas en el
 * gabinete de verdad: la 1 abajo. Se dibuja al revés de como se recorre un
 * arreglo, y vale la pena: si el dibujo numera al revés que el fierro, quien
 * lo use se equivoca de U una vez y ya no vuelve a confiar en la pantalla.
 */
export default function Rack({ racks, equipos, sitio }: Props) {
  const router = useRouter();
  const [elegido, setElegido] = useState<string | null>(racks[0]?.id ?? null);
  const [alto, setAlto] = useState(26);
  const [pantalla, setPantalla] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [recado, setRecado] = useState<Respuesta | null>(null);
  const [formulario, setFormulario] = useState<
    | null
    | { modo: 'olt'; en?: number }
    | { modo: 'odf'; en?: number }
    | { modo: 'nuevo'; kind: string; en?: number }
    | { modo: 'editar'; item: EquipoRack }
  >(null);
  const [rackForm, setRackForm] = useState<null | { rack: Rack | null }>(null);
  const [guardando, empezar] = useTransition();

  const rack = racks.find((r) => r.id === elegido) ?? null;
  const míos = useMemo(
    () => equipos.filter((e) => e.rack_id === elegido).sort((a, b) => b.position - a.position),
    [equipos, elegido],
  );
  const item = míos.find((e) => e.id === seleccion) ?? null;

  const aplicar = useCallback(
    (r: Respuesta) => {
      setRecado(r);
      if (r.ok) router.refresh();
    },
    [router],
  );

  // ── arrastrar ────────────────────────────────────────────────────────────
  // Se hace con eventos de puntero y no con «drag and drop» del navegador
  // porque así funciona igual con el dedo. Esta pantalla se abre en el
  // celular, dentro de la caseta, con el gabinete abierto enfrente.
  const [arrastre, setArrastre] = useState<null | {
    id: string;
    desdeY: number;
    origen: number;
    altura: number;
    destino: number;
  }>(null);
  useEffect(() => {
    if (!arrastre || !rack) return;

    const mover = (e: PointerEvent) => {
      const salto = Math.round((arrastre.desdeY - e.clientY) / alto);
      const tope = Math.max(1, rack.units - arrastre.altura + 1);
      const destino = Math.min(Math.max(arrastre.origen + salto, 1), tope);
      setArrastre((a) => (a && a.destino !== destino ? { ...a, destino } : a));
    };

    const soltar = () => {
      const a = arrastre;
      setArrastre(null);
      if (!a || a.destino === a.origen) return;
      empezar(async () => aplicar(await moverEnRack(a.id, a.destino)));
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
  }, [arrastre, alto, rack, aplicar]);

  /** Qué hay en cada unidad. Sirve para el hueco libre y para el choque. */
  const ocupacion = useMemo(() => {
    const m = new Map<number, EquipoRack>();
    for (const e of míos) for (let u = e.position; u <= e.hasta; u++) m.set(u, e);
    return m;
  }, [míos]);

  const choca = useMemo(() => {
    if (!arrastre) return false;
    for (let u = arrastre.destino; u < arrastre.destino + arrastre.altura; u++) {
      const o = ocupacion.get(u);
      if (o && o.id !== arrastre.id) return true;
    }
    return false;
  }, [arrastre, ocupacion]);

  /** El primer hueco de `n` unidades seguidas, de abajo hacia arriba. */
  const primerHueco = useCallback(
    (n: number) => {
      if (!rack) return 1;
      for (let u = 1; u <= rack.units - n + 1; u++) {
        let libre = true;
        for (let k = u; k < u + n; k++) if (ocupacion.has(k)) libre = false;
        if (libre) return u;
      }
      return 0;
    },
    [rack, ocupacion],
  );

  if (racks.length === 0) {
    return (
      <>
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">🗄️</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay ningún rack</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              El gabinete es lo primero que se atornilla en {sitio.name}. Dale de alta con su altura
              —6, 12, 24, 42 o 48 U— y de ahí se cuelga el ODF y la OLT.
            </p>
            <div className="mt-4">
              <Boton onClick={() => setRackForm({ rack: null })}>Nuevo rack</Boton>
            </div>
          </div>
        </Tarjeta>
        {rackForm && (
          <FormularioRack
            rack={rackForm.rack}
            sitio={sitio}
            onCerrar={() => setRackForm(null)}
            onListo={(r) => {
              aplicar(r);
              if (r.ok) setRackForm(null);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className={pantalla ? 'fixed inset-0 z-50 overflow-auto bg-marino-50 p-4' : ''}>
      {/* ── barra ───────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Gabinete</span>
          <select
            value={elegido ?? ''}
            onChange={(e) => {
              setElegido(e.target.value);
              setSeleccion(null);
            }}
            className={`${CAMPO} min-w-64`}
          >
            {racks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.units}U · {r.libres} libres
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-marino-200 bg-white px-2 py-1">
            <button
              type="button"
              aria-label="Alejar"
              onClick={() => setAlto((a) => Math.max(U_MIN, a - 4))}
              className="px-2 text-marino-500 hover:text-marino-800"
            >
              −
            </button>
            <span className="w-10 text-center text-xs text-marino-400">
              {Math.round((alto / 26) * 100)}%
            </span>
            <button
              type="button"
              aria-label="Acercar"
              onClick={() => setAlto((a) => Math.min(U_MAX, a + 4))}
              className="px-2 text-marino-500 hover:text-marino-800"
            >
              +
            </button>
          </div>
          <Boton variante="secundario" onClick={() => setPantalla((p) => !p)}>
            {pantalla ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </Boton>
          <Boton variante="secundario" onClick={() => setRackForm({ rack: null })}>
            Nuevo rack
          </Boton>
        </div>
      </div>

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

      {rack && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* ── el gabinete ──────────────────────────────────────────────── */}
          <Tarjeta
            titulo={`${rack.name} · ${rack.units}U`}
            descripcion={[rack.sitio, rack.location].filter(Boolean).join(' · ')}
            acciones={
              <div className="flex flex-wrap gap-2">
                <Boton
                  variante="secundario"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setFormulario({ modo: 'olt' })}
                >
                  Agregar OLT
                </Boton>
                <Boton
                  variante="secundario"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setFormulario({ modo: 'odf' })}
                >
                  Agregar ODF
                </Boton>
                <Boton
                  variante="secundario"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setFormulario({ modo: 'nuevo', kind: 'switch' })}
                >
                  Agregar equipo
                </Boton>
              </div>
            }
          >
            <Capacidad rack={rack} />

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {/* numeración */}
              <div className="shrink-0" style={{ width: 32 }}>
                {Array.from({ length: rack.units }, (_, i) => rack.units - i).map((u) => (
                  <div
                    key={u}
                    style={{ height: alto }}
                    className="flex items-center justify-end pr-1 font-mono text-[10px] leading-none text-marino-400"
                  >
                    {u}
                  </div>
                ))}
              </div>

              {/* el fierro */}
              <div
                className="relative min-w-72 flex-1 rounded-lg border-2 border-marino-300 bg-marino-50"
                style={{ height: rack.units * alto }}
              >
                {/* rieles: una línea por unidad */}
                {Array.from({ length: rack.units }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-t border-dashed border-marino-200"
                    style={{ top: i * alto }}
                  />
                ))}

                {/* huecos libres, con su «+» */}
                {Array.from({ length: rack.units }, (_, i) => rack.units - i)
                  .filter((u) => !ocupacion.has(u))
                  .map((u) => (
                    <button
                      key={u}
                      type="button"
                      title={`U${u} libre · montar algo aquí`}
                      onClick={() => setFormulario({ modo: 'nuevo', kind: 'switch', en: u })}
                      className="group absolute inset-x-1 flex cursor-pointer items-center justify-center rounded text-transparent transition-colors hover:bg-green-100/70 hover:text-exito"
                      style={{ top: (rack.units - u) * alto, height: alto }}
                    >
                      <span className="text-xs font-semibold">+ montar en la U{u}</span>
                    </button>
                  ))}

                {/* los equipos */}
                {míos.map((e) => {
                  const est = estadoDe(e.status);
                  const t = tipoDe(e.kind);
                  const moviendo = arrastre?.id === e.id;
                  const arriba = moviendo ? arrastre.destino + e.height - 1 : e.hasta;
                  return (
                    <div
                      key={e.id}
                      onPointerDown={(ev) => {
                        ev.preventDefault();
                        setSeleccion(e.id);
                        setArrastre({
                          id: e.id,
                          desdeY: ev.clientY,
                          origen: e.position,
                          altura: e.height,
                          destino: e.position,
                        });
                      }}
                      title={`${e.label} · U${e.position}${e.height > 1 ? `-U${e.hasta}` : ''} · ${est.rotulo}`}
                      className={`absolute inset-x-1 flex touch-none cursor-grab items-center gap-2 overflow-hidden rounded-md border px-2 shadow-sm transition-shadow active:cursor-grabbing ${est.caja} ${
                        seleccion === e.id ? 'ring-2 ring-naranja-400' : ''
                      } ${moviendo ? 'opacity-70 shadow-lg' : ''}`}
                      style={{
                        top: (rack.units - arriba) * alto + 1,
                        height: e.height * alto - 2,
                        zIndex: moviendo ? 20 : 10,
                      }}
                    >
                      <span className="shrink-0 text-sm leading-none">{t.icono}</span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-xs font-semibold leading-tight ${est.texto}`}
                        >
                          {e.label}
                        </span>
                        {alto >= 22 && (
                          <span className="block truncate text-[10px] leading-tight text-marino-400">
                            {[e.vendor, e.model].filter(Boolean).join(' ') || t.rotulo} · U
                            {e.position}
                            {e.height > 1 ? `-U${e.hasta}` : ''}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 font-mono text-[11px] ${est.texto}`}
                        title={est.rotulo}
                      >
                        {est.icono}
                      </span>
                    </div>
                  );
                })}

                {/* dónde caería */}
                {arrastre && (
                  <div
                    className={`pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed ${
                      choca ? 'border-red-400 bg-red-100/50' : 'border-green-500 bg-green-100/50'
                    }`}
                    style={{
                      top: (rack.units - (arrastre.destino + arrastre.altura - 1)) * alto,
                      height: arrastre.altura * alto,
                      zIndex: 30,
                    }}
                  >
                    <span
                      className={`absolute right-1 top-0 font-mono text-[10px] ${
                        choca ? 'text-falla' : 'text-exito'
                      }`}
                    >
                      {choca ? '⚠ ocupada' : `U${arrastre.destino}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-2 text-xs text-marino-400">
              Arrastra un equipo para cambiarlo de unidad; se acomoda solo a la U más cercana. Las
              unidades van numeradas desde el piso, como en la etiqueta del gabinete.
            </p>

            <Leyenda />
          </Tarjeta>

          {/* ── propiedades ──────────────────────────────────────────────── */}
          <div className="space-y-4">
            <Propiedades
              item={item}
              rack={rack}
              ocupacion={ocupacion}
              guardando={guardando}
              onEditar={() => item && setFormulario({ modo: 'editar', item })}
              onDuplicar={() => {
                if (!item) return;
                const u = primerHueco(item.height);
                if (u === 0) {
                  setRecado({
                    ok: false,
                    mensaje: `No quedan ${item.height} unidades seguidas libres en ${rack.name}.`,
                  });
                  return;
                }
                setFormulario({
                  modo: 'nuevo',
                  kind: item.kind,
                  en: u,
                });
              }}
              onMover={(u) => item && empezar(async () => aplicar(await moverEnRack(item.id, u)))}
              onBajar={(forzar) =>
                item &&
                empezar(async () => {
                  const r = await desmontarDelRack(item.id, forzar);
                  aplicar(r);
                  if (r.ok) setSeleccion(null);
                })
              }
            />

            <Tarjeta titulo="El gabinete">
              <dl className="space-y-1.5 text-sm">
                <Dato que="Sitio" dato={rack.sitio} />
                <Dato que="Lugar" dato={rack.location ?? '—'} />
                <Dato que="Altura" dato={`${rack.units} U`} />
                <Dato que="Equipos" dato={String(rack.equipos)} />
                <Dato que="Unidades libres" dato={`${rack.libres} de ${rack.units}`} />
              </dl>
              {rack.notes && <p className="mt-2 text-xs text-marino-500">{rack.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Boton
                  variante="secundario"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setRackForm({ rack })}
                >
                  Editar rack
                </Boton>
                <Boton
                  variante="texto"
                  className="px-3 py-1.5 text-xs"
                  disabled={guardando}
                  onClick={() => empezar(async () => aplicar(await eliminarRack(rack.id)))}
                >
                  Borrar rack
                </Boton>
              </div>
            </Tarjeta>
          </div>
        </div>
      )}

      {formulario?.modo === 'olt' && rack && (
        <FormularioOlt
          rack={rack}
          sugerida={formulario.en ?? (primerHueco(2) || 1)}
          onCerrar={() => setFormulario(null)}
          onListo={(r) => {
            aplicar(r);
            if (r.ok) setFormulario(null);
          }}
        />
      )}

      {formulario?.modo === 'odf' && rack && (
        <FormularioOdf
          rack={rack}
          sugerida={formulario.en ?? (primerHueco(1) || 1)}
          onCerrar={() => setFormulario(null)}
          onListo={(r) => {
            aplicar(r);
            if (r.ok) setFormulario(null);
          }}
        />
      )}

      {(formulario?.modo === 'nuevo' || formulario?.modo === 'editar') && rack && (
        <FormularioEquipo
          rack={rack}
          formulario={formulario}
          sugerida={
            formulario.modo === 'nuevo'
              ? (formulario.en ?? (primerHueco(tipoDe(formulario.kind).altura) || 1))
              : formulario.item.position
          }
          onCerrar={() => setFormulario(null)}
          onListo={(r) => {
            aplicar(r);
            if (r.ok) setFormulario(null);
          }}
        />
      )}

      {rackForm && (
        <FormularioRack
          rack={rackForm.rack}
          sitio={sitio}
          onCerrar={() => setRackForm(null)}
          onListo={(r) => {
            aplicar(r);
            if (r.ok) setRackForm(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── capacidad
function Capacidad({ rack }: { rack: Rack }) {
  const pct = rack.units === 0 ? 0 : Math.round((rack.ocupadas / rack.units) * 100);
  const tono = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-marino-600">
          {rack.ocupadas} de {rack.units} U ocupadas
        </span>
        <span className={pct >= 90 ? 'text-falla' : 'text-marino-400'}>
          {rack.libres} libres · {pct}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-marino-100">
        <div className={`h-full ${tono}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── leyenda
function Leyenda() {
  return (
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg bg-marino-50 px-3 py-2">
      {ESTADOS.map((e) => (
        <span
          key={e.clave}
          className="inline-flex items-center gap-1.5 text-[11px] text-marino-500"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${e.punto}`} aria-hidden="true" />
          <span className="font-mono" aria-hidden="true">
            {e.icono}
          </span>
          {e.rotulo}
        </span>
      ))}
    </div>
  );
}

function Dato({ que, dato }: { que: string; dato: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-marino-400">{que}</dt>
      <dd className="text-right font-medium text-marino-700">{dato}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── propiedades
function Propiedades({
  item,
  rack,
  ocupacion,
  guardando,
  onEditar,
  onDuplicar,
  onMover,
  onBajar,
}: {
  item: EquipoRack | null;
  rack: Rack;
  ocupacion: Map<number, EquipoRack>;
  guardando: boolean;
  onEditar: () => void;
  onDuplicar: () => void;
  onMover: (u: number) => void;
  onBajar: (forzar: boolean) => void;
}) {
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => setConfirmar(false), [item?.id]);

  if (!item) {
    return (
      <Tarjeta titulo="El equipo">
        <p className="py-6 text-center text-sm text-marino-400">
          Toca un equipo del gabinete para ver sus datos, moverlo o bajarlo.
        </p>
      </Tarjeta>
    );
  }

  const est = estadoDe(item.status);
  const t = tipoDe(item.kind);
  const libre = (u: number) => {
    if (u < 1 || u + item.height - 1 > rack.units) return false;
    for (let k = u; k < u + item.height; k++) {
      const o = ocupacion.get(k);
      if (o && o.id !== item.id) return false;
    }
    return true;
  };
  const conectado = item.kind === 'olt' ? item.pon_patcheados : item.puertos_odf - item.odf_libres;

  return (
    <Tarjeta titulo={`${t.icono} ${item.label}`} descripcion={t.rotulo}>
      <p className={`mb-3 inline-flex items-center gap-1.5 text-xs font-medium ${est.texto}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${est.punto}`} aria-hidden="true" />
        <span className="font-mono" aria-hidden="true">
          {est.icono}
        </span>
        {est.rotulo}
      </p>

      <dl className="space-y-1.5 text-sm">
        <Dato
          que="Unidades"
          dato={`U${item.position}${item.height > 1 ? `–U${item.hasta}` : ''} (${item.height}U)`}
        />
        <Dato
          que="Marca y modelo"
          dato={[item.vendor, item.model].filter(Boolean).join(' ') || '—'}
        />
        <Dato que="Número de serie" dato={item.serial ?? '—'} />
        <Dato que="IP de gestión" dato={item.mgmt_ip ?? '—'} />
        <Dato que="Instalado" dato={item.installed_at ?? '—'} />
        <Dato que="Responsable" dato={item.responsable ?? '—'} />
        {item.kind === 'olt' && (
          <>
            <Dato que="Tarjetas" dato={String(item.tarjetas)} />
            <Dato
              que="Puertos PON"
              dato={`${item.pon_patcheados} de ${item.puertos_pon} patcheados`}
            />
          </>
        )}
        {item.kind === 'odf' && (
          <Dato
            que="Puertos"
            dato={`${item.puertos_odf - item.odf_libres} de ${item.puertos_odf} ocupados`}
          />
        )}
      </dl>

      {item.notes && <p className="mt-2 text-xs text-marino-500">{item.notes}</p>}

      <div className="mt-3 flex items-center gap-1">
        <span className="mr-1 text-xs text-marino-400">Mover</span>
        <Boton
          variante="secundario"
          className="px-2 py-1 text-xs"
          disabled={guardando || !libre(item.position + 1)}
          onClick={() => onMover(item.position + 1)}
        >
          ↑ subir
        </Boton>
        <Boton
          variante="secundario"
          className="px-2 py-1 text-xs"
          disabled={guardando || !libre(item.position - 1)}
          onClick={() => onMover(item.position - 1)}
        >
          ↓ bajar
        </Boton>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Boton variante="secundario" className="px-3 py-1.5 text-xs" onClick={onEditar}>
          Editar
        </Boton>
        <Boton variante="secundario" className="px-3 py-1.5 text-xs" onClick={onDuplicar}>
          Duplicar
        </Boton>
        {!confirmar ? (
          <Boton
            variante="texto"
            className="px-3 py-1.5 text-xs"
            onClick={() => (conectado > 0 ? setConfirmar(true) : onBajar(false))}
          >
            Bajar del rack
          </Boton>
        ) : null}
      </div>

      {confirmar && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-aviso">
          <p>
            <strong>{item.label}</strong> trae {conectado}{' '}
            {item.kind === 'olt' ? 'puertos PON patcheados' : 'puertos con fibra'}. Si lo bajas del
            rack sale del dibujo, pero sus puertos y su patcheo se quedan como están: hay que
            revisarlos aparte.
          </p>
          <div className="mt-2 flex gap-2">
            <Boton
              variante="oscuro"
              className="px-3 py-1.5 text-xs"
              disabled={guardando}
              onClick={() => onBajar(true)}
            >
              Sí, bajarlo
            </Boton>
            <Boton
              variante="secundario"
              className="px-3 py-1.5 text-xs"
              onClick={() => setConfirmar(false)}
            >
              Mejor no
            </Boton>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

// ────────────────────────────────────────────────────────── formulario rack
function FormularioRack({
  rack,
  sitio,
  onCerrar,
  onListo,
}: {
  rack: Rack | null;
  /** La comunidad ya está elegida arriba: aquí no se vuelve a preguntar. */
  sitio: { id: string; name: string };
  onCerrar: () => void;
  onListo: (r: Respuesta) => void;
}) {
  const [nombre, setNombre] = useState(rack?.name ?? 'Rack A');
  const [units, setUnits] = useState(rack?.units ?? 42);
  const [lugar, setLugar] = useState(rack?.location ?? '');
  const [notas, setNotas] = useState(rack?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  return (
    <Panel
      titulo={rack ? `Editar ${rack.name}` : `Un gabinete nuevo en ${sitio.name}`}
      onCerrar={onCerrar}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Rack A"
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Altura en unidades</span>
          <select
            value={units}
            onChange={(e) => setUnits(Number(e.target.value))}
            className={CAMPO}
          >
            {ALTURAS_RACK.map((n) => (
              <option key={n} value={n}>
                {n} U
              </option>
            ))}
            {!ALTURAS_RACK.includes(units) && <option value={units}>{units} U</option>}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Dónde está</span>
          <input
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            placeholder="Pared norte de la caseta"
            className={CAMPO}
          />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-marino-600">Observaciones</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className={CAMPO}
        />
      </label>

      {rack && (
        <p className="mt-2 rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
          Si le bajas la altura y algún equipo quedaría fuera, no se guarda: primero hay que bajarlo
          de lugar.
        </p>
      )}

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Boton
          cargando={guardando}
          disabled={nombre.trim().length < 1}
          onClick={() =>
            empezar(async () => {
              const r = await guardarRack({
                id: rack?.id ?? null,
                sitio: rack ? null : sitio.id,
                nombre: nombre.trim(),
                units,
                lugar: lugar.trim() || null,
                notas: notas.trim() || null,
              });
              if (!r.ok) setError(r.mensaje);
              else onListo(r);
            })
          }
        >
          Guardar diseño
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────── formulario OLT
/**
 * La OLT se da de alta aquí, no en otra pantalla.
 *
 * Antes había que pasar por Equipos para crearla, volver al rack para
 * ubicarla, y acordarse de abrirle las tarjetas. Tres pantallas para una sola
 * cosa que en campo es un solo movimiento: atornillarla y prenderla. Quien
 * captura así se salta un paso tarde o temprano, y lo que queda es una OLT
 * que no aparece en ningún gabinete.
 *
 * El sitio no se pregunta: sale del rack. Un rack vive dentro de un sitio, y
 * volver a preguntarlo solo abre la puerta a que no coincidan.
 */
function FormularioOlt({
  rack,
  sugerida,
  onCerrar,
  onListo,
}: {
  rack: Rack;
  sugerida: number;
  onCerrar: () => void;
  onListo: (r: Respuesta) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [serie, setSerie] = useState('');
  const [ip, setIp] = useState('');
  const [position, setPosition] = useState(sugerida);
  const [height, setHeight] = useState(2);
  const [tarjetas, setTarjetas] = useState(1);
  const [puertos, setPuertos] = useState(8);
  const [tipoTarjeta, setTipoTarjeta] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const tope = Math.max(1, rack.units - height + 1);
  const fuera = position + height - 1 > rack.units;

  return (
    <Panel titulo={`Agregar una OLT a ${rack.name}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-marino-400">
        Queda dada de alta en <strong>{rack.sitio}</strong>, montada en su unidad y con sus tarjetas
        abiertas. No hay que pasar por ninguna otra pantalla.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-marino-600">Nombre de la OLT</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="OLT-CUE-01"
            className={`${CAMPO} font-mono`}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">IP de gestión</span>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="10.10.0.2"
            className={`${CAMPO} font-mono`}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-marino-600">Marca</span>
          <input
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            placeholder="Huawei"
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Modelo</span>
          <input
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="EA5800"
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Número de serie</span>
          <input
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            className={`${CAMPO} font-mono`}
          />
        </label>
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-marino-400">
        Dónde va en el gabinete
      </p>
      <div className="mt-1 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Unidad donde empieza</span>
          <input
            type="number"
            min={1}
            max={tope}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Cuántas U ocupa</span>
          <input
            type="number"
            min={1}
            max={20}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className={CAMPO}
          />
        </label>
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-marino-400">
        Las tarjetas que trae
      </p>
      <div className="mt-1 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Cuántas tarjetas</span>
          <input
            type="number"
            min={0}
            max={20}
            value={tarjetas}
            onChange={(e) => setTarjetas(Number(e.target.value))}
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Puertos PON por tarjeta</span>
          <select
            value={puertos}
            onChange={(e) => setPuertos(Number(e.target.value))}
            className={CAMPO}
          >
            {[4, 8, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Tipo de tarjeta</span>
          <input
            value={tipoTarjeta}
            onChange={(e) => setTipoTarjeta(e.target.value)}
            placeholder="GPON 8"
            className={CAMPO}
          />
        </label>
      </div>

      <p className="mt-2 rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
        {tarjetas > 0 ? (
          <>
            Va a nacer con <strong>{tarjetas * puertos} puertos PON</strong> numerados como en el
            chasis. Después se le agregan más tarjetas desde aquí mismo.
          </>
        ) : (
          <>
            Sin tarjetas no tiene un solo puerto PON, así que todavía no se le puede patchear el ODF
            ni colgar un cliente. Se le pueden agregar después.
          </>
        )}
      </p>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-marino-600">Observaciones</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className={CAMPO}
        />
      </label>

      <p className="mt-2 rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
        La IP de gestión sirve para llegar al equipo. El usuario y la contraseña de la OLT no van
        aquí ni en ningún otro lado del sistema.
      </p>

      {fuera && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-aviso">
          Así se sale del gabinete: empieza en la U{tope} o más abajo.
        </p>
      )}
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Boton
          cargando={guardando}
          disabled={nombre.trim().length < 2 || fuera}
          onClick={() =>
            empezar(async () => {
              const r = await montarOlt({
                rack: rack.id,
                nombre: nombre.trim(),
                marca: marca.trim() || null,
                modelo: modelo.trim() || null,
                serie: serie.trim() || null,
                ip: ip.trim() || null,
                position,
                height,
                tarjetas,
                puertos,
                tipoTarjeta: tipoTarjeta.trim() || null,
                notas: notas.trim() || null,
              });
              if (!r.ok) setError(r.mensaje);
              else onListo(r);
            })
          }
        >
          Dar de alta y montar
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────── formulario ODF
/**
 * El ODF nace con sus bandejas abiertas.
 *
 * Un ODF sin puertos no tiene de dónde salga el cable a la calle, y la ruta
 * del cliente queda cortada en la caseta sin que nada avise. Es exactamente lo
 * que pasó con el ODF 002 de Pedriceña: existe desde hace meses, sin sitio y
 * sin una sola bandeja.
 */
function FormularioOdf({
  rack,
  sugerida,
  onCerrar,
  onListo,
}: {
  rack: Rack;
  sugerida: number;
  onCerrar: () => void;
  onListo: (r: Respuesta) => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [position, setPosition] = useState(sugerida);
  const [height, setHeight] = useState(1);
  const [bandejas, setBandejas] = useState(1);
  const [porBandeja, setPorBandeja] = useState(12);
  const [conector, setConector] = useState('SC/APC');
  const [serie, setSerie] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const tope = Math.max(1, rack.units - height + 1);
  const fuera = position + height - 1 > rack.units;

  return (
    <Panel titulo={`Agregar un ODF a ${rack.name}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-marino-400">
        Queda dado de alta en <strong>{rack.sitio}</strong>, con sus bandejas abiertas y montado en
        su unidad.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Código</span>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="ODF-CUE-01"
            className={`${CAMPO} font-mono`}
            autoFocus
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-marino-600">Nombre o referencia</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={`ODF de ${rack.sitio}`}
            className={CAMPO}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-marino-600">Cuántas bandejas</span>
          <input
            type="number"
            min={0}
            max={20}
            value={bandejas}
            onChange={(e) => setBandejas(Number(e.target.value))}
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Puertos por bandeja</span>
          <select
            value={porBandeja}
            onChange={(e) => setPorBandeja(Number(e.target.value))}
            className={CAMPO}
          >
            {[6, 12, 24, 48].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Conector</span>
          <select value={conector} onChange={(e) => setConector(e.target.value)} className={CAMPO}>
            {CONECTORES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-marino-600">Unidad donde empieza</span>
          <input
            type="number"
            min={1}
            max={tope}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Cuántas U ocupa</span>
          <input
            type="number"
            min={1}
            max={20}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Número de serie</span>
          <input
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            className={`${CAMPO} font-mono`}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-marino-600">Observaciones</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className={CAMPO}
        />
      </label>

      <p className="mt-2 rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
        {bandejas > 0 ? (
          <>
            Va a nacer con <strong>{bandejas * porBandeja} puertos</strong> en {conector}. Mezclar
            APC con UPC cuesta medio decibel y una visita.
          </>
        ) : (
          <>Sin bandejas no tiene de dónde salga el cable a la calle. Se le pueden abrir después.</>
        )}
      </p>

      {fuera && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-aviso">
          Así se sale del gabinete: empieza en la U{tope} o más abajo.
        </p>
      )}
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Boton
          cargando={guardando}
          disabled={codigo.trim().length < 2 || fuera}
          onClick={() =>
            empezar(async () => {
              const r = await montarOdf({
                rack: rack.id,
                codigo: codigo.trim(),
                nombre: nombre.trim() || null,
                position,
                height,
                bandejas,
                porBandeja,
                conector,
                serie: serie.trim() || null,
                notas: notas.trim() || null,
              });
              if (!r.ok) setError(r.mensaje);
              else onListo(r);
            })
          }
        >
          Dar de alta y montar
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────── formulario equipo
function FormularioEquipo({
  rack,
  formulario,
  sugerida,
  onCerrar,
  onListo,
}: {
  rack: Rack;
  formulario: { modo: 'nuevo'; kind: string; en?: number } | { modo: 'editar'; item: EquipoRack };
  sugerida: number;
  onCerrar: () => void;
  onListo: (r: Respuesta) => void;
}) {
  const editando = formulario.modo === 'editar' ? formulario.item : null;
  const inicial = formulario.modo === 'nuevo' ? formulario.kind : formulario.item.kind;
  const [kind, setKind] = useState(inicial);
  const [label, setLabel] = useState(editando?.label ?? '');
  const [vendor, setVendor] = useState(editando?.vendor ?? '');
  const [model, setModel] = useState(editando?.model ?? '');
  const [serial, setSerial] = useState(editando?.serial ?? '');
  const [position, setPosition] = useState(editando?.position ?? sugerida);
  const [height, setHeight] = useState(editando?.height ?? tipoDe(inicial).altura);
  const [status, setStatus] = useState(editando?.status ?? 'en_linea');
  const [ip, setIp] = useState(editando?.mgmt_ip ?? '');
  const [notas, setNotas] = useState(editando?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const tope = Math.max(1, rack.units - height + 1);
  const fuera = position + height - 1 > rack.units;

  return (
    <Panel
      titulo={
        editando ? `Editar ${editando.label}` : `Montar ${tipoDe(kind).rotulo} en ${rack.name}`
      }
      onCerrar={onCerrar}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Tipo</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              if (!editando) setHeight(tipoDe(e.target.value).altura);
            }}
            className={CAMPO}
          >
            {TIPOS_SUELTOS.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.icono} {t.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-marino-600">Nombre en el rack</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="OLT-CUE-01"
            className={CAMPO}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Estado</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={CAMPO}>
            {ESTADOS.filter((e) => e.clave !== 'disponible').map((e) => (
              <option key={e.clave} value={e.clave}>
                {e.icono} {e.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-marino-600">Marca</span>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Huawei"
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Modelo</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="EA5800"
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Número de serie</span>
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            className={`${CAMPO} font-mono`}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-marino-600">Unidad donde empieza</span>
          <input
            type="number"
            min={1}
            max={tope}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Cuántas U ocupa</span>
          <input
            type="number"
            min={1}
            max={20}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">IP de gestión</span>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="10.10.0.2"
            className={`${CAMPO} font-mono`}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-marino-600">Observaciones</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className={CAMPO}
        />
      </label>

      <p className="mt-2 text-xs text-marino-400">
        Ocupa{' '}
        {height === 1 ? `la U${position}` : `de la U${position} a la U${position + height - 1}`} de{' '}
        {rack.units}.
        {fuera && (
          <span className="text-falla">
            {' '}
            Así se sale del gabinete: empieza en la U{tope} o más abajo.
          </span>
        )}
      </p>

      <p className="mt-2 rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
        La IP de gestión sirve para llegar al equipo. Las contraseñas no van aquí ni en ningún otro
        lado del sistema.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Boton
          cargando={guardando}
          disabled={label.trim().length < 1 || fuera}
          onClick={() =>
            empezar(async () => {
              const r = await montarEnRack({
                id: editando?.id ?? null,
                rack: rack.id,
                label: label.trim(),
                kind,
                position,
                height,
                device: editando?.device_id ?? null,
                element: editando?.element_id ?? null,
                vendor: vendor.trim() || null,
                model: model.trim() || null,
                serial: serial.trim() || null,
                ip: ip.trim() || null,
                estado: status,
                notas: notas.trim() || null,
              });
              if (!r.ok) setError(r.mensaje);
              else onListo(r);
            })
          }
        >
          Guardar diseño
        </Boton>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────── panel
function Panel({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-marino-800/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-marino-800">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-marino-400 hover:text-marino-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
