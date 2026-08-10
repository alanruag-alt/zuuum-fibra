import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Mover, NuevoArticulo } from '@/app/(panel)/inventario/Editor';
import { listarArticulos, listarMovimientos, listarSucursales } from '@/modulos/almacen/consultas';
import { tecnicosDisponibles } from '@/modulos/campo/consultas';
import { CATEGORIA, DONDE, MOVIMIENTO, UNIDAD, etiqueta } from '@/modulos/almacen/etiquetas';
import { fechaHora, numero, pesos } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaInventario() {
  const [articulos, movimientos, sucursales, tecnicos] = await Promise.all([
    listarArticulos(),
    listarMovimientos(40),
    listarSucursales(),
    tecnicosDisponibles(),
  ]);

  const activos = articulos.filter((a) => a.is_active);
  const bajos = activos.filter((a) => a.min_stock > 0 && a.existencia <= a.min_stock);
  const conSerie = activos.filter((a) => a.is_serialized);
  const librés = conSerie.reduce((s, a) => s + Number(a.equipos_libres ?? 0), 0);

  // El costo solo llega si la persona tiene permiso de finanzas. Si viene
  // null en todos, ni siquiera se enseña la columna: mejor nada que un guion.
  const veCosto = articulos.some((a) => a.costo !== null);
  const valor = veCosto
    ? articulos.reduce((s, a) => s + Number(a.costo ?? 0) * Number(a.existencia ?? 0), 0)
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Inventario</h1>
          <p className="mt-1 text-sm text-marino-400">
            Lo que hay en la bodega, con quién anda y a dónde se fue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Mover articulos={articulos} sucursales={sucursales} tecnicos={tecnicos} />
          <NuevoArticulo />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(activos.length)} etiqueta="Artículos" />
        <Indicador
          valor={numero(bajos.length)}
          etiqueta="Por acabarse"
          tono={bajos.length > 0 ? 'aviso' : 'ok'}
          detalle={bajos.length > 0 ? 'ya llegaron al mínimo' : 'todo con existencia'}
        />
        <Indicador valor={numero(librés)} etiqueta="Equipos libres" tono="marca" />
        {valor !== null ? (
          <Indicador valor={pesos(valor)} etiqueta="Valor del almacén" />
        ) : (
          <Indicador valor="—" etiqueta="Valor del almacén" detalle="requiere finanzas" />
        )}
      </div>

      {bajos.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          <strong>{bajos.length}</strong>{' '}
          {bajos.length === 1 ? 'artículo llegó' : 'artículos llegaron'} a su mínimo:{' '}
          {bajos.map((a) => a.name).join(', ')}. Encargarlo hoy es más barato que parar una
          instalación el viernes.
        </div>
      )}

      <Tarjeta
        titulo="Existencias"
        acciones={
          <Link href="/inventario/series" className="text-sm text-naranja-600 hover:underline">
            equipos con serie →
          </Link>
        }
      >
        {articulos.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">📦</p>
            <p className="mt-3 text-sm font-medium text-marino-800">El almacén está vacío</p>
            <p className="mt-1 text-sm text-marino-400">
              Empieza dando de alta lo que más se usa: ONT, conector, cable y NAP.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-marino-100 text-left text-xs uppercase tracking-wide text-marino-400">
                  <th className="pb-2 pr-3 font-medium">Clave</th>
                  <th className="pb-2 pr-3 font-medium">Artículo</th>
                  <th className="pb-2 pr-3 font-medium">Categoría</th>
                  <th className="pb-2 pr-3 text-right font-medium">Hay</th>
                  <th className="pb-2 pr-3 text-right font-medium">Mínimo</th>
                  {veCosto && <th className="pb-2 pr-3 text-right font-medium">Costo</th>}
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-marino-100">
                {articulos.map((a) => {
                  const bajo = a.min_stock > 0 && a.existencia <= a.min_stock;
                  return (
                    <tr key={a.id} className={a.is_active ? '' : 'opacity-50'}>
                      <td className="py-2.5 pr-3 font-mono text-xs text-marino-500">{a.sku}</td>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-marino-800">{a.name}</span>
                        {a.is_serialized && (
                          <Insignia tono="marca">
                            <span className="ml-0">con serie</span>
                          </Insignia>
                        )}
                        {(a.brand || a.model) && (
                          <span className="ml-2 text-xs text-marino-400">
                            {[a.brand, a.model].filter(Boolean).join(' ')}
                          </span>
                        )}
                        {a.is_serialized && (
                          <span className="mt-0.5 block text-xs text-marino-400">
                            {numero(a.equipos_libres)} libres · {numero(a.equipos_instalados)}{' '}
                            instalados
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-marino-500">
                        {CATEGORIA[a.category] ?? a.category}
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right font-medium ${
                          bajo ? 'text-aviso' : 'text-marino-800'
                        }`}
                      >
                        {numero(a.existencia)}{' '}
                        <span className="text-xs font-normal text-marino-400">
                          {UNIDAD[a.unit] ?? a.unit}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-marino-400">
                        {a.min_stock > 0 ? numero(a.min_stock) : '—'}
                      </td>
                      {veCosto && (
                        <td className="py-2.5 pr-3 text-right text-marino-500">
                          {a.costo === null ? '—' : pesos(Number(a.costo), true)}
                        </td>
                      )}
                      <td className="py-2.5 text-right">
                        <NuevoArticulo articulo={a} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <div className="mt-6">
        <Tarjeta
          titulo="Últimos movimientos"
          descripcion="Todo lo que entró y salió, y quién lo movió."
        >
          {movimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-marino-400">Todavía no hay movimientos.</p>
          ) : (
            <ul className="divide-y divide-marino-100">
              {movimientos.map((m) => {
                const t = etiqueta(MOVIMIENTO, m.movement_type);
                return (
                  <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5">
                    <Insignia tono={t.tono}>{t.texto}</Insignia>
                    <span className="font-medium text-marino-800">
                      {numero(m.quantity)} × {m.articulo ?? '—'}
                    </span>
                    {m.serial_number && (
                      <span className="font-mono text-xs text-marino-500">{m.serial_number}</span>
                    )}
                    <span className="text-sm text-marino-500">
                      {m.from_type && `de ${DONDE[m.from_type] ?? m.from_type}`}
                      {m.from_type && m.to_type && ' → '}
                      {m.to_type && `a ${DONDE[m.to_type] ?? m.to_type}`}
                    </span>
                    {m.reason && <span className="text-xs text-marino-400">· {m.reason}</span>}
                    <span className="ml-auto text-xs text-marino-300">
                      {m.quien ?? '—'} · {fechaHora(m.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
