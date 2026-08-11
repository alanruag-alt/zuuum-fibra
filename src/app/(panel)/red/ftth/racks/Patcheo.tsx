'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { conectarPonAOdf } from '@/modulos/red/acciones_rack';
import { despatchear } from '@/modulos/red/acciones_olt';
import { CONECTORES } from '@/modulos/red/rack_tipos';
import type { PuertoOdf, PuertoPon } from '@/modulos/red/olt';
import type { Respuesta } from '@/modulos/admin/acciones';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

/**
 * El latiguillo de la OLT al ODF.
 *
 * Es el tramo más corto de toda la red —treinta centímetros dentro de la
 * caseta— y el que más se documenta mal, porque «se ve». Se ve hoy. En dos
 * años, con el organizador lleno, ese latiguillo hay que seguirlo con la mano
 * a menos que tenga etiqueta y esté anotado.
 *
 * Al elegir un PON se ilumina el puerto del ODF donde está: eso responde de un
 * vistazo la pregunta que se hace parado enfrente, que no es «cuáles hay»
 * sino «este de aquí, ¿a dónde va?».
 */
export default function Patcheo({
  pones,
  puertos,
}: {
  pones: PuertoPon[];
  puertos: (PuertoOdf & { jumper_code?: string | null; responsable?: string | null })[];
}) {
  const router = useRouter();
  const [pon, setPon] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [jumper, setJumper] = useState('');
  const [conector, setConector] = useState('SC/APC');
  const [potencia, setPotencia] = useState('');
  const [notas, setNotas] = useState('');
  const [recado, setRecado] = useState<Respuesta | null>(null);
  const [guardando, empezar] = useTransition();

  const elegido = pones.find((p) => p.id === pon) ?? null;
  const suPuerto = puertos.find((p) => p.pon_port_id === pon) ?? null;

  const porOdf = useMemo(() => {
    const m = new Map<string, typeof puertos>();
    for (const p of puertos) {
      if (!m.has(p.odf)) m.set(p.odf, []);
      m.get(p.odf)!.push(p);
    }
    return m;
  }, [puertos]);

  const porTarjeta = useMemo(() => {
    const m = new Map<string, PuertoPon[]>();
    for (const p of pones) {
      const k = `${p.olt} · slot ${p.slot_number}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return m;
  }, [pones]);

  function aplicar(r: Respuesta) {
    setRecado(r);
    if (r.ok) {
      router.refresh();
      setDestino(null);
      setJumper('');
      setPotencia('');
      setNotas('');
    }
  }

  if (pones.length === 0 || puertos.length === 0) {
    return (
      <Tarjeta titulo="De la OLT al ODF" className="mt-6">
        <p className="py-6 text-center text-sm text-marino-400">
          Para conectar hace falta una OLT con su tarjeta y un ODF con sus bandejas abiertas. Eso se
          da de alta en <strong>Sitio, OLT y ODF</strong>.
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta
      className="mt-6"
      titulo="De la OLT al ODF"
      descripcion="Elige el puerto PON y se ilumina en qué puerto del ODF está. Si no está en ninguno, elige uno libre y anota el latiguillo."
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

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── los PON ─────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-marino-400">
            Puertos PON de la OLT
          </p>
          <div className="space-y-3">
            {[...porTarjeta.entries()].map(([tarjeta, lista]) => (
              <div key={tarjeta}>
                <p className="mb-1 text-xs font-medium text-marino-600">{tarjeta}</p>
                <div className="flex flex-wrap gap-1.5">
                  {lista.map((p) => {
                    const activo = p.id === pon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPon(activo ? null : p.id);
                          setDestino(null);
                          setRecado(null);
                        }}
                        title={
                          p.odf
                            ? `${p.etiqueta} → ${p.odf} bandeja ${p.tray_number} puerto ${p.odf_port_number}`
                            : `${p.etiqueta} · sin patchear`
                        }
                        className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                          activo
                            ? 'border-naranja-500 bg-naranja-50 text-naranja-700 ring-2 ring-naranja-300'
                            : p.odf_port_id
                              ? 'border-blue-300 bg-blue-50 text-blue-700'
                              : 'border-marino-200 bg-white text-marino-500 hover:border-naranja-400'
                        }`}
                      >
                        {p.odf_port_id ? '▣' : '○'} {p.etiqueta}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-marino-400">
            <span className="font-mono">▣</span> ya tiene latiguillo ·{' '}
            <span className="font-mono">○</span> libre
          </p>
        </div>

        {/* ── los puertos del ODF ─────────────────────────────────────────── */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-marino-400">
            Puertos del ODF
          </p>
          <div className="space-y-3">
            {[...porOdf.entries()].map(([odf, lista]) => (
              <div key={odf}>
                <p className="mb-1 text-xs font-medium text-marino-600">{odf}</p>
                <div className="flex flex-wrap gap-1.5">
                  {lista.map((p) => {
                    const suyo = suPuerto?.id === p.id;
                    const marcado = destino === p.id;
                    const libre = !p.pon_port_id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!elegido || (!libre && !suyo)}
                        onClick={() => setDestino(marcado ? null : p.id)}
                        title={`Bandeja ${p.tray_number} puerto ${p.port_number}${
                          p.pon ? ` · entra ${p.pon} de ${p.olt}` : ' · libre'
                        }${p.jumper_code ? ` · latiguillo ${p.jumper_code}` : ''}${
                          p.cable ? ` · sale a ${p.cable} hilo ${p.strand_number}` : ''
                        }`}
                        className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors disabled:cursor-not-allowed ${
                          suyo
                            ? 'border-naranja-500 bg-naranja-100 text-naranja-800 ring-2 ring-naranja-400'
                            : marcado
                              ? 'border-green-500 bg-green-100 text-exito ring-2 ring-green-400'
                              : p.pon_port_id
                                ? 'border-blue-300 bg-blue-50 text-blue-700 opacity-60'
                                : elegido
                                  ? 'border-green-300 bg-white text-marino-600 hover:border-green-500 hover:bg-green-50'
                                  : 'border-marino-200 bg-white text-marino-400'
                        }`}
                      >
                        {p.tray_number}/{p.port_number}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {!elegido && (
            <p className="mt-2 text-[11px] text-marino-400">
              Elige primero un puerto PON de la izquierda.
            </p>
          )}
        </div>
      </div>

      {/* ── la ficha del latiguillo ───────────────────────────────────────── */}
      {elegido && (
        <div className="mt-5 rounded-lg border border-naranja-200 bg-naranja-50/40 p-4">
          <p className="text-sm font-medium text-marino-800">
            {elegido.etiqueta} de {elegido.olt}
            {suPuerto ? (
              <span className="font-normal text-marino-500">
                {' '}
                → está en {suPuerto.odf} bandeja {suPuerto.tray_number} puerto{' '}
                {suPuerto.port_number}
                {suPuerto.jumper_code ? ` · latiguillo ${suPuerto.jumper_code}` : ''}
                {suPuerto.connector ? ` · ${suPuerto.connector}` : ''}
                {suPuerto.power_dbm !== null ? ` · ${suPuerto.power_dbm} dBm` : ''}
              </span>
            ) : (
              <span className="font-normal text-marino-500"> → todavía sin latiguillo</span>
            )}
          </p>

          {suPuerto?.cable && (
            <p className="mt-1 text-xs text-marino-500">
              De ahí sale {suPuerto.cable}, hilo {suPuerto.strand_number} ({suPuerto.color_hilo}).
            </p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Etiqueta del latiguillo</span>
              <input
                value={jumper}
                onChange={(e) => setJumper(e.target.value)}
                placeholder="JMP-014"
                className={`${CAMPO} font-mono`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Conector</span>
              <select
                value={conector}
                onChange={(e) => setConector(e.target.value)}
                className={CAMPO}
              >
                {CONECTORES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Potencia (dBm)</span>
              <input
                value={potencia}
                onChange={(e) => setPotencia(e.target.value)}
                inputMode="decimal"
                placeholder="-18.4"
                className={CAMPO}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-marino-600">Observaciones</span>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} className={CAMPO} />
            </label>
          </div>

          <p className="mt-2 text-xs text-marino-400">
            Mezclar APC con UPC cuesta medio decibel y una visita. Es de los errores que no se ven:
            el enlace levanta, nada más viene flojo.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Boton
              cargando={guardando}
              disabled={!destino && !suPuerto}
              onClick={() =>
                empezar(async () => {
                  const puerto = destino ?? suPuerto?.id;
                  if (!puerto) return;
                  const n = Number(potencia);
                  aplicar(
                    await conectarPonAOdf({
                      pon: elegido.id,
                      puerto,
                      potencia: potencia.trim() && !Number.isNaN(n) ? n : null,
                      jumper: jumper.trim() || null,
                      conector,
                      notas: notas.trim() || null,
                    }),
                  );
                })
              }
            >
              {suPuerto && !destino ? 'Actualizar el latiguillo' : 'Conectar'}
            </Boton>

            {suPuerto && (
              <Boton
                variante="secundario"
                disabled={guardando}
                onClick={() =>
                  empezar(async () => {
                    const datos = new FormData();
                    datos.set('id', suPuerto.id);
                    aplicar(await despatchear(null, datos));
                  })
                }
              >
                Quitar el latiguillo
              </Boton>
            )}
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
