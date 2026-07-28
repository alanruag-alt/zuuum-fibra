'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import type { RespuestaCobro } from '@/modulos/cobranza/acciones';
import { abrirCaja, cerrarCaja, entregarCaja, verificarCaja } from '@/modulos/caja/acciones';
import type { Caja, Persona } from '@/modulos/caja/tipos';
import type { Zona } from '@/modulos/clientes/tipos';

const CAMPO =
  'rounded-lg border border-marino-200 bg-white px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

function Aviso({ estado }: { estado: RespuestaCobro | null }) {
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

export function AbrirCaja({ zonas }: { zonas: Zona[] }) {
  const [estado, accion, enviando] = useActionState<RespuestaCobro | null, FormData>(
    abrirCaja,
    null,
  );

  return (
    <div>
      <form action={accion} className="flex flex-wrap items-center gap-2">
        <select name="zona" className={CAMPO} aria-label="Zona donde vas a cobrar">
          <option value="">Sin zona fija</option>
          {zonas.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <Boton type="submit" cargando={enviando}>
          Abrir mi caja
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

/**
 * Cerrar pide el efectivo contado a mano, no lo rellena con lo esperado.
 *
 * Si el campo viniera con el número esperado, el cobrador aprieta "cerrar" sin
 * contar y el corte deja de servir para lo único que sirve: darse cuenta de que
 * falta dinero el día que falta.
 */
export function CerrarCaja({ caja }: { caja: Caja }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<RespuestaCobro | null, FormData>(
    cerrarCaja,
    null,
  );

  if (estado?.ok) return <Aviso estado={estado} />;

  if (!abierto) {
    return <Boton onClick={() => setAbierto(true)}>Cerrar mi caja</Boton>;
  }

  return (
    <div>
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="caja" value={caja.id} />
        <label className="block">
          <span className="text-sm font-medium text-marino-600">Efectivo que traes</span>
          <input
            name="declarado"
            type="number"
            step="0.01"
            min="0"
            required
            autoFocus
            placeholder="cuéntalo"
            className={`${CAMPO} mt-1 block w-40 text-lg font-semibold`}
          />
        </label>
        <label className="block flex-1">
          <span className="text-sm font-medium text-marino-600">Nota (opcional)</span>
          <input name="notas" className={`${CAMPO} mt-1 block w-full`} />
        </label>
        <Boton type="submit" cargando={enviando}>
          Cerrar
        </Boton>
        <Boton
          type="button"
          variante="secundario"
          onClick={() => setAbierto(false)}
          disabled={enviando}
        >
          Cancelar
        </Boton>
      </form>
      <p className="mt-2 text-xs text-marino-400">
        Cuenta el efectivo antes de escribir el número. Si no cuadra, se puede cerrar igual: la
        diferencia queda registrada, que es justo para lo que sirve el corte.
      </p>
      <Aviso estado={estado} />
    </div>
  );
}

export function EntregarCaja({ caja, personas }: { caja: Caja; personas: Persona[] }) {
  const [estado, accion, enviando] = useActionState<RespuestaCobro | null, FormData>(
    entregarCaja,
    null,
  );

  if (estado?.ok) return <Aviso estado={estado} />;

  return (
    <div>
      <form action={accion} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="caja" value={caja.id} />
        <select name="a" required className={CAMPO} aria-label="A quién le entregas">
          <option value="">¿A quién se la entregas?</option>
          {personas
            .filter((p) => p.id !== caja.collector_id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
        </select>
        <Boton type="submit" variante="oscuro" cargando={enviando}>
          Entregar
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

export function VerificarCaja({ caja }: { caja: Caja }) {
  const [estado, accion, enviando] = useActionState<RespuestaCobro | null, FormData>(
    verificarCaja,
    null,
  );

  if (estado?.ok) return <Aviso estado={estado} />;

  return (
    <div>
      <form action={accion} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="caja" value={caja.id} />
        <input
          name="notas"
          placeholder="Nota (opcional)"
          className={`${CAMPO} w-44`}
          aria-label="Nota de la verificación"
        />
        <Boton type="submit" variante="secundario" cargando={enviando}>
          Dar por buena
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}
