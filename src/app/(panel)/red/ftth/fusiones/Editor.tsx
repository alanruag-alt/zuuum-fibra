'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Punto } from '@/app/(panel)/red/ftth/cables/Editor';
import { eliminarFusion, guardarFusion } from '@/modulos/ftth/acciones';
import { TIPO_EMPALME } from '@/modulos/ftth/etiquetas';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Fusion, Hilo } from '@/modulos/ftth/tipos';
import type { ElementoRed } from '@/modulos/red/tipos';

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

function etiquetaHilo(h: Hilo): string {
  return `${h.cable} · hilo ${h.strand_number} (${h.color}${h.tube_number > 1 ? `, tubo ${h.tube_number}` : ''})${
    h.status === 'fusionado' ? ' — ya fusionado' : ''
  }`;
}

export function NuevaFusion({
  cajas,
  naps,
  hilos,
}: {
  cajas: ElementoRed[];
  naps: ElementoRed[];
  hilos: Hilo[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [hacia, setHacia] = useState<'hilo' | 'elemento'>('hilo');
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarFusion,
    null,
  );

  if (!abierto) return <Boton onClick={() => setAbierto(true)}>Registrar una fusión</Boton>;

  return (
    <Tarjeta titulo="Fusión nueva" className="w-full">
      <Aviso estado={estado} />
      <form action={accion} className="mt-3 space-y-4">
        <input type="hidden" name="hacia" value={hacia} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">¿En qué caja?</span>
            <select name="caja" required className={CAMPO} autoFocus>
              <option value="">Elige</option>
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                  {c.name ? ` · ${c.name}` : ''}
                  {c.zona ? ` · ${c.zona}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Hilo que entra</span>
            <select name="entrada" required className={CAMPO}>
              <option value="">Elige</option>
              {hilos.map((h) => (
                <option key={h.id} value={h.id}>
                  {etiquetaHilo(h)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="text-sm font-medium text-marino-600">¿A dónde va?</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Boton
              type="button"
              variante={hacia === 'hilo' ? 'principal' : 'secundario'}
              onClick={() => setHacia('hilo')}
              className="px-3 py-1.5 text-xs"
            >
              A otro hilo
            </Boton>
            <Boton
              type="button"
              variante={hacia === 'elemento' ? 'principal' : 'secundario'}
              onClick={() => setHacia('elemento')}
              className="px-3 py-1.5 text-xs"
            >
              Termina en una NAP o splitter
            </Boton>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hacia === 'hilo' ? (
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Hilo que sale</span>
              <select name="salida" required className={CAMPO}>
                <option value="">Elige</option>
                {hilos.map((h) => (
                  <option key={h.id} value={h.id}>
                    {etiquetaHilo(h)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Termina en</span>
              <select name="destino" required className={CAMPO}>
                <option value="">Elige</option>
                {naps.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.code}
                    {n.name ? ` · ${n.name}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-marino-600">Tipo</span>
            <select name="tipo" defaultValue="fusion" className={CAMPO}>
              {Object.entries(TIPO_EMPALME).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Pérdida (dB)</span>
            <input
              name="perdida"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.08"
              className={CAMPO}
            />
            <span className="mt-1 block text-xs text-marino-400">Lo que marcó la fusionadora.</span>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-marino-600">Nota</span>
            <input name="notas" placeholder="Bandeja 2, posición 5…" className={CAMPO} />
          </label>
        </div>

        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Registrar
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

export function BorrarFusion({ fusion }: { fusion: Fusion }) {
  const [preguntando, setPreguntando] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    eliminarFusion,
    null,
  );

  if (estado?.ok) return <span className="text-xs text-marino-400">{estado.mensaje}</span>;

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
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-2">
      <p className="mb-2 text-xs text-marino-700">
        ¿Borrar esta fusión? Los hilos quedan libres otra vez.
      </p>
      <form action={accion} className="flex gap-2">
        <input type="hidden" name="id" value={fusion.id} />
        <Boton type="submit" variante="oscuro" cargando={enviando} className="px-3 py-1.5 text-xs">
          Sí, borrar
        </Boton>
        <Boton
          type="button"
          variante="secundario"
          onClick={() => setPreguntando(false)}
          className="px-3 py-1.5 text-xs"
        >
          No
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

/** El renglón de una fusión, dibujado como se ve: entra algo, sale algo. */
export function Renglon({ f }: { f: Fusion }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="flex items-center gap-1.5">
        {f.color_entra && <Punto color={f.color_entra} />}
        <span className="font-mono text-xs text-marino-700">
          {f.cable_entra} · {f.hilo_entra}
        </span>
      </span>
      <span className="text-marino-300">→</span>
      {f.out_strand_id ? (
        <span className="flex items-center gap-1.5">
          {f.color_sale && <Punto color={f.color_sale} />}
          <span className="font-mono text-xs text-marino-700">
            {f.cable_sale} · {f.hilo_sale}
          </span>
        </span>
      ) : (
        <span className="rounded-md bg-naranja-50 px-2 py-0.5 font-mono text-xs text-naranja-700">
          {f.destino}
        </span>
      )}
    </div>
  );
}
