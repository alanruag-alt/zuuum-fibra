import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditarDispositivo } from '@/app/(panel)/red/Editores';
import { Borrar } from '@/componentes/ui/Borrar';
import { listarDispositivos, listarSitios } from '@/modulos/red/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { ESTADO_DISPOSITIVO, TIPO_DISPOSITIVO, etiqueta } from '@/modulos/red/etiquetas';
import { numero, porcentaje } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaEquiposRed() {
  const [dispositivos, sitios, zonas] = await Promise.all([
    listarDispositivos(),
    listarSitios(),
    listarZonas(),
  ]);

  const activos = dispositivos.filter((d) => d.is_active);
  const caidos = activos.filter((d) => d.status === 'offline');
  const sinSondear = activos.filter((d) => d.status === 'unknown');
  const olts = activos.filter((d) => d.device_type === 'olt');
  const onus = olts.reduce((s, d) => s + Number(d.onus ?? 0), 0);
  const cupo = olts.reduce((s, d) => s + Number(d.cupo_onus ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Equipos de red</h1>
          <p className="mt-1 text-sm text-marino-400">
            OLT, routers, switches y sectores. Todo lo que, si se cae, deja gente sin internet.
          </p>
        </div>
        <EditarDispositivo zonas={zonas} sitios={sitios} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(activos.length)} etiqueta="Equipos en servicio" />
        <Indicador
          valor={numero(caidos.length)}
          etiqueta="No responden"
          tono={caidos.length > 0 ? 'falla' : 'ok'}
        />
        <Indicador
          valor={numero(sinSondear.length)}
          etiqueta="Sin sondear"
          tono={sinSondear.length > 0 ? 'neutro' : 'ok'}
          detalle="falta el agente local"
        />
        <Indicador
          valor={cupo > 0 ? `${numero(onus)} / ${numero(cupo)}` : '—'}
          etiqueta="ONU en las OLT"
          tono="marca"
          detalle={cupo > 0 ? porcentaje(onus, cupo) : 'sin tarjetas capturadas'}
        />
      </div>

      {caidos.length > 0 && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-falla">
          <strong>{caidos.length}</strong> {caidos.length === 1 ? 'equipo' : 'equipos'} sin
          responder: {caidos.map((d) => d.name).join(', ')}.
        </div>
      )}

      <div className="mb-6 rounded-lg bg-marino-50 px-4 py-3 text-sm text-marino-500">
        El estado de cada equipo lo va a escribir el agente local que corre en la oficina, no una
        persona. Mientras ese agente no esté instalado, todos van a aparecer{' '}
        <strong>sin sondear</strong>, y eso es correcto: es mejor decir «no sé» que inventar que
        todo está bien.
      </div>

      <Tarjeta>
        {dispositivos.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">🖧</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay equipos</p>
            <p className="mt-1 text-sm text-marino-400">
              Empieza por la OLT y el router de borde. Solo nombre, tipo e IP: nunca contraseñas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                  <th className="pb-2 pr-3 font-medium">Equipo</th>
                  <th className="pb-2 pr-3 font-medium">Tipo</th>
                  <th className="pb-2 pr-3 font-medium">Sitio / zona</th>
                  <th className="pb-2 pr-3 font-medium">IP</th>
                  <th className="pb-2 pr-3 font-medium">Estado</th>
                  <th className="pb-2 pr-3 text-right font-medium">ONU</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-marino-100">
                {dispositivos.map((d) => {
                  const e = etiqueta(ESTADO_DISPOSITIVO, d.status);
                  return (
                    <tr key={d.id} className={d.is_active ? '' : 'opacity-50'}>
                      <td className="py-2.5 pr-3 font-medium text-marino-800">
                        {d.name}
                        {(d.vendor || d.model) && (
                          <span className="mt-0.5 block text-xs text-marino-400">
                            {[d.vendor, d.model].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-marino-500">
                        {TIPO_DISPOSITIVO[d.device_type] ?? d.device_type}
                      </td>
                      <td className="py-2.5 pr-3 text-marino-500">
                        {[d.sitio, d.zona].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-marino-500">
                        {d.mgmt_ip ?? '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Insignia tono={e.tono}>{e.texto}</Insignia>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-marino-600">
                        {d.cupo_onus > 0 ? `${numero(d.onus)}/${numero(d.cupo_onus)}` : '—'}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-start justify-end gap-1">
                          <EditarDispositivo zonas={zonas} sitios={sitios} dispositivo={d} />
                          <Borrar tipo="dispositivo" id={d.id} nombre={d.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
