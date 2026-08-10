'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { altaEquipo, instalarEquipo, recuperarEquipo } from '@/modulos/almacen/acciones';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Articulo, Equipo, Sucursal } from '@/modulos/almacen/tipos';

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

export function NuevoEquipo({
  articulos,
  sucursales,
}: {
  articulos: Articulo[];
  sucursales: Sucursal[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(altaEquipo, null);

  if (!abierto) return <Boton onClick={() => setAbierto(true)}>Dar de alta un equipo</Boton>;

  return (
    <Tarjeta titulo="Equipo nuevo" className="w-full">
      <Aviso estado={estado} />
      <form action={accion} className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Número de serie</span>
            <input name="serie" required className={CAMPO} autoFocus autoComplete="off" />
            <span className="mt-1 block text-xs text-marino-400">
              Como venga: se guarda en mayúsculas y sin guiones.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Serie GPON</span>
            <input name="gpon" className={CAMPO} autoComplete="off" />
            <span className="mt-1 block text-xs text-marino-400">
              La que ve la OLT. Solo para ONT.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">MAC</span>
            <input name="mac" className={CAMPO} autoComplete="off" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-marino-600">Qué artículo es</span>
            <select name="articulo" className={CAMPO}>
              <option value="">Sin clasificar</option>
              {articulos
                .filter((a) => a.is_serialized && a.is_active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.sku} · {a.name}
                  </option>
                ))}
            </select>
            <span className="mt-1 block text-xs text-marino-400">
              Sin esto el equipo existe, pero no suma al conteo del almacén.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Dónde queda</span>
            <select name="donde_id" className={CAMPO}>
              <option value="">—</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input type="hidden" name="donde_tipo" value="branch" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Marca</span>
            <input name="marca" className={CAMPO} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Modelo</span>
            <input name="modelo" className={CAMPO} />
          </label>
        </div>
        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Guardar
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

export function Instalar({ equipo }: { equipo: Equipo }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    instalarEquipo,
    null,
  );

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        instalar
      </Boton>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-naranja-200 bg-naranja-50/50 p-3">
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="serie" value={equipo.serial_number} />
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Clave del cliente</span>
          <input
            name="codigo"
            required
            placeholder="CL-CUE-0123"
            className={`${CAMPO} w-44 font-mono`}
            autoFocus
            autoComplete="off"
          />
        </label>
        <Boton type="submit" cargando={enviando}>
          Instalar
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

/**
 * Retirar.
 *
 * La pregunta que decide todo es una sola: ¿lo devolvió o no? Por eso son dos
 * botones distintos y no un menú. El de «no lo devolvió» avisa que va a
 * generar un cargo antes de que se le dé, porque es dinero del cliente.
 */
export function Retirar({ equipo, sucursales }: { equipo: Equipo; sucursales: Sucursal[] }) {
  const [abierto, setAbierto] = useState(false);
  const [devuelto, setDevuelto] = useState(true);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    recuperarEquipo,
    null,
  );

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        retirar
      </Boton>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-marino-200 bg-marino-50/50 p-3">
      <p className="mb-2 text-sm text-marino-600">
        Retirar <strong>{equipo.serial_number}</strong> de {equipo.cliente ?? 'su domicilio'}.
      </p>
      <form action={accion} className="space-y-3">
        <input type="hidden" name="serie" value={equipo.serial_number} />
        <input type="hidden" name="devuelto" value={devuelto ? 'si' : 'no'} />

        <div className="flex flex-wrap gap-2">
          <Boton
            type="button"
            variante={devuelto ? 'principal' : 'secundario'}
            onClick={() => setDevuelto(true)}
          >
            Sí lo devolvió
          </Boton>
          <Boton
            type="button"
            variante={devuelto ? 'secundario' : 'oscuro'}
            onClick={() => setDevuelto(false)}
          >
            No lo devolvió
          </Boton>
        </div>

        {devuelto ? (
          <label className="block max-w-xs">
            <span className="text-xs font-medium text-marino-600">Regresa a</span>
            <select name="donde_id" className={CAMPO}>
              <option value="">—</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-aviso">
            Se va a generar un cargo al cliente por el equipo no devuelto, con el monto que esté
            configurado. Si el equipo aparece después, hay que cancelar ese cargo a mano.
          </p>
        )}

        <label className="block">
          <span className="text-xs font-medium text-marino-600">Nota</span>
          <input
            name="notas"
            placeholder={
              devuelto ? 'Vino golpeado, sin eliminador…' : 'Se cambió de casa y no avisó…'
            }
            className={CAMPO}
          />
        </label>

        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            {devuelto ? 'Recibir' : 'Marcar perdido y cobrar'}
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}
