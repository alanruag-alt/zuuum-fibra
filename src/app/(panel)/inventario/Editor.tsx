'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { guardarArticulo, moverInventario } from '@/modulos/almacen/acciones';
import { CATEGORIA, UNIDAD } from '@/modulos/almacen/etiquetas';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Articulo, Sucursal } from '@/modulos/almacen/tipos';
import type { Persona } from '@/modulos/admin/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

function Aviso({ estado }: { estado: Respuesta | null }) {
  if (!estado) return null;
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${
        estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
      }`}
    >
      {estado.mensaje}
    </p>
  );
}

export function NuevoArticulo({ articulo }: { articulo?: Articulo }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarArticulo,
    null,
  );

  if (!abierto) {
    return articulo ? (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        editar
      </Boton>
    ) : (
      <Boton onClick={() => setAbierto(true)}>Dar de alta un artículo</Boton>
    );
  }

  return (
    <Tarjeta titulo={articulo ? `Editar ${articulo.name}` : 'Nuevo artículo'} className="w-full">
      <Aviso estado={estado} />
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          {articulo && <input type="hidden" name="id" value={articulo.id} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Clave</span>
              <input
                name="sku"
                required
                defaultValue={articulo?.sku}
                placeholder="ONT-HW-8310"
                className={CAMPO}
                autoFocus
              />
              <span className="mt-1 block text-xs text-marino-400">
                Corta y que se entienda. Es la que se dicta por teléfono.
              </span>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Nombre</span>
              <input name="nombre" required defaultValue={articulo?.name} className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Categoría</span>
              <select
                name="categoria"
                defaultValue={articulo?.category ?? 'other'}
                className={CAMPO}
              >
                {Object.entries(CATEGORIA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Se cuenta por</span>
              <select name="unidad" defaultValue={articulo?.unit ?? 'piece'} className={CAMPO}>
                {Object.entries(UNIDAD).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Mínimo antes de avisar</span>
              <input
                name="minimo"
                type="number"
                min="0"
                step="1"
                defaultValue={articulo?.min_stock ?? 0}
                className={CAMPO}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Marca</span>
              <input name="marca" defaultValue={articulo?.brand ?? ''} className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Modelo</span>
              <input name="modelo" defaultValue={articulo?.model ?? ''} className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Costo</span>
              <input
                name="costo"
                type="number"
                min="0"
                step="0.01"
                defaultValue={articulo?.costo ?? ''}
                className={CAMPO}
              />
              <span className="mt-1 block text-xs text-marino-400">
                Solo lo ve quien tiene permiso de finanzas.
              </span>
            </label>
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="con_serie"
              value="si"
              defaultChecked={articulo?.is_serialized ?? false}
              disabled={Boolean(articulo)}
              className="mt-1"
            />
            <span className="text-sm text-marino-600">
              Lleva número de serie
              <span className="mt-0.5 block text-xs text-marino-400">
                ONT, routers y antenas: sí. Cable y conectores: no. Esto no se puede cambiar
                después, porque cambiaría el significado de todo lo ya capturado.
              </span>
            </span>
          </label>

          {articulo && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="activo"
                value="no"
                defaultChecked={!articulo.is_active}
              />
              <span className="text-sm text-marino-600">Ya no se usa</span>
            </label>
          )}

          <div className="flex gap-2">
            <Boton type="submit" cargando={enviando}>
              Guardar
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
      {estado?.ok && (
        <Boton variante="secundario" onClick={() => setAbierto(false)} className="mt-3">
          Cerrar
        </Boton>
      )}
    </Tarjeta>
  );
}

export function Mover({
  articulos,
  sucursales,
  tecnicos,
}: {
  articulos: Articulo[];
  sucursales: Sucursal[];
  tecnicos: Persona[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState('purchase');
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    moverInventario,
    null,
  );

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Registrar movimiento
      </Boton>
    );
  }

  // Cada tipo de movimiento tiene su forma. En vez de enseñar todos los campos
  // y que el usuario adivine, se enseña solo lo que ese movimiento necesita.
  const sale = ['transfer', 'install', 'loss'].includes(tipo);
  const entra = ['purchase', 'transfer', 'return'].includes(tipo);

  return (
    <Tarjeta titulo="Movimiento de almacén" className="w-full">
      <Aviso estado={estado} />
      <form action={accion} className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Qué</span>
            <select
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className={CAMPO}
            >
              <option value="purchase">Entró material nuevo</option>
              <option value="transfer">Traspaso</option>
              <option value="install">Se instaló</option>
              <option value="return">Regresó</option>
              <option value="adjustment">Ajuste de conteo</option>
              <option value="loss">Se perdió</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-marino-600">Artículo</span>
            <select name="articulo" required className={CAMPO}>
              <option value="">Elige</option>
              {articulos
                .filter((a) => a.is_active && !a.is_serialized)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.sku} · {a.name} (hay {a.existencia})
                  </option>
                ))}
            </select>
            <span className="mt-1 block text-xs text-marino-400">
              Los que llevan serie no salen aquí: esos se mueven uno por uno, por su número.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Cuánto</span>
            <input
              name="cantidad"
              type="number"
              min="0.01"
              step="0.01"
              required
              className={CAMPO}
            />
          </label>

          {sale && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-marino-600">Sale de</span>
                <select name="de_tipo" defaultValue="branch" className={CAMPO}>
                  <option value="branch">Bodega</option>
                  <option value="technician">Técnico</option>
                  <option value="vehicle">Camioneta</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-marino-600">Quién / cuál</span>
                <select name="de_id" className={CAMPO}>
                  <option value="">—</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {entra && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-marino-600">Llega a</span>
                <select name="a_tipo" defaultValue="branch" className={CAMPO}>
                  <option value="branch">Bodega</option>
                  <option value="technician">Técnico</option>
                  <option value="vehicle">Camioneta</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-marino-600">Quién / cuál</span>
                <select name="a_id" className={CAMPO}>
                  <option value="">—</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="block sm:col-span-2 lg:col-span-4">
            <span className="text-sm font-medium text-marino-600">Por qué</span>
            <input
              name="motivo"
              placeholder="Factura 1234, conteo del mes, se cayó de la camioneta…"
              className={CAMPO}
            />
            <span className="mt-1 block text-xs text-marino-400">
              Dentro de seis meses, esta línea es lo único que va a explicar el movimiento.
            </span>
          </label>
        </div>

        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Registrar
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
