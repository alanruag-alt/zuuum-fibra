'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { guardarPlan, type Respuesta } from '@/modulos/admin/acciones';
import type { Plan } from '@/modulos/admin/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

export function EditorPlanes({ planes }: { planes: Plan[] }) {
  const [editando, setEditando] = useState<Plan | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(guardarPlan, null);

  const p = editando;

  if (!nuevo && !p) {
    return (
      <Tarjeta titulo="Editar planes">
        {estado && (
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
            }`}
          >
            {estado.mensaje}
          </p>
        )}
        <div className="mb-4 flex flex-wrap gap-2">
          {planes.map((pp) => (
            <button
              key={pp.id}
              onClick={() => setEditando(pp)}
              className="rounded-lg border border-marino-200 px-3 py-1.5 text-sm text-marino-600 hover:bg-marino-50"
            >
              {pp.name}
            </button>
          ))}
        </div>
        <Boton onClick={() => setNuevo(true)}>Agregar un plan</Boton>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo={p ? `Editar ${p.name}` : 'Nuevo plan'}>
      <form action={accion} className="space-y-4">
        {p && <input type="hidden" name="id" value={p.id} />}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Nombre</span>
            <input
              name="nombre"
              required
              defaultValue={p?.name ?? ''}
              className={CAMPO}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Código</span>
            <input
              name="codigo"
              required={!p}
              disabled={Boolean(p)}
              defaultValue={p?.code ?? ''}
              className={`${CAMPO} font-mono uppercase disabled:bg-marino-50 disabled:text-marino-400`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Precio mensual</span>
            <input
              name="precio"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={p?.price ?? ''}
              className={`${CAMPO} font-semibold`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Bajada (Mbps)</span>
            <input
              name="bajada"
              type="number"
              min="0"
              defaultValue={p?.download_mbps ?? ''}
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Subida (Mbps)</span>
            <input
              name="subida"
              type="number"
              min="0"
              defaultValue={p?.upload_mbps ?? ''}
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Red</span>
            <select name="red" defaultValue={p?.network_type ?? 'both'} className={CAMPO}>
              <option value="both">Fibra e inalámbrico</option>
              <option value="ftth">Solo fibra</option>
              <option value="wisp">Solo inalámbrico</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Se ofrece a clientes nuevos</span>
            <select
              name="visible"
              defaultValue={p ? (p.visible_for_sale ? 'si' : 'no') : 'si'}
              className={CAMPO}
            >
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Estado</span>
            <select
              name="activo"
              defaultValue={p ? (p.is_active ? 'si' : 'no') : 'si'}
              className={CAMPO}
            >
              <option value="si">Activo</option>
              <option value="no">Inactivo</option>
            </select>
          </label>
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="text-sm font-medium text-marino-600">Notas</span>
            <input name="notas" defaultValue={p?.notes ?? ''} className={CAMPO} />
          </label>
        </div>

        {p && p.contratados > 0 && (
          <p className="rounded-lg bg-marino-50 px-3 py-2 text-sm text-marino-600">
            {p.contratados} clientes tienen este plan. Cambiarle el precio aquí{' '}
            <strong>no se los sube a ellos</strong>: cada uno trae su propio precio desde que se
            cargó el padrón. Subirle a un cliente es una decisión aparte, cliente por cliente.
          </p>
        )}

        <div className="flex gap-2">
          <Boton type="submit" cargando={enviando}>
            Guardar
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            onClick={() => {
              setEditando(null);
              setNuevo(false);
            }}
            disabled={enviando}
          >
            Cancelar
          </Boton>
        </div>
      </form>

      {estado && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </Tarjeta>
  );
}
