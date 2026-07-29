'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { invitarPersona, type Respuesta } from '@/modulos/admin/acciones';
import type { Rol } from '@/modulos/admin/tipos';
import type { Zona } from '@/modulos/clientes/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

export function Invitar({
  roles,
  zonas,
  hayLlave,
}: {
  roles: Rol[];
  zonas: Zona[];
  hayLlave: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [rol, setRol] = useState('office');
  const [marcadas, setMarcadas] = useState<Record<string, 've' | 'cobra' | null>>({});
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    invitarPersona,
    null,
  );

  const rolElegido = roles.find((r) => r.code === rol);
  const necesitaZonas = rolElegido?.scope_type === 'zones';

  if (!abierto) {
    return (
      <div>
        <Boton onClick={() => setAbierto(true)}>Invitar a alguien</Boton>
        {!hayLlave && (
          <p className="mt-2 max-w-md text-xs text-aviso">
            Para invitar hace falta poner <code>SUPABASE_SERVICE_ROLE_KEY</code> en{' '}
            <code>.env.local</code>. Es lo único que falta y se hace una sola vez.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-marino-100 bg-white p-5 shadow-tarjeta">
      <h2 className="mb-1 text-base font-semibold text-marino-800">Invitar a alguien</h2>
      <p className="mb-4 text-sm text-marino-400">
        Le llega un correo con una liga. Ahí escribe su propia contraseña — nadie más la ve, ni
        siquiera tú.
      </p>

      {estado && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
          }`}
        >
          {estado.mensaje}
        </p>
      )}

      {!estado?.ok && (
        <form action={accion} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Nombre completo</span>
              <input name="nombre" required className={CAMPO} autoFocus />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Correo</span>
              <input name="email" type="email" required className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Teléfono (opcional)</span>
              <input name="telefono" className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Rol</span>
              <select
                name="rol"
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                className={CAMPO}
              >
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
              {rolElegido && (
                <span className="mt-1 block text-xs text-marino-400">
                  {rolElegido.scope_type === 'all'
                    ? 'Ve toda la empresa.'
                    : rolElegido.scope_type === 'zones'
                      ? 'Solo ve las zonas que le marques abajo.'
                      : 'Solo ve lo que se le asigne a él.'}
                </span>
              )}
            </label>
          </div>

          {necesitaZonas && (
            <fieldset>
              <legend className="text-sm font-medium text-marino-600">Zonas</legend>
              <p className="mb-2 text-xs text-marino-400">
                Sin ninguna marcada, esta persona no va a ver un solo cliente. Es a propósito: más
                vale que no vea nada a que vea de más.
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
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
                          onClick={() =>
                            setMarcadas({ ...marcadas, [z.id]: m === 've' ? null : 've' })
                          }
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            m === 've'
                              ? 'bg-marino-500 text-white'
                              : 'bg-marino-100 text-marino-500'
                          }`}
                          title="Ve los clientes de esta zona"
                        >
                          ve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMarcadas({ ...marcadas, [z.id]: m === 'cobra' ? null : 'cobra' })
                          }
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            m === 'cobra'
                              ? 'bg-naranja-500 text-white'
                              : 'bg-marino-100 text-marino-500'
                          }`}
                          title="Además puede cobrar aquí"
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
            </fieldset>
          )}

          <div className="flex gap-2 pt-1">
            <Boton type="submit" cargando={enviando} disabled={!hayLlave}>
              {enviando ? 'Enviando…' : 'Enviar invitación'}
            </Boton>
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setAbierto(false)}
              disabled={enviando}
            >
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {estado?.ok && (
        <Boton
          variante="secundario"
          onClick={() => {
            setAbierto(false);
            setMarcadas({});
          }}
        >
          Cerrar
        </Boton>
      )}
    </div>
  );
}
