'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Insignia } from '@/componentes/ui/Insignia';
import {
  alimentarSplitter,
  conectarSalida,
  guardarSplitter,
} from '@/modulos/ftth/acciones_splitter';
import { ESTADO_SALIDA, RAZONES, TIPO_CAJA } from '@/modulos/ftth/splitter_tipos';
import type { SalidaSplitter, Splitter } from '@/modulos/ftth/splitter_tipos';
import type { Respuesta } from '@/modulos/admin/acciones';

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

interface Caja {
  id: string;
  code: string;
  tipo: string;
  zona: string | null;
}

/**
 * Alta de splitter.
 *
 * La caja va PRIMERO en el formulario, antes que el código. No es capricho de
 * orden: un splitter existe dentro de algo, y preguntar dónde va al final
 * invita a capturarlo «para acomodarlo luego», que es como se llenan las bases
 * de datos de cosas flotando.
 *
 * Cuando se pone desde adentro de una caja (cajaFija), no se pregunta dónde va:
 * ya se sabe. El selector se cambia por un dato fijo, porque el usuario ya está
 * parado en esa caja y volver a elegirla solo invita a equivocarse de renglón.
 */
export function EditarSplitter({
  cajas,
  splitter,
  cajaFija,
}: {
  cajas: Caja[];
  splitter?: Splitter;
  cajaFija?: { id: string; code: string; tipo: string };
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarSplitter,
    null,
  );

  if (!abierto) {
    return splitter ? (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        editar
      </Boton>
    ) : (
      <Boton onClick={() => setAbierto(true)}>Poner un splitter</Boton>
    );
  }

  return (
    <Tarjeta titulo={splitter ? `Editar ${splitter.code}` : 'Splitter nuevo'} className="w-full">
      <Aviso estado={estado} />
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          {splitter && <input type="hidden" name="id" value={splitter.id} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cajaFija ? (
              <div className="block sm:col-span-2">
                <span className="text-sm font-medium text-marino-600">Va montado en</span>
                <input type="hidden" name="caja" value={cajaFija.id} />
                <p className="mt-1 rounded-lg border border-marino-100 bg-marino-50 px-3 py-2 text-sm text-marino-700">
                  <span className="font-mono">{cajaFija.code}</span>
                  <span className="text-marino-400">
                    {' '}
                    — {TIPO_CAJA[cajaFija.tipo] ?? cajaFija.tipo}
                  </span>
                </p>
              </div>
            ) : (
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-marino-600">
                  ¿En qué caja va montado?
                </span>
                <select
                  name="caja"
                  required
                  defaultValue={splitter?.housing_id ?? ''}
                  className={CAMPO}
                  autoFocus
                >
                  <option value="">Elige la caja primero</option>
                  {cajas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {TIPO_CAJA[c.tipo] ?? c.tipo}
                      {c.zona ? ` · ${c.zona}` : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-marino-400">
                  Una caja de empalme, una NAP, o el ODF si es de rack.
                </span>
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Código</span>
              <input
                name="codigo"
                required
                defaultValue={splitter?.code}
                placeholder="SPL-CE005-01"
                className={`${CAMPO} font-mono`}
                autoFocus={!!cajaFija && !splitter}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Razón</span>
              <select name="razon" defaultValue={splitter?.ratio ?? '1x8'} className={CAMPO}>
                {RAZONES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-marino-400">
                Las salidas se crean solas: un 1x8 nace con ocho.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Pérdida (dB)</span>
              <input
                name="perdida"
                type="number"
                step="0.01"
                min="0"
                defaultValue={splitter?.loss_db ?? ''}
                placeholder="10.5"
                className={CAMPO}
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-sm font-medium text-marino-600">Notas</span>
              <input name="notas" defaultValue={splitter?.notes ?? ''} className={CAMPO} />
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

// ───────────────────────────────────────────────────────────── la entrada
export function Alimentar({
  splitter,
  hilos,
  puertosOdf,
}: {
  splitter: Splitter;
  hilos: { id: string; etiqueta: string }[];
  puertosOdf: { id: string; etiqueta: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    alimentarSplitter,
    null,
  );

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        {splitter.entrada ? 'cambiar la entrada' : 'decir de dónde entra'}
      </Boton>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-naranja-200 bg-naranja-50/50 p-3">
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="splitter" value={splitter.id} />
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Le entra un hilo</span>
          <select name="hilo" className={`${CAMPO} w-64`}>
            <option value="">—</option>
            {hilos.map((h) => (
              <option key={h.id} value={h.id}>
                {h.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">…o un puerto del ODF</span>
          <select name="odf_port" className={`${CAMPO} w-56`}>
            <option value="">—</option>
            {puertosOdf.map((p) => (
              <option key={p.id} value={p.id}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">dBm</span>
          <input name="potencia" type="number" step="0.01" className={`${CAMPO} w-24`} />
        </label>
        <Boton type="submit" cargando={enviando} className="px-3 py-2 text-xs">
          Guardar
        </Boton>
        <Boton
          type="button"
          variante="secundario"
          onClick={() => setAbierto(false)}
          className="px-3 py-2 text-xs"
        >
          Cerrar
        </Boton>
      </form>
      <p className="mt-2 text-xs text-marino-400">Llena una sola de las dos.</p>
      <Aviso estado={estado} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────── las salidas
export function Salidas({
  salidas,
  hilos,
  naps,
}: {
  salidas: SalidaSplitter[];
  hilos: { id: string; etiqueta: string }[];
  naps: { id: string; code: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [tocando, setTocando] = useState<SalidaSplitter | null>(null);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    conectarSalida,
    null,
  );

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        ver las {salidas.length} salidas
      </Boton>
    );
  }

  return (
    <div className="mt-3 w-full rounded-lg border border-marino-100 bg-marino-50/40 p-3">
      <div className="flex flex-wrap gap-1.5">
        {salidas.map((s) => {
          const e = ESTADO_SALIDA[s.status] ?? { texto: s.status, tono: 'neutro' };
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
          const va = s.nap
            ? s.nap
            : s.cable
              ? `${s.cable} h${s.strand_number}`
              : s.puerto_nap
                ? `puerto ${s.puerto_nap}`
                : null;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setTocando(s)}
              title={`Salida ${s.port_number} · ${e.texto}${va ? ` → ${va}` : ''}`}
              className={`rounded-md border px-2 py-1 text-xs transition-colors hover:border-naranja-400 ${tono}`}
            >
              <span className="font-medium text-marino-700">{s.port_number}</span>
              {va && <span className="ml-1.5 text-marino-500">{va}</span>}
            </button>
          );
        })}
      </div>

      {tocando && (
        <div className="mt-3 rounded-lg border border-naranja-200 bg-white p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-marino-800">
            Salida {tocando.port_number}
            <Insignia tono={(ESTADO_SALIDA[tocando.status]?.tono ?? 'neutro') as never}>
              {ESTADO_SALIDA[tocando.status]?.texto ?? tocando.status}
            </Insignia>
          </p>
          <form action={accion} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="salida" value={tocando.id} />
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Va a un hilo</span>
              <select name="hilo" className={`${CAMPO} w-56`}>
                <option value="">—</option>
                {hilos.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">…o a una NAP</span>
              <select name="nap" className={`${CAMPO} w-44`}>
                <option value="">—</option>
                {naps.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">…o solo el estado</span>
              <select name="estado" defaultValue="" className={`${CAMPO} w-36`}>
                <option value="">—</option>
                <option value="disponible">Disponible</option>
                <option value="reservada">Reservada</option>
                <option value="danada">Dañada</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">dBm</span>
              <input name="potencia" type="number" step="0.01" className={`${CAMPO} w-24`} />
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
        Ocultar
      </Boton>
    </div>
  );
}
