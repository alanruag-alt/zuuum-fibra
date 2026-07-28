'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { registrarPago, type RespuestaCobro } from '@/modulos/cobranza/acciones';

interface Props {
  clienteId: string;
  clienteNombre: string;
  adeudo: number;
}

/**
 * El botón de cobrar.
 *
 * Se abre con el adeudo ya escrito, porque el 90% de las veces el cliente paga
 * exactamente lo que debe y así el cobrador no teclea nada. Pero el campo se
 * puede cambiar: hay quien paga a medias y hay quien paga dos meses.
 */
export function FormaCobro({ clienteId, clienteNombre, adeudo }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [metodo, setMetodo] = useState('cash');
  const [estado, accion, enviando] = useActionState<RespuestaCobro | null, FormData>(
    registrarPago,
    null,
  );
  const dialogo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (estado?.ok) {
      const t = setTimeout(() => setAbierto(false), 2500);
      return () => clearTimeout(t);
    }
  }, [estado]);

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)}>
        Cobrar {adeudo > 0 ? `$${adeudo.toLocaleString('es-MX')}` : ''}
      </Boton>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-marino-800/40 p-4 sm:items-center">
      <div
        ref={dialogo}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-label="Registrar pago"
      >
        <header className="mb-4">
          <h2 className="text-base font-semibold text-marino-800">Registrar pago</h2>
          <p className="mt-1 text-sm text-marino-400">{clienteNombre}</p>
        </header>

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
            <input type="hidden" name="cliente_id" value={clienteId} />

            <label className="block">
              <span className="text-sm font-medium text-marino-600">Importe</span>
              <input
                name="importe"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={adeudo > 0 ? adeudo : ''}
                required
                autoFocus
                className="mt-1 w-full rounded-lg border border-marino-200 px-3 py-2.5 text-lg font-semibold text-marino-800 focus:border-naranja-400 focus:outline-none"
              />
            </label>

            <fieldset>
              <legend className="text-sm font-medium text-marino-600">Forma de pago</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {[
                  { v: 'cash', t: 'Efectivo' },
                  { v: 'transfer', t: 'Transferencia' },
                ].map((o) => (
                  <label
                    key={o.v}
                    className={`cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm ${
                      metodo === o.v
                        ? 'border-naranja-400 bg-naranja-50 font-medium text-naranja-700'
                        : 'border-marino-200 text-marino-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="metodo"
                      value={o.v}
                      checked={metodo === o.v}
                      onChange={() => setMetodo(o.v)}
                      className="sr-only"
                    />
                    {o.t}
                  </label>
                ))}
              </div>
            </fieldset>

            {metodo === 'transfer' && (
              <label className="block">
                <span className="text-sm font-medium text-marino-600">Referencia</span>
                <input
                  name="referencia"
                  required
                  placeholder="Últimos dígitos o folio del banco"
                  className="mt-1 w-full rounded-lg border border-marino-200 px-3 py-2.5 text-sm focus:border-naranja-400 focus:outline-none"
                />
              </label>
            )}

            <label className="block">
              <span className="text-sm font-medium text-marino-600">Nota (opcional)</span>
              <input
                name="notas"
                className="mt-1 w-full rounded-lg border border-marino-200 px-3 py-2.5 text-sm focus:border-naranja-400 focus:outline-none"
              />
            </label>

            <div className="flex gap-2 pt-1">
              <Boton type="submit" cargando={enviando} className="flex-1">
                {enviando ? 'Registrando…' : 'Registrar pago'}
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
          <Boton variante="secundario" onClick={() => setAbierto(false)} className="w-full">
            Cerrar
          </Boton>
        )}
      </div>
    </div>
  );
}
