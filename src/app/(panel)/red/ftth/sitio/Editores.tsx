'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import {
  abrirPuertosOdf,
  abrirTarjeta,
  arrancarCable,
  despatchear,
  patchear,
  soltarCable,
} from '@/modulos/red/acciones_olt';
import { vaciarPuertoOdf } from '@/modulos/red/acciones_rack';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { PuertoOdf, PuertoPon } from '@/modulos/red/olt';

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

// ─────────────────────────────────────────────────────── tarjeta de la OLT
export function NuevaTarjeta({ olts }: { olts: { id: string; name: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(abrirTarjeta, null);

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Agregar tarjeta
      </Boton>
    );
  }

  return (
    <Tarjeta titulo="Tarjeta nueva" className="w-full">
      <Aviso estado={estado} />
      <form action={accion} className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">¿De qué OLT?</span>
            <select name="olt" required className={CAMPO}>
              <option value="">Elige la OLT</option>
              {olts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Slot</span>
            <input name="slot" type="number" min="0" defaultValue="1" required className={CAMPO} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Cuántos puertos</span>
            <input
              name="puertos"
              type="number"
              min="1"
              max="64"
              defaultValue="16"
              required
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Tipo de tarjeta</span>
            <input name="tipo" placeholder="GPON 16" className={CAMPO} />
          </label>
        </div>

        <label className="flex items-start gap-2">
          <input type="checkbox" name="desde_cero" value="si" className="mt-1" />
          <span className="text-sm text-marino-600">
            Los puertos empiezan en 0
            <span className="block text-xs text-marino-400">
              Huawei numera 0 a 15; VSOL numera 1 a 16. Se guarda como lo dice tu equipo, para que
              el número que ves aquí sea el mismo que ves en la consola.
            </span>
          </span>
        </label>

        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Crear con sus puertos
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

// ────────────────────────────────────────────────────────── bandejas del ODF
export function NuevasBandejas({ odfs }: { odfs: { id: string; code: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    abrirPuertosOdf,
    null,
  );

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Abrir bandejas del ODF
      </Boton>
    );
  }

  return (
    <Tarjeta titulo="Bandejas del ODF" className="w-full">
      <Aviso estado={estado} />
      <form action={accion} className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">¿Qué ODF?</span>
            <select name="odf" required className={CAMPO}>
              <option value="">Elige el ODF</option>
              {odfs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Bandejas</span>
            <input
              name="bandejas"
              type="number"
              min="1"
              defaultValue="1"
              required
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Puertos por bandeja</span>
            <input
              name="por_bandeja"
              type="number"
              min="1"
              defaultValue="12"
              required
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Conector</span>
            <select name="conector" defaultValue="SC/APC" className={CAMPO}>
              <option>SC/APC</option>
              <option>SC/UPC</option>
              <option>LC/APC</option>
              <option>LC/UPC</option>
            </select>
          </label>
        </div>
        <p className="rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
          Los que ya existían no se tocan. Si te faltó una bandeja, vuelve a correrlo con el número
          nuevo y solo se agregan las que faltan.
        </p>
        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Abrir
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

// ───────────────────────────────────────────────────────────── el latiguillo
/**
 * El patcheo.
 *
 * Es un renglón por puerto del ODF, y de ahí se elige el PON. Al revés
 * —elegir el PON y luego el puerto— se ve igual pero se usa peor: uno está
 * parado frente al ODF viendo bandejas, no viendo la lista de PON.
 */
export function Patchear({
  puerto,
  pones,
  hilos,
}: {
  puerto: PuertoOdf;
  pones: PuertoPon[];
  hilos: { id: string; etiqueta: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [ePon, aPon, enviandoPon] = useActionState<Respuesta | null, FormData>(patchear, null);
  const [eQuitar, aQuitar, quitando] = useActionState<Respuesta | null, FormData>(
    despatchear,
    null,
  );
  const [eCable, aCable, amarrando] = useActionState<Respuesta | null, FormData>(
    arrancarCable,
    null,
  );
  const [eSoltar, aSoltar, soltando] = useActionState<Respuesta | null, FormData>(
    soltarCable,
    null,
  );

  const libres = pones.filter((p) => !p.odf_port_id || p.odf_port_id === puerto.id);

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        conectar
      </Boton>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-naranja-200 bg-naranja-50/50 p-3">
      <p className="mb-2 text-xs font-medium text-marino-700">
        Bandeja {puerto.tray_number} · puerto {puerto.port_number}
      </p>

      {/* De la OLT al puerto */}
      {puerto.pon_port_id ? (
        <form action={aQuitar} className="mb-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={puerto.id} />
          <span className="text-xs text-marino-600">
            Le entra <strong>{puerto.pon}</strong> de {puerto.olt}
          </span>
          <Boton
            type="submit"
            variante="secundario"
            cargando={quitando}
            className="px-2 py-1 text-xs"
          >
            quitar el latiguillo
          </Boton>
        </form>
      ) : (
        <form action={aPon} className="mb-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="puerto" value={puerto.id} />
          <label className="block">
            <span className="text-xs font-medium text-marino-600">¿Qué PON le entra?</span>
            <select name="pon" required className={`${CAMPO} w-56`}>
              <option value="">Elige el puerto PON</option>
              {libres.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.olt} · {p.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">dBm</span>
            <input name="potencia" type="number" step="0.01" className={`${CAMPO} w-24`} />
          </label>
          <Boton type="submit" cargando={enviandoPon} className="px-3 py-2 text-xs">
            Conectar
          </Boton>
        </form>
      )}
      <Aviso estado={ePon} />
      <Aviso estado={eQuitar} />

      {/* Del puerto al cable */}
      {puerto.out_strand_id ? (
        <form action={aSoltar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={puerto.id} />
          <span className="text-xs text-marino-600">
            Sale el hilo <strong>{puerto.strand_number}</strong> ({puerto.color_hilo}) de{' '}
            {puerto.cable}
          </span>
          <Boton
            type="submit"
            variante="secundario"
            cargando={soltando}
            className="px-2 py-1 text-xs"
          >
            soltar el cable
          </Boton>
        </form>
      ) : (
        <form action={aCable} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="puerto" value={puerto.id} />
          <label className="block">
            <span className="text-xs font-medium text-marino-600">¿Qué hilo sale de aquí?</span>
            <select name="hilo" required className={`${CAMPO} w-64`}>
              <option value="">Elige el hilo del troncal</option>
              {hilos.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <Boton type="submit" cargando={amarrando} className="px-3 py-2 text-xs">
            Amarrar
          </Boton>
        </form>
      )}
      <Aviso estado={eCable} />
      <Aviso estado={eSoltar} />

      <Boton variante="texto" onClick={() => setAbierto(false)} className="mt-2 px-2 py-1 text-xs">
        cerrar
      </Boton>
    </div>
  );
}

/**
 * Dejar libre un puerto del ODF.
 *
 * Este botón faltaba, y su ausencia dejó a ODFPEDRI1 imposible de borrar: la
 * base decía «tiene 1 puertos ocupados» y no había ninguna pantalla donde
 * desconectarlo. Quita el latiguillo de la OLT y el hilo del cable de un solo
 * movimiento, porque quien nada más quiere el puerto libre no tiene por qué
 * saber que eran dos cosas distintas.
 */
export function VaciarPuerto({ puerto }: { puerto: PuertoOdf }) {
  const [preguntando, setPreguntando] = useState(false);
  const [estado, setEstado] = useState<Respuesta | null>(null);
  const [guardando, empezar] = useTransition();
  const router = useRouter();

  const trae = [
    puerto.pon ? `el latiguillo del PON ${puerto.pon}` : null,
    puerto.cable ? `el hilo ${puerto.strand_number} de ${puerto.cable}` : null,
  ].filter(Boolean);

  if (!preguntando) {
    return (
      <>
        <Boton variante="texto" className="px-2 py-1 text-xs" onClick={() => setPreguntando(true)}>
          vaciar
        </Boton>
        {estado && (
          <span className={`text-xs ${estado.ok ? 'text-exito' : 'text-falla'}`}>
            {estado.mensaje}
          </span>
        )}
      </>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-aviso">
      <span>
        ¿Dejar libre la bandeja {puerto.tray_number} puerto {puerto.port_number}? Se quita{' '}
        {trae.join(' y ')}.
      </span>
      <Boton
        variante="oscuro"
        className="px-2.5 py-1 text-xs"
        cargando={guardando}
        onClick={() =>
          empezar(async () => {
            const r = await vaciarPuertoOdf(puerto.id);
            setEstado(r);
            if (r.ok) {
              setPreguntando(false);
              router.refresh();
            }
          })
        }
      >
        Sí, vaciarlo
      </Boton>
      <Boton
        variante="secundario"
        className="px-2.5 py-1 text-xs"
        onClick={() => setPreguntando(false)}
      >
        No
      </Boton>
    </span>
  );
}
