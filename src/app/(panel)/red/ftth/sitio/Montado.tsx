import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import {
  NuevaTarjeta,
  NuevasBandejas,
  Patchear,
  VaciarPuerto,
} from '@/app/(panel)/red/ftth/sitio/Editores';
import { estadoDe } from '@/modulos/red/rack_tipos';
import type { EnLaCaseta } from '@/modulos/red/racks';
import type { PuertoOdf, PuertoPon, Tarjeta as TarjetaOlt } from '@/modulos/red/olt';

/**
 * Lo que hay adentro de cada equipo montado.
 *
 * El rack dice dónde está la OLT; esto dice qué trae. Van juntos en la misma
 * pantalla porque en campo son el mismo momento: uno abre el gabinete, ve la
 * OLT en la U36, y lo siguiente que necesita saber es qué puerto PON tiene
 * libre. Tenerlo en dos pestañas obligaba a memorizar el nombre y buscarlo.
 *
 * Las tarjetas cuelgan de la OLT y no del rack, que es como es de verdad: si
 * la OLT se cambia de gabinete, sus tarjetas se van con ella.
 */
/**
 * Dónde está, cuando está en algún lado.
 *
 * Un equipo puede pertenecer a la caseta sin estar montado en un gabinete.
 * Antes eso lo hacía desaparecer de la pantalla; ahora se dice tal cual, que
 * además es un pendiente que conviene ver.
 */
function donde(o: EnLaCaseta): string {
  if (o.posicion === null) return '⚠ sin gabinete';
  return `${o.rack ? `${o.rack} · ` : ''}U${o.posicion}${
    o.hasta && o.hasta > o.posicion ? `–U${o.hasta}` : ''
  }`;
}

export function Montado({
  equipos,
  tarjetas,
  pones,
  puertosOdf,
  hilos,
}: {
  equipos: EnLaCaseta[];
  tarjetas: TarjetaOlt[];
  pones: PuertoPon[];
  puertosOdf: PuertoOdf[];
  hilos: { id: string; etiqueta: string }[];
}) {
  const olts = equipos.filter((e) => e.kind === 'olt');
  const odfs = equipos.filter((e) => e.kind === 'odf');

  if (olts.length === 0 && odfs.length === 0) return null;

  return (
    <div className="mt-6 space-y-6">
      {olts.map((o) => {
        const suyas = tarjetas.filter((t) => t.device_id === o.ref_id);
        const est = estadoDe(o.estado);
        return (
          <Tarjeta
            key={o.ref_id}
            titulo={`🛜 ${o.label}`}
            descripcion={[
              donde(o),
              [o.vendor, o.model].filter(Boolean).join(' ') || null,
              o.mgmt_ip,
              `${o.pon_patcheados} de ${o.puertos_pon} PON patcheados`,
            ]
              .filter(Boolean)
              .join(' · ')}
            acciones={<NuevaTarjeta olts={[{ id: o.ref_id, name: o.label }]} />}
          >
            <p className={`mb-3 inline-flex items-center gap-1.5 text-xs font-medium ${est.texto}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${est.punto}`} aria-hidden="true" />
              <span className="font-mono" aria-hidden="true">
                {est.icono}
              </span>
              {est.rotulo}
            </p>

            {suyas.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-aviso">
                Esta OLT no tiene una sola tarjeta, así que no tiene ningún puerto PON. Sin puertos
                no se le puede patchear el ODF ni colgar un cliente. Agrégale una con el botón de
                arriba.
              </p>
            ) : (
              <div className="space-y-4">
                {suyas.map((t) => {
                  const puertos = pones.filter((p) => p.card_id === t.id);
                  return (
                    <div key={t.id}>
                      <p className="mb-2 text-sm font-medium text-marino-700">
                        Tarjeta · slot {t.slot_number}
                        {t.card_type && (
                          <span className="ml-2 font-normal text-marino-400">{t.card_type}</span>
                        )}
                        <span className="ml-2 text-xs font-normal text-marino-400">
                          {t.patcheados} de {t.puertos} patcheados
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {puertos.map((p) => (
                          <span
                            key={p.id}
                            title={
                              p.odf
                                ? `${p.etiqueta} → ${p.odf} bandeja ${p.tray_number} puerto ${p.odf_port_number}${
                                    p.cable ? ` → ${p.cable} hilo ${p.strand_number}` : ''
                                  }`
                                : `${p.etiqueta} · sin patchear`
                            }
                            className={`rounded-md border px-2 py-1 font-mono text-xs ${
                              p.odf_port_id
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : 'border-marino-200 bg-white text-marino-500'
                            }`}
                          >
                            {p.odf_port_id ? '▣' : '○'} {p.etiqueta}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-marino-400">
                  <span className="font-mono">▣</span> ya tiene latiguillo al ODF ·{' '}
                  <span className="font-mono">○</span> libre. Pasa el cursor por uno para ver a
                  dónde va.
                </p>
              </div>
            )}
          </Tarjeta>
        );
      })}

      {odfs.map((o) => {
        const suyos = puertosOdf.filter((p) => p.odf_id === o.ref_id);
        const bandejas = [...new Set(suyos.map((p) => p.tray_number))].sort((a, b) => a - b);
        return (
          <Tarjeta
            key={o.ref_id}
            titulo={`🧷 ${o.label}`}
            descripcion={[donde(o), `${suyos.length} puertos`, `${o.odf_libres} libres`].join(
              ' · ',
            )}
            acciones={<NuevasBandejas odfs={[{ id: o.ref_id, code: o.label }]} />}
          >
            {suyos.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-aviso">
                Este ODF no tiene bandejas abiertas. Sin puertos, el cable de la calle no tiene de
                dónde salir y la ruta de los clientes queda cortada aquí en la caseta. Ábrelas con
                el botón de arriba.
              </p>
            ) : (
              bandejas.map((b) => (
                <div key={b} className="mb-4 last:mb-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-marino-400">
                    Bandeja {b}
                  </p>
                  <div className="space-y-1">
                    {suyos
                      .filter((p) => p.tray_number === b)
                      .map((p) => (
                        <div key={p.id} className="rounded-lg border border-marino-100 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="w-8 shrink-0 font-mono font-semibold text-marino-800">
                              {p.port_number}
                            </span>
                            {p.pon ? (
                              <span className="text-marino-600">
                                <span className="text-marino-400">entra</span>{' '}
                                <span className="font-mono">{p.pon}</span>
                                <span className="text-marino-400"> de {p.olt}</span>
                                {p.jumper_code && (
                                  <span className="ml-1 text-marino-400">
                                    · latiguillo {p.jumper_code}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-marino-300">sin PON</span>
                            )}
                            <span className="text-marino-300">→</span>
                            {p.cable ? (
                              <span className="text-marino-600">
                                <span className="font-mono">{p.cable}</span>
                                <span className="text-marino-400">
                                  {' '}
                                  hilo {p.strand_number} ({p.color_hilo})
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-marino-300">sin cable</span>
                            )}
                            {p.connector && <Insignia tono="neutro">{p.connector}</Insignia>}
                            <span className="ml-auto flex items-center gap-1">
                              {p.status === 'ocupado' && <VaciarPuerto puerto={p} />}
                              <Patchear puerto={p} pones={pones} hilos={hilos} />
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))
            )}
          </Tarjeta>
        );
      })}
    </div>
  );
}
