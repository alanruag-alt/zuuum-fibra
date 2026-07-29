'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { asignarOrden, moverOrden } from '@/modulos/campo/acciones';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Persona } from '@/modulos/admin/tipos';
import type { Orden } from '@/modulos/campo/tipos';

const CAMPO =
  'rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

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

export function Asignar({ orden, tecnicos }: { orden: Orden; tecnicos: Persona[] }) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(asignarOrden, null);
  const [elegidos, setElegidos] = useState<string[]>([]);

  const cerrada = ['completed', 'cancelled'].includes(orden.status);
  if (cerrada) return null;

  function alternar(id: string) {
    setElegidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  }

  return (
    <div>
      <form action={accion} className="space-y-3">
        <input type="hidden" name="orden" value={orden.id} />

        <div className="flex flex-wrap gap-2">
          {tecnicos.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => alternar(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                elegidos.includes(t.id)
                  ? 'border-naranja-400 bg-naranja-50 font-medium text-naranja-700'
                  : 'border-marino-200 text-marino-600 hover:bg-marino-50'
              }`}
            >
              {t.full_name}
              {elegidos[0] === t.id && (
                <span className="ml-1.5 text-xs opacity-70">responsable</span>
              )}
            </button>
          ))}
        </div>
        {elegidos.map((id) => (
          <input key={id} type="hidden" name="tecnicos" value={id} />
        ))}

        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Fecha y hora</span>
            <input
              name="agendar"
              type="datetime-local"
              defaultValue={
                orden.scheduled_for ? new Date(orden.scheduled_for).toISOString().slice(0, 16) : ''
              }
              className={`${CAMPO} mt-1 block`}
            />
          </label>
          <Boton type="submit" cargando={enviando}>
            Asignar
          </Boton>
        </div>

        <p className="text-xs text-marino-400">
          El primero que marques queda como responsable. En cuanto se asigna, ese técnico puede ver
          a ese cliente desde su teléfono — y solo a ése, y solo mientras la orden esté abierta.
        </p>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

export function MoverOrden({ orden }: { orden: Orden }) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(moverOrden, null);
  const [cancelando, setCancelando] = useState(false);

  if (orden.status === 'completed' || orden.status === 'cancelled') {
    return <Aviso estado={estado} />;
  }

  const faltaEvidencia =
    orden.type === 'installation' &&
    (orden.fotos === 0 || orden.lecturas === 0 || orden.firmas === 0);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {orden.status === 'scheduled' && (
          <form action={accion}>
            <input type="hidden" name="orden" value={orden.id} />
            <input type="hidden" name="que" value="iniciar" />
            <Boton type="submit" cargando={enviando}>
              El técnico llegó
            </Boton>
          </form>
        )}

        {orden.status === 'in_progress' && (
          <form action={accion} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="orden" value={orden.id} />
            <input type="hidden" name="que" value="cerrar" />
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Cómo quedó</span>
              <input name="notas" className={`${CAMPO} mt-1 block w-64`} />
            </label>
            <Boton type="submit" cargando={enviando}>
              Cerrar la orden
            </Boton>
          </form>
        )}

        {!cancelando ? (
          <Boton variante="secundario" onClick={() => setCancelando(true)}>
            Cancelar la orden
          </Boton>
        ) : (
          <form action={accion} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="orden" value={orden.id} />
            <input type="hidden" name="que" value="cancelar" />
            <label className="block">
              <span className="text-sm font-medium text-marino-600">¿Por qué?</span>
              <input name="motivo" required className={`${CAMPO} mt-1 block w-64`} autoFocus />
            </label>
            <Boton type="submit" variante="oscuro" cargando={enviando}>
              Cancelar
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setCancelando(false)}>
              Mejor no
            </Boton>
          </form>
        )}
      </div>

      {faltaEvidencia && orden.status === 'in_progress' && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-aviso">
          Todavía falta evidencia: {orden.fotos === 0 && 'foto'}
          {orden.fotos === 0 && (orden.lecturas === 0 || orden.firmas === 0) ? ', ' : ''}
          {orden.lecturas === 0 && 'potencia medida'}
          {orden.lecturas === 0 && orden.firmas === 0 ? ', ' : ''}
          {orden.firmas === 0 && 'firma del cliente'}. La base no va a dejar cerrar sin eso.
        </p>
      )}

      <Aviso estado={estado} />
    </div>
  );
}
