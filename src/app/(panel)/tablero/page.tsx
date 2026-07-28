import { Indicador } from '@/componentes/ui/Indicador';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Tabla } from '@/componentes/ui/Tabla';
import { Insignia } from '@/componentes/ui/Insignia';
import { AvisoDatosSimulados } from '@/componentes/ui/AvisoDatosSimulados';
import { ACTIVIDAD, PENDIENTES, RESUMEN, ZONAS } from '@/modulos/tablero/datos-simulados';
import { numero, pesos, porcentaje } from '@/lib/formato';

const TONO_GRAVEDAD = {
  alta: 'falla',
  media: 'aviso',
  baja: 'neutro',
} as const;

export default function PaginaTablero() {
  const avance = porcentaje(RESUMEN.cobradoDelMes, RESUMEN.esperadoDelMes);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Tablero</h1>
        <p className="mt-1 text-sm text-marino-400">Cómo va la operación en este momento.</p>
      </div>

      <AvisoDatosSimulados />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(RESUMEN.clientesActivos)} etiqueta="Clientes activos" tono="ok" />
        <Indicador
          valor={numero(RESUMEN.clientesMorosos)}
          etiqueta="Morosos"
          tono={RESUMEN.clientesMorosos > 0 ? 'aviso' : 'ok'}
          detalle="se cortan el día 11"
        />
        <Indicador valor={numero(RESUMEN.onuEnLinea)} etiqueta="Equipos en línea" tono="ok" />
        <Indicador
          valor={numero(RESUMEN.onuFueraDeLinea)}
          etiqueta="Fuera de línea"
          tono={RESUMEN.onuFueraDeLinea > 0 ? 'falla' : 'ok'}
        />
        <Indicador
          valor={numero(RESUMEN.senalARevisar)}
          etiqueta="Señal a revisar"
          tono="aviso"
          detalle="bajo −25 dBm"
        />
        <Indicador
          valor={numero(RESUMEN.instalacionesHoy)}
          etiqueta="Instalaciones hoy"
          tono="marca"
        />
        <Indicador
          valor={numero(RESUMEN.ticketsAbiertos)}
          etiqueta="Tickets abiertos"
          tono={RESUMEN.ticketsAbiertos > 5 ? 'aviso' : 'neutro'}
        />
        <Indicador
          valor={avance}
          etiqueta="Cobranza del mes"
          tono="ok"
          detalle={`${pesos(RESUMEN.cobradoDelMes)} de ${pesos(RESUMEN.esperadoDelMes)}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Tarjeta
          titulo="Lo que hay que atender"
          descripcion="Los problemas reales del momento, ordenados por gravedad."
          className="lg:col-span-1"
        >
          <ul className="space-y-2.5">
            {PENDIENTES.map((p) => (
              <li key={p.id} className="rounded-lg bg-marino-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-marino-800">{p.titulo}</p>
                  <Insignia tono={TONO_GRAVEDAD[p.gravedad]}>{p.gravedad}</Insignia>
                </div>
                <p className="mt-1 text-xs text-marino-400">{p.detalle}</p>
              </li>
            ))}
          </ul>
        </Tarjeta>

        <Tarjeta
          titulo="Cobranza por zona"
          descripcion="Cómo va cada zona en el periodo en curso."
          className="lg:col-span-2"
        >
          <Tabla encabezados={['Zona', 'Clientes', 'Pagaron', 'Avance', 'Cobrado']}>
            {ZONAS.map((z) => (
              <tr key={z.id}>
                <td className="px-3 py-2 font-medium text-marino-800">{z.nombre}</td>
                <td className="px-3 py-2 text-marino-600">{numero(z.clientes)}</td>
                <td className="px-3 py-2 text-marino-600">{numero(z.cobrados)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-marino-100">
                      <div
                        className="h-full rounded-full bg-exito"
                        style={{ width: porcentaje(z.cobrados, z.clientes) }}
                      />
                    </div>
                    <span className="text-xs text-marino-400">
                      {porcentaje(z.cobrados, z.clientes)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 font-medium text-marino-800">{pesos(z.cobrado)}</td>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      </div>

      <div className="mt-5">
        <Tarjeta titulo="Actividad reciente" descripcion="Lo último que pasó en el sistema.">
          <ul className="divide-y divide-marino-100">
            {ACTIVIDAD.map((a) => (
              <li key={a.id} className="flex items-baseline gap-3 py-2.5">
                <span className="w-24 shrink-0 text-xs text-marino-300">{a.cuando}</span>
                <span className="text-sm text-marino-800">{a.texto}</span>
                <span className="ml-auto text-xs text-marino-300">{a.quien}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  );
}
