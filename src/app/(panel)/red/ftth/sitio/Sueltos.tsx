'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { asignarASitio, montarEnRack, sacarDelSitio } from '@/modulos/red/acciones_rack';
import { eliminarDispositivo, eliminarElemento } from '@/modulos/red/acciones';
import { YaNoSeUsa } from '@/app/(panel)/red/ftth/sitio/Editores';
import { tipoDe } from '@/modulos/red/rack_tipos';
import type { Rack } from '@/modulos/red/racks';
import type { Suelto } from '@/modulos/red/racks';
import type { Respuesta } from '@/modulos/admin/acciones';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

/**
 * Lo que pertenece a la caseta pero no está en ningún gabinete.
 *
 * Esto estaba invisible y causó un problema real: se quiso borrar SITE
 * PEDRISEÑA y la base se negó porque había una OLT amarrada al sitio. La OLT
 * existía, pero como nunca se montó en un rack, la pantalla no la enseñaba en
 * ningún lado. Existía, estorbaba, y no se podía tocar.
 *
 * Una cosa que el sistema toma en cuenta para decidir tiene que verse. Si no,
 * quien la usa se queda peleando con una pared.
 */
export function Sueltos({
  sueltos,
  racks,
  sitio,
  sitios = [],
}: {
  sueltos: Suelto[];
  racks: Rack[];
  sitio: string;
  /** Para poder asignarle caseta a lo que quedó huérfano. */
  sitios?: { id: string; name: string }[];
}) {
  const huerfano = racks.length === 0 && sitios.length > 0 && sitio === 'sin caseta';
  const router = useRouter();
  const [recado, setRecado] = useState<Respuesta | null>(null);
  const [montando, setMontando] = useState<Suelto | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  if (sueltos.length === 0) return null;

  function aplicar(r: Respuesta) {
    setRecado(r);
    if (r.ok) {
      setConfirmar(null);
      router.refresh();
    }
  }

  return (
    <Tarjeta
      className="mt-6 border-amber-200"
      titulo={`⚠ ${sueltos.length} ${sueltos.length === 1 ? 'cosa' : 'cosas'} ${huerfano ? 'sin caseta' : 'en esta caseta sin gabinete'}`}
      descripcion={
        huerfano
          ? 'No pertenecen a ninguna comunidad, así que hasta ahora no aparecían en ningún lado. Ponles su caseta y ahí las vas a ver de aquí en adelante.'
          : 'Pertenecen al sitio pero no están montadas en ningún rack. Cuentan para todo —incluso impiden borrar la caseta— así que conviene resolverlas: súbelas al gabinete, sácalas del sitio, o bórralas.'
      }
    >
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

      <div className="space-y-2">
        {sueltos.map((s) => (
          <div key={s.id} className="rounded-lg border border-marino-100 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{tipoDe(s.tipo).icono}</span>
              <span className="font-medium text-marino-800">{s.nombre}</span>
              <Insignia tono="neutro">{tipoDe(s.tipo).rotulo}</Insignia>
              {!s.activo && <Insignia tono="aviso">inactivo</Insignia>}
              {s.detalle && <span className="text-xs text-marino-400">{s.detalle}</span>}
              <span className="text-xs text-marino-300">alta {s.alta}</span>

              <span className="ml-auto flex flex-wrap gap-1.5">
                {racks.length > 0 && (
                  <Boton
                    variante="secundario"
                    className="px-2.5 py-1 text-xs"
                    onClick={() => setMontando(s)}
                  >
                    Subir al gabinete
                  </Boton>
                )}
                {huerfano ? (
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs text-marino-500">Ponerle caseta:</span>
                    <select
                      defaultValue=""
                      disabled={guardando}
                      onChange={(e) =>
                        e.target.value &&
                        empezar(async () =>
                          aplicar(await asignarASitio(s.id, s.que, e.target.value)),
                        )
                      }
                      className="rounded-lg border border-marino-200 px-2 py-1 text-xs text-marino-800 focus:border-naranja-400 focus:outline-none"
                    >
                      <option value="">elige una…</option>
                      {sitios.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <Boton
                    variante="secundario"
                    className="px-2.5 py-1 text-xs"
                    disabled={guardando}
                    onClick={() => empezar(async () => aplicar(await sacarDelSitio(s.id, s.que)))}
                  >
                    Sacar de la caseta
                  </Boton>
                )}
                <YaNoSeUsa id={s.id} que={s.que} nombre={s.nombre} activo={s.activo} />
                <Boton
                  variante="texto"
                  className="px-2.5 py-1 text-xs"
                  onClick={() => setConfirmar(confirmar === s.id ? null : s.id)}
                >
                  borrar
                </Boton>
              </span>
            </div>

            {confirmar === s.id && (
              <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">
                <p>
                  ¿Borrar <strong>{s.nombre}</strong> de todo el sistema? Si trae tarjetas, puertos
                  o clientes colgando, la base se va a negar y te va a decir qué falta primero. Si
                  el equipo sí existió y nada más se retiró, es mejor «Ya no se usa»: se conserva la
                  historia de los clientes que colgaban de ahí.
                </p>
                <div className="mt-2 flex gap-2">
                  <Boton
                    variante="oscuro"
                    className="px-3 py-1.5 text-xs"
                    cargando={guardando}
                    onClick={() =>
                      empezar(async () => {
                        const datos = new FormData();
                        datos.set('id', s.id);
                        aplicar(
                          s.que === 'equipo'
                            ? await eliminarDispositivo(null, datos)
                            : await eliminarElemento(null, datos),
                        );
                      })
                    }
                  >
                    Sí, borrar
                  </Boton>
                  <Boton
                    variante="secundario"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => setConfirmar(null)}
                  >
                    No
                  </Boton>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {racks.length === 0 && !huerfano && (
        <p className="mt-3 rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
          Esta caseta todavía no tiene gabinete. Dale de alta uno arriba y entonces vas a poder
          subir estas cosas a su unidad.
        </p>
      )}

      {montando && (
        <Montar
          suelto={montando}
          racks={racks}
          sitio={sitio}
          onCerrar={() => setMontando(null)}
          onListo={(r) => {
            aplicar(r);
            if (r.ok) setMontando(null);
          }}
        />
      )}
    </Tarjeta>
  );
}

function Montar({
  suelto,
  racks,
  sitio,
  onCerrar,
  onListo,
}: {
  suelto: Suelto;
  racks: Rack[];
  sitio: string;
  onCerrar: () => void;
  onListo: (r: Respuesta) => void;
}) {
  const [rack, setRack] = useState(racks[0]?.id ?? '');
  const [position, setPosition] = useState(1);
  const [height, setHeight] = useState(suelto.tipo === 'olt' ? 2 : 1);
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const elegido = racks.find((r) => r.id === rack);
  const tope = Math.max(1, (elegido?.units ?? 42) - height + 1);
  const fuera = position + height - 1 > (elegido?.units ?? 42);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-marino-800/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-lg">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-marino-800">
            Subir {suelto.nombre} al gabinete
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-marino-400 hover:text-marino-700"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-marino-400">
          Ya existe en {sitio}: aquí nada más se le dice en qué unidad está. No se vuelve a capturar
          nada.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-3">
            <span className="text-xs font-medium text-marino-600">Gabinete</span>
            <select value={rack} onChange={(e) => setRack(e.target.value)} className={CAMPO}>
              {racks.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.units}U · {r.libres} libres
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
        </div>

        {fuera && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-aviso">
            Así se sale del gabinete: empieza en la U{tope} o más abajo.
          </p>
        )}
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-falla">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Boton
            cargando={guardando}
            disabled={!rack || fuera}
            onClick={() =>
              empezar(async () => {
                const r = await montarEnRack({
                  rack,
                  label: suelto.nombre,
                  kind: suelto.tipo,
                  position,
                  height,
                  device: suelto.que === 'equipo' ? suelto.id : null,
                  element: suelto.que === 'elemento' ? suelto.id : null,
                });
                if (!r.ok) setError(r.mensaje);
                else onListo(r);
              })
            }
          >
            Subirlo al gabinete
          </Boton>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
        </div>
      </div>
    </div>
  );
}
