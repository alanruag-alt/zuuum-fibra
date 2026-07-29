'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { convertirProspecto, guardarProspecto } from '@/modulos/campo/acciones';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Prospecto } from '@/modulos/campo/tipos';
import type { Plan } from '@/modulos/admin/tipos';
import type { Zona } from '@/modulos/clientes/tipos';

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

export function NuevoProspecto({ zonas, planes }: { zonas: Zona[]; planes: Plan[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarProspecto,
    null,
  );

  if (!abierto) return <Boton onClick={() => setAbierto(true)}>Anotar un interesado</Boton>;

  return (
    <Tarjeta titulo="Nuevo interesado" className="w-full">
      {estado && <Aviso estado={estado} />}
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Nombre</span>
              <input name="nombre" required className={CAMPO} autoFocus />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Teléfono</span>
              <input name="telefono" required className={CAMPO} />
              <span className="mt-1 block text-xs text-marino-400">
                Sin teléfono un prospecto no sirve de nada.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Zona</span>
              <select name="zona" required className={CAMPO}>
                <option value="">Elige</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Dónde vive</span>
              <input
                name="domicilio"
                placeholder="Casa azul, frente a la tienda"
                className={CAMPO}
              />
              <span className="mt-1 block text-xs text-marino-400">
                En el campo esto vale más que la calle y el número.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Plan que le interesa</span>
              <select name="plan" className={CAMPO}>
                <option value="">Todavía no sabe</option>
                {planes
                  .filter((p) => p.visible_for_sale && p.is_active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · ${p.price}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Cobertura</span>
              <select name="cobertura" className={CAMPO}>
                <option value="unknown">Por revisar</option>
                <option value="covered">Hay cobertura</option>
                <option value="needs_build">Hay que tender</option>
                <option value="no_coverage">Sin cobertura</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Notas</span>
              <input name="notas" className={CAMPO} />
            </label>
          </div>
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

export function SeguirProspecto({ prospecto }: { prospecto: Prospecto }) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarProspecto,
    null,
  );
  const [perdido, setPerdido] = useState(prospecto.status === 'lost');

  if (prospecto.status === 'converted') return null;

  return (
    <div>
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={prospecto.id} />
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Cómo va</span>
          <select
            name="estado"
            defaultValue={prospecto.status}
            onChange={(e) => setPerdido(e.target.value === 'lost')}
            className={`${CAMPO} w-40`}
          >
            <option value="new">Nuevo</option>
            <option value="contacted">Ya lo contacté</option>
            <option value="quoted">Le cotizé</option>
            <option value="scheduled">Quedamos de vernos</option>
            <option value="lost">Se perdió</option>
          </select>
        </label>
        {perdido && (
          <label className="block">
            <span className="text-xs font-medium text-marino-600">¿Por qué?</span>
            <select name="motivo" className={`${CAMPO} w-40`}>
              <option value="no_coverage">No hay cobertura</option>
              <option value="price">Por el precio</option>
              <option value="competitor">Se fue con otro</option>
              <option value="no_answer">Nunca contestó</option>
              <option value="other">Otro</option>
            </select>
          </label>
        )}
        <label className="block flex-1">
          <span className="text-xs font-medium text-marino-600">Nota</span>
          <input name="notas" defaultValue={prospecto.notes ?? ''} className={CAMPO} />
        </label>
        <Boton type="submit" variante="secundario" cargando={enviando}>
          Guardar
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

export function Convertir({ prospecto, planes }: { prospecto: Prospecto; planes: Plan[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    convertirProspecto,
    null,
  );

  if (prospecto.status === 'converted') {
    return <span className="text-xs text-exito">ya es cliente</span>;
  }

  if (estado?.ok) return <Aviso estado={estado} />;

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} variante="principal">
        Convertir en cliente
      </Boton>
    );
  }

  return (
    <div className="w-full rounded-lg border border-naranja-200 bg-naranja-50/50 p-3">
      <form action={accion} className="space-y-3">
        <input type="hidden" name="id" value={prospecto.id} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Plan</span>
            <select name="plan" required className={CAMPO}>
              <option value="">Elige</option>
              {planes
                .filter((p) => p.is_active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · ${p.price}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Precio acordado</span>
            <input name="precio" type="number" step="0.01" min="0" className={CAMPO} />
            <span className="mt-1 block text-[11px] text-marino-400">Vacío = el del plan.</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Red</span>
            <select name="red" className={CAMPO}>
              <option value="ftth">Fibra</option>
              <option value="wisp">Inalámbrico</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-marino-600">Instalar el</span>
            <input name="agendar" type="datetime-local" className={CAMPO} />
          </label>
        </div>
        <p className="text-xs text-marino-500">
          Se crea el cliente, su servicio y la orden de instalación de un solo movimiento. El
          servicio queda <strong>pendiente</strong> hasta que el técnico cierre la orden: nadie le
          cobra a quien todavía no tiene internet.
        </p>
        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Convertir
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
