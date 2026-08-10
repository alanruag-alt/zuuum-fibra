import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Instalar, NuevoEquipo, Retirar } from '@/app/(panel)/inventario/series/Editor';
import { listarArticulos, listarEquipos, listarSucursales } from '@/modulos/almacen/consultas';
import { ESTADO_EQUIPO, etiqueta } from '@/modulos/almacen/etiquetas';
import { fecha, numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ buscar?: string; estado?: string }>;
}

export default async function PaginaEquipos({ searchParams }: Props) {
  const filtros = await searchParams;

  const [equipos, articulos, sucursales] = await Promise.all([
    listarEquipos({ buscar: filtros.buscar, estado: filtros.estado }),
    listarArticulos(),
    listarSucursales(),
  ]);

  const enAlmacen = equipos.filter((e) => e.status === 'in_stock').length;
  const instalados = equipos.filter((e) => e.status === 'installed').length;
  const perdidos = equipos.filter((e) => e.status === 'lost').length;
  // Un equipo que ya se instaló tres veces es un equipo que va a volver. Se
  // marca aquí para poder retirarlo antes de que falle en casa de alguien.
  const cansados = equipos.filter((e) => e.install_count >= 3);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Equipos con serie</h1>
          <p className="mt-1 text-sm text-marino-400">
            Cada ONT, router y antena, con su número y dónde anda.
          </p>
        </div>
        <NuevoEquipo articulos={articulos} sucursales={sucursales} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(enAlmacen)} etiqueta="En almacén" tono="ok" />
        <Indicador valor={numero(instalados)} etiqueta="Instalados" tono="marca" />
        <Indicador
          valor={numero(cansados.length)}
          etiqueta="Ya muy usados"
          tono={cansados.length > 0 ? 'aviso' : 'neutro'}
          detalle="3 instalaciones o más"
        />
        <Indicador
          valor={numero(perdidos)}
          etiqueta="Perdidos"
          tono={perdidos > 0 ? 'falla' : 'ok'}
        />
      </div>

      <Tarjeta>
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[220px]">
            <span className="text-xs font-medium text-marino-600">Buscar</span>
            <input
              name="buscar"
              defaultValue={filtros.buscar ?? ''}
              placeholder="Serie, GPON, nombre o clave del cliente"
              className="mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Estado</span>
            <select
              name="estado"
              defaultValue={filtros.estado ?? ''}
              className="mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none"
            >
              <option value="">Todos</option>
              <option value="in_stock">En almacén</option>
              <option value="assigned">Con el técnico</option>
              <option value="installed">Instalados</option>
              <option value="faulty">Descompuestos</option>
              <option value="lost">Perdidos</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-naranja-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-naranja-600"
          >
            Buscar
          </button>
          {(filtros.buscar || filtros.estado) && (
            <Link
              href="/inventario/series"
              className="px-2 py-2.5 text-sm text-marino-500 hover:underline"
            >
              limpiar
            </Link>
          )}
        </form>

        {equipos.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">🏷️</p>
            <p className="mt-3 text-sm font-medium text-marino-800">
              {filtros.buscar || filtros.estado
                ? 'Nada con esos filtros'
                : 'Todavía no hay equipos capturados'}
            </p>
            <p className="mt-1 text-sm text-marino-400">
              El día que alguien no devuelva un ONT, esta lista es la que dice cuál era y de quién.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-marino-100">
            {equipos.map((e) => {
              const s = etiqueta(ESTADO_EQUIPO, e.status);
              return (
                <li key={e.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium text-marino-800">
                          {e.serial_number}
                        </span>
                        <Insignia tono={s.tono}>{s.texto}</Insignia>
                        {e.install_count >= 3 && <Insignia tono="aviso">muy usado</Insignia>}
                      </div>
                      <p className="mt-0.5 text-sm text-marino-500">
                        {[e.articulo, [e.brand, e.model].filter(Boolean).join(' ')]
                          .filter(Boolean)
                          .join(' · ') || 'Sin clasificar'}
                        {e.gpon_serial && ` · GPON ${e.gpon_serial}`}
                      </p>
                      {e.cliente && (
                        <p className="mt-0.5 text-sm">
                          <Link
                            href={`/clientes/${e.customer_id}`}
                            className="text-naranja-600 hover:underline"
                          >
                            {e.cliente}
                          </Link>
                          <span className="text-marino-400">
                            {' '}
                            · {e.customer_code} · {e.zona}
                            {e.installed_at && ` · desde ${fecha(e.installed_at)}`}
                          </span>
                        </p>
                      )}
                      {e.notes && <p className="mt-0.5 text-xs text-marino-400">{e.notes}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {e.install_count > 0 && (
                        <span className="mr-2 text-xs text-marino-300">
                          {e.install_count}{' '}
                          {e.install_count === 1 ? 'instalación' : 'instalaciones'}
                        </span>
                      )}
                      {e.status === 'in_stock' && <Instalar equipo={e} />}
                      {e.status === 'installed' && <Retirar equipo={e} sucursales={sucursales} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
