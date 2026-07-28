'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { abrirPeriodoYGenerar, type RespuestaCobro } from '@/modulos/cobranza/acciones';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

interface Props {
  anio: number;
  mes: number;
  /** Cuántos servicios activos hay hoy. Es lo que se va a cobrar. */
  serviciosActivos: number;
  yaGenerado: boolean;
}

/**
 * Generar el mes crea deuda real a nombre de gente real. Por eso pide
 * confirmación y dice de antemano a cuántos les va a llegar, en vez de ser
 * un botón que se aprieta sin querer.
 */
export function GenerarMes({ anio, mes, serviciosActivos, yaGenerado }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, accion, enviando] = useActionState<RespuestaCobro | null, FormData>(
    abrirPeriodoYGenerar,
    null,
  );

  const nombre = `${MESES[mes - 1]} de ${anio}`;

  if (estado) {
    return (
      <p
        className={`rounded-lg px-3 py-2 text-sm ${
          estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
        }`}
      >
        {estado.mensaje}
      </p>
    );
  }

  if (!confirmando) {
    return (
      <Boton
        variante={yaGenerado ? 'secundario' : 'principal'}
        onClick={() => setConfirmando(true)}
      >
        {yaGenerado ? `Revisar ${nombre}` : `Generar ${nombre}`}
      </Boton>
    );
  }

  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="anio" value={anio} />
      <input type="hidden" name="mes" value={mes} />
      <span className="text-sm text-marino-600">
        Se le va a cobrar {nombre} a <strong>{serviciosActivos.toLocaleString('es-MX')}</strong>{' '}
        servicios activos. A quien ya tenga su cargo no se le duplica.
      </span>
      <Boton type="submit" cargando={enviando}>
        {enviando ? 'Generando…' : 'Sí, generar'}
      </Boton>
      <Boton
        type="button"
        variante="secundario"
        onClick={() => setConfirmando(false)}
        disabled={enviando}
      >
        Mejor no
      </Boton>
    </form>
  );
}
