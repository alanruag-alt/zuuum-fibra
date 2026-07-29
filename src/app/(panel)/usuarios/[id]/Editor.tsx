'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Insignia } from '@/componentes/ui/Insignia';
import {
  ajustarPermiso,
  editarPersona,
  guardarZonasDePersona,
  type Respuesta,
} from '@/modulos/admin/acciones';
import type { PermisoDePersona, Persona, Rol, ZonaDeUsuario } from '@/modulos/admin/tipos';
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

export function DatosPersona({ persona, roles }: { persona: Persona; roles: Rol[] }) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    editarPersona,
    null,
  );

  return (
    <div>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="id" value={persona.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Nombre</span>
            <input name="nombre" defaultValue={persona.full_name} className={CAMPO} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Teléfono</span>
            <input name="telefono" defaultValue={persona.phone ?? ''} className={CAMPO} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Rol</span>
            <select name="rol" defaultValue={persona.rol_codigo ?? ''} className={CAMPO}>
              <option value="">— sin cambiar —</option>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-marino-400">
              Cambiar de rol borra los permisos sueltos: se van con el cargo.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Acceso</span>
            <select name="activo" defaultValue={persona.is_active ? 'si' : 'no'} className={CAMPO}>
              <option value="si">Puede entrar</option>
              <option value="no">Desactivado</option>
            </select>
            <span className="mt-1 block text-xs text-marino-400">
              Desactivar no borra nada: su historial se conserva completo.
            </span>
          </label>
        </div>
        <Boton type="submit" cargando={enviando}>
          Guardar
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

export function ZonasPersona({
  persona,
  zonas,
  asignadas,
  alcanceTotal,
}: {
  persona: Persona;
  zonas: Zona[];
  asignadas: ZonaDeUsuario[];
  alcanceTotal: boolean;
}) {
  const inicial: Record<string, 've' | 'cobra' | null> = {};
  for (const a of asignadas) inicial[a.zone_id] = a.can_collect ? 'cobra' : 've';

  const [marcadas, setMarcadas] = useState(inicial);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarZonasDePersona,
    null,
  );

  if (alcanceTotal) {
    return (
      <p className="text-sm text-marino-500">
        Con este rol ve <strong>toda la empresa</strong>. Las zonas no aplican.
      </p>
    );
  }

  const cuantas = Object.values(marcadas).filter(Boolean).length;

  return (
    <div>
      <form action={accion}>
        <input type="hidden" name="id" value={persona.id} />
        <div className="mb-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {zonas.map((z) => {
            const m = marcadas[z.id] ?? null;
            return (
              <div
                key={z.id}
                className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-sm ${
                  m ? 'border-naranja-300 bg-naranja-50' : 'border-marino-200'
                }`}
              >
                <span className={m ? 'font-medium text-marino-800' : 'text-marino-600'}>
                  {z.name}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setMarcadas({ ...marcadas, [z.id]: m === 've' ? null : 've' })}
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      m === 've' ? 'bg-marino-500 text-white' : 'bg-marino-100 text-marino-500'
                    }`}
                  >
                    ve
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMarcadas({ ...marcadas, [z.id]: m === 'cobra' ? null : 'cobra' })
                    }
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      m === 'cobra' ? 'bg-naranja-500 text-white' : 'bg-marino-100 text-marino-500'
                    }`}
                  >
                    cobra
                  </button>
                </div>
                {m && <input type="hidden" name="zonas" value={z.id} />}
                {m === 'cobra' && <input type="hidden" name="cobra" value={z.id} />}
              </div>
            );
          })}
        </div>

        {cuantas === 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-aviso">
            Sin ninguna zona, esta persona no va a ver un solo cliente.
          </p>
        )}

        <Boton type="submit" cargando={enviando}>
          Guardar zonas
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

/**
 * Los permisos, agrupados por módulo, diciendo de dónde le viene cada uno.
 *
 * La columna que importa es "de dónde": es lo que contesta "¿por qué este
 * señor puede ver los pagos?" sin que nadie tenga que abrir la base.
 */
export function PermisosPersona({
  persona,
  permisos,
}: {
  persona: Persona;
  permisos: PermisoDePersona[];
}) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    ajustarPermiso,
    null,
  );

  const porModulo = permisos.reduce<Record<string, PermisoDePersona[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <Aviso estado={estado} />
      <div className="mt-2 space-y-5">
        {Object.entries(porModulo).map(([modulo, lista]) => (
          <div key={modulo}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-marino-400">
              {modulo}
            </p>
            <ul className="space-y-1">
              {lista.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-marino-50"
                >
                  <div className="min-w-0">
                    <span
                      className={`text-sm ${p.efectivo ? 'font-medium text-marino-800' : 'text-marino-400'}`}
                    >
                      {p.name}
                    </span>
                    {p.is_sensitive && (
                      <span className="ml-2">
                        <Insignia tono="marca">dinero</Insignia>
                      </span>
                    )}
                    <span className="ml-2 text-xs text-marino-300">
                      {p.excepcion === null
                        ? p.porRol
                          ? 'del rol'
                          : 'el rol no lo trae'
                        : p.excepcion
                          ? 'dado a mano'
                          : 'quitado a mano'}
                    </span>
                  </div>
                  <form action={accion} className="flex shrink-0 gap-1">
                    <input type="hidden" name="id" value={persona.id} />
                    <input type="hidden" name="permiso" value={p.code} />
                    {(
                      [
                        ['si', 'Sí'],
                        ['rol', 'Como el rol'],
                        ['no', 'No'],
                      ] as const
                    ).map(([v, t]) => {
                      const activo =
                        (v === 'rol' && p.excepcion === null) ||
                        (v === 'si' && p.excepcion === true) ||
                        (v === 'no' && p.excepcion === false);
                      return (
                        <button
                          key={v}
                          type="submit"
                          name="estado"
                          value={v}
                          disabled={enviando}
                          className={`rounded px-2 py-0.5 text-xs ${
                            activo
                              ? 'bg-marino-600 text-white'
                              : 'bg-marino-100 text-marino-500 hover:bg-marino-200'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
