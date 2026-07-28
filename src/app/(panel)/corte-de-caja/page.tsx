import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import {
  AbrirCaja,
  CerrarCaja,
  EntregarCaja,
  VerificarCaja,
} from '@/app/(panel)/corte-de-caja/AccionesCaja';
import {
  listarCajas,
  miCajaAbierta,
  personasParaEntregar,
  resumenCaja,
} from '@/modulos/caja/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { fechaHora, numero, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { texto: string; tono: 'ok' | 'aviso' | 'falla' | 'neutro' }> = {
  open: { texto: 'Abierta', tono: 'aviso' },
  closed: { texto: 'Cerrada', tono: 'neutro' },
  delivered: { texto: 'Entregada', tono: 'aviso' },
  verified: { texto: 'Verificada', tono: 'ok' },
};

export default async function PaginaCorteDeCaja() {
  const [mia, cajas, resumen, personas, zonas] = await Promise.all([
    miCajaAbierta(),
    listarCajas(),
    resumenCaja(),
    personasParaEntregar(),
    listarZonas(),
  ]);

  const pendientes = cajas.filter((c) => c.status === 'closed' || c.status === 'delivered');

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Corte de caja</h1>
        <p className="mt-1 text-sm text-marino-400">
          El día de cada cobrador: lo que cobró, lo que entregó y si cuadró.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={pesos(resumen.efectivoEnCalle)}
          etiqueta="Efectivo sin entregar"
          tono={resumen.efectivoEnCalle > 0 ? 'aviso' : 'ok'}
          detalle="cobrado pero todavía no entregado"
        />
        <Indicador valor={numero(resumen.abiertas)} etiqueta="Cajas abiertas" />
        <Indicador
          valor={numero(resumen.porVerificar)}
          etiqueta="Por verificar"
          tono={resumen.porVerificar > 0 ? 'aviso' : 'ok'}
        />
        <Indicador
          valor={pesos(resumen.diferenciasDelDia)}
          etiqueta="Diferencias de hoy"
          tono={resumen.diferenciasDelDia === 0 ? 'ok' : 'falla'}
        />
      </div>

      <Tarjeta titulo="Mi caja" className="mb-6">
        {!mia ? (
          <div>
            <p className="mb-3 text-sm text-marino-500">
              No traes caja abierta. Ábrela antes de salir a cobrar: lo que registres se va sumando
              ahí solo, y al final del día ya sabes cuánto debes traer.
            </p>
            <AbrirCaja zonas={zonas} />
          </div>
        ) : (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Indicador valor={numero(mia.pagos)} etiqueta="Pagos" />
              <Indicador
                valor={pesos(mia.efectivo_esperado)}
                etiqueta="Efectivo esperado"
                tono="marca"
              />
              <Indicador valor={pesos(mia.transferencias)} etiqueta="Transferencias" />
              <Indicador valor={mia.zona ?? 'Sin zona'} etiqueta="Zona" />
            </div>
            <p className="mb-3 text-sm text-marino-400">
              Abierta desde {fechaHora(mia.opened_at)}.
            </p>
            <CerrarCaja caja={mia} />
          </div>
        )}
      </Tarjeta>

      {pendientes.length > 0 && (
        <Tarjeta
          titulo="Pendientes de entregar o verificar"
          descripcion="Dinero que ya se contó pero todavía no llega a su lugar."
          className="mb-6"
        >
          <ul className="space-y-3">
            {pendientes.map((c) => {
              const e = ESTADO[c.status] ?? { texto: c.status, tono: 'neutro' as const };
              const dif = Number(c.diferencia ?? 0);
              return (
                <li key={c.id} className="rounded-lg bg-marino-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-marino-800">
                        {c.cobrador} <Insignia tono={e.tono}>{e.texto}</Insignia>
                      </p>
                      <p className="mt-0.5 text-xs text-marino-400">
                        {c.zona ?? 'Sin zona'} · {numero(c.pagos)} pagos · esperado{' '}
                        {pesos(c.efectivo_esperado, true)} · declaró{' '}
                        {c.efectivo_declarado === null ? '—' : pesos(c.efectivo_declarado, true)}
                      </p>
                      {dif !== 0 && (
                        <p className="mt-1 text-xs font-medium text-falla">
                          {dif < 0 ? 'Faltan' : 'Sobran'} {pesos(Math.abs(dif), true)}
                        </p>
                      )}
                    </div>
                    <div>
                      {c.status === 'closed' && <EntregarCaja caja={c} personas={personas} />}
                      {c.status === 'delivered' && <VerificarCaja caja={c} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta titulo="Historial" descripcion="Los últimos cortes que puedes ver.">
        {cajas.length === 0 ? (
          <p className="py-8 text-center text-sm text-marino-300">
            Todavía no hay cortes. El primero se crea al abrir una caja.
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-marino-100">
                  {[
                    'Cobrador',
                    'Zona',
                    'Abrió',
                    'Pagos',
                    'Efectivo',
                    'Declaró',
                    'Diferencia',
                    'Estado',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-marino-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-marino-100">
                {cajas.map((c) => {
                  const e = ESTADO[c.status] ?? { texto: c.status, tono: 'neutro' as const };
                  const dif = c.diferencia === null ? null : Number(c.diferencia);
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-2.5 font-medium text-marino-800">{c.cobrador}</td>
                      <td className="px-3 py-2.5 text-marino-500">{c.zona ?? '—'}</td>
                      <td className="px-3 py-2.5 text-marino-500">{fechaHora(c.opened_at)}</td>
                      <td className="px-3 py-2.5 text-marino-500">{numero(c.pagos)}</td>
                      <td className="px-3 py-2.5 text-marino-800">
                        {pesos(c.efectivo_esperado, true)}
                      </td>
                      <td className="px-3 py-2.5 text-marino-500">
                        {c.efectivo_declarado === null ? '—' : pesos(c.efectivo_declarado, true)}
                      </td>
                      <td className="px-3 py-2.5">
                        {dif === null || c.status === 'open' ? (
                          <span className="text-marino-300">—</span>
                        ) : dif === 0 ? (
                          <span className="text-exito">cuadra</span>
                        ) : (
                          <span className="font-medium text-falla">
                            {dif < 0 ? '−' : '+'}
                            {pesos(Math.abs(dif), true)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Insignia tono={e.tono}>{e.texto}</Insignia>
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
