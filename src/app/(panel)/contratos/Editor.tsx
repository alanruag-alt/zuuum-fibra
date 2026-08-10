'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { cancelarContrato, firmarContrato, generarContrato } from '@/modulos/contratos/acciones';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Contrato, SinContrato } from '@/modulos/contratos/tipos';

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

export function Generar({ servicio }: { servicio: SinContrato }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    generarContrato,
    null,
  );

  if (estado?.ok) return <Aviso estado={estado} />;

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={() => setAbierto(true)} className="px-3 py-1.5 text-xs">
        generar contrato
      </Boton>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-naranja-200 bg-naranja-50/50 p-3">
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="servicio" value={servicio.id} />
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Empieza el</span>
          <input name="inicio" type="date" className={`${CAMPO} w-40`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-marino-600">Meses</span>
          <input
            name="meses"
            type="number"
            min="1"
            placeholder="sin plazo"
            className={`${CAMPO} w-28`}
          />
        </label>
        <Boton type="submit" cargando={enviando}>
          Generar
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

export function Firmar({ contrato }: { contrato: Contrato }) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    firmarContrato,
    null,
  );

  if (estado?.ok) return <span className="text-xs text-exito">firmado</span>;

  return (
    <div>
      <form action={accion}>
        <input type="hidden" name="contrato" value={contrato.id} />
        <Boton
          type="submit"
          variante="secundario"
          cargando={enviando}
          className="px-3 py-1.5 text-xs"
        >
          marcar firmado
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

export function Cancelar({ contrato }: { contrato: Contrato }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    cancelarContrato,
    null,
  );

  if (estado?.ok) return <Aviso estado={estado} />;

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        cancelar
      </Boton>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-marino-200 bg-marino-50/50 p-3">
      <p className="mb-2 text-xs text-marino-500">
        Cancelar el contrato <strong>no</strong> corta el servicio. Si además hay que darlo de baja,
        eso se hace desde el expediente del cliente.
      </p>
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="contrato" value={contrato.id} />
        <label className="block flex-1 min-w-[220px]">
          <span className="text-xs font-medium text-marino-600">¿Por qué?</span>
          <input name="motivo" required className={CAMPO} autoFocus />
        </label>
        <Boton type="submit" variante="oscuro" cargando={enviando}>
          Cancelar contrato
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Dejarlo así
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}
