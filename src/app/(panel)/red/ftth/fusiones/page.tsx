import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { BorrarFusion, NuevaFusion, Renglon } from '@/app/(panel)/red/ftth/fusiones/Editor';
import {
  hilosParaFusionar,
  listarCajas,
  listarFusiones,
  listarNaps,
} from '@/modulos/ftth/consultas';
import { ESTADO_FUSION, TIPO_EMPALME, etiqueta } from '@/modulos/ftth/etiquetas';
import { numero } from '@/lib/formato';
import type { ElementoRed } from '@/modulos/red/tipos';

export const dynamic = 'force-dynamic';

export default async function PaginaFusiones() {
  const [fusiones, cajas, naps, hilos] = await Promise.all([
    listarFusiones(),
    listarCajas(),
    listarNaps(),
    hilosParaFusionar(),
  ]);

  const activas = fusiones.filter((f) => f.status === 'activa');
  const conPerdida = activas.filter((f) => f.loss_db !== null);
  const promedio = conPerdida.length
    ? conPerdida.reduce((s, f) => s + Number(f.loss_db), 0) / conPerdida.length
    : null;
  // Una fusión buena anda por debajo de 0.10 dB. Arriba de 0.30 hay que
  // volver a hacerla: esa pérdida se le va a notar al cliente del final.
  const malas = activas.filter((f) => Number(f.loss_db ?? 0) > 0.3);
  const sinMedir = activas.filter((f) => f.loss_db === null);

  const porCaja = new Map<string, typeof fusiones>();
  for (const f of fusiones) {
    const k = f.caja;
    if (!porCaja.has(k)) porCaja.set(k, []);
    porCaja.get(k)!.push(f);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-marino-500">
          Qué se pegó con qué, dentro de cada caja. Es lo que permite seguir la luz.
        </p>
        <NuevaFusion
          cajas={cajas as unknown as ElementoRed[]}
          naps={naps as unknown as ElementoRed[]}
          hilos={hilos}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(activas.length)} etiqueta="Fusiones activas" />
        <Indicador valor={numero(porCaja.size)} etiqueta="Cajas con trabajo" tono="marca" />
        <Indicador
          valor={promedio !== null ? `${promedio.toFixed(2)} dB` : '—'}
          etiqueta="Pérdida promedio"
          tono={promedio !== null && promedio > 0.15 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={numero(malas.length)}
          etiqueta="Por rehacer"
          tono={malas.length > 0 ? 'falla' : 'ok'}
          detalle="más de 0.30 dB"
        />
      </div>

      {malas.length > 0 && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-falla">
          <strong>{malas.length}</strong> {malas.length === 1 ? 'fusión pasa' : 'fusiones pasan'} de
          0.30 dB: {malas.map((f) => `${f.caja} (${f.loss_db} dB)`).join(', ')}. Esa pérdida se le
          nota al cliente del final; conviene rehacerlas antes de que reporte.
        </div>
      )}

      {sinMedir.length > 0 && (
        <div className="mb-6 rounded-lg bg-marino-50 px-4 py-3 text-sm text-marino-500">
          <strong>{sinMedir.length}</strong>{' '}
          {sinMedir.length === 1 ? 'fusión no tiene' : 'fusiones no tienen'} su pérdida capturada.
          El número lo da la fusionadora en el momento; después ya no hay de dónde sacarlo.
        </div>
      )}

      {fusiones.length === 0 ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">🔗</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay fusiones</p>
            <p className="mt-1 text-sm text-marino-400">
              Captura las de una caja y ya podrás trazar de punta a punta.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          {[...porCaja.entries()].map(([caja, lista]) => (
            <Tarjeta
              key={caja}
              titulo={caja}
              descripcion={`${lista.length} ${lista.length === 1 ? 'fusión' : 'fusiones'}${
                lista[0].zona ? ` · ${lista[0].zona}` : ''
              }`}
            >
              <ul className="divide-y divide-marino-100">
                {lista.map((f) => {
                  const e = etiqueta(ESTADO_FUSION, f.status);
                  const alta = Number(f.loss_db ?? 0) > 0.3;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Renglon f={f} />
                      <span className="text-xs text-marino-400">
                        {TIPO_EMPALME[f.splice_type] ?? f.splice_type}
                      </span>
                      {f.loss_db !== null ? (
                        <Insignia tono={alta ? 'falla' : 'ok'}>{f.loss_db} dB</Insignia>
                      ) : (
                        <Insignia tono="neutro">sin medir</Insignia>
                      )}
                      {f.status !== 'activa' && <Insignia tono={e.tono}>{e.texto}</Insignia>}
                      {f.notes && <span className="text-xs text-marino-400">{f.notes}</span>}
                      <span className="ml-auto">
                        <BorrarFusion fusion={f} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Tarjeta>
          ))}
        </div>
      )}
    </div>
  );
}
