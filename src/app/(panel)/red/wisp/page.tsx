import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditarDispositivo, EditarSitio } from '@/app/(panel)/red/Editores';
import { Borrar } from '@/componentes/ui/Borrar';
import { listarDispositivos, listarSitios } from '@/modulos/red/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import {
  ESTADO_DISPOSITIVO,
  TIPO_DISPOSITIVO,
  TIPO_SITIO,
  etiqueta,
} from '@/modulos/red/etiquetas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaWISP() {
  const [sitios, dispositivos, zonas] = await Promise.all([
    listarSitios(),
    listarDispositivos(['sector', 'ap', 'router', 'switch']),
    listarZonas(),
  ]);

  const activos = sitios.filter((s) => s.is_active);
  const conProblema = activos.filter((s) => s.caidos > 0);
  const sinEquipo = activos.filter((s) => s.dispositivos === 0);
  const sectores = dispositivos.filter((d) => d.device_type === 'sector').length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Red WISP</h1>
          <p className="mt-1 text-sm text-marino-400">
            Las torres y los sectores. Hoy es la red que da servicio a la mayoría del padrón.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditarDispositivo zonas={zonas} sitios={sitios} tipoPorDefecto="sector" />
          <EditarSitio zonas={zonas} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(activos.length)} etiqueta="Sitios" />
        <Indicador valor={numero(sectores)} etiqueta="Sectores" tono="marca" />
        <Indicador
          valor={numero(conProblema.length)}
          etiqueta="Sitios con algo caído"
          tono={conProblema.length > 0 ? 'falla' : 'ok'}
        />
        <Indicador
          valor={numero(sinEquipo.length)}
          etiqueta="Sitios sin equipo capturado"
          tono={sinEquipo.length > 0 ? 'aviso' : 'ok'}
        />
      </div>

      {conProblema.length > 0 && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-falla">
          No responden equipos en {conProblema.map((s) => s.name).join(', ')}. Si el sitio da
          servicio a una localidad completa, ahí está la razón de los reportes de hoy.
        </div>
      )}

      <div className="space-y-5">
        {sitios.length === 0 ? (
          <Tarjeta>
            <div className="py-12 text-center">
              <p className="text-3xl">📡</p>
              <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay sitios</p>
              <p className="mt-1 text-sm text-marino-400">
                Captura cada torre con sus coordenadas. Es lo que permite saber, cuando algo se cae,
                a cuánta gente afecta y a dónde hay que subir.
              </p>
            </div>
          </Tarjeta>
        ) : (
          sitios.map((s) => {
            const suyos = dispositivos.filter((d) => d.sitio === s.name);
            return (
              <Tarjeta
                key={s.id}
                titulo={s.name}
                descripcion={[
                  TIPO_SITIO[s.type] ?? s.type,
                  s.zona,
                  s.latitude !== null && s.longitude !== null
                    ? `${Number(s.latitude).toFixed(5)}, ${Number(s.longitude).toFixed(5)}`
                    : 'sin coordenadas',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                acciones={
                  <div className="flex items-start gap-1">
                    <EditarSitio zonas={zonas} sitio={s} />
                    <Borrar tipo="sitio" id={s.id} nombre={s.name} />
                  </div>
                }
                className={s.is_active ? '' : 'opacity-60'}
              >
                {suyos.length === 0 ? (
                  <p className="py-3 text-sm text-marino-400">
                    Sin equipos capturados en este sitio.
                  </p>
                ) : (
                  <ul className="divide-y divide-marino-100">
                    {suyos.map((d) => {
                      const e = etiqueta(ESTADO_DISPOSITIVO, d.status);
                      return (
                        <li
                          key={d.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
                        >
                          <span className="font-medium text-marino-800">{d.name}</span>
                          <Insignia tono={e.tono}>{e.texto}</Insignia>
                          <span className="text-sm text-marino-500">
                            {TIPO_DISPOSITIVO[d.device_type] ?? d.device_type}
                            {(d.vendor || d.model) &&
                              ` · ${[d.vendor, d.model].filter(Boolean).join(' ')}`}
                          </span>
                          {d.mgmt_ip && (
                            <span className="font-mono text-xs text-marino-400">{d.mgmt_ip}</span>
                          )}
                          <span className="ml-auto flex items-start gap-1">
                            <EditarDispositivo zonas={zonas} sitios={sitios} dispositivo={d} />
                            <Borrar tipo="dispositivo" id={d.id} nombre={d.name} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Tarjeta>
            );
          })
        )}
      </div>
    </div>
  );
}
