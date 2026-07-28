import Image from 'next/image';

interface Props {
  /** 'color' para fondos claros, 'blanco' para fondos oscuros. */
  variante?: 'color' | 'blanco';
  /** Alto en píxeles. El ancho se calcula solo para no deformarlo. */
  alto?: number;
  className?: string;
  prioridad?: boolean;
}

/** Proporción original del logo: 720 × 125 */
const PROPORCION = 720 / 125;

export function Logo({ variante = 'color', alto = 28, className = '', prioridad = false }: Props) {
  const archivo = variante === 'blanco' ? '/logo-zuuum-blanco.png' : '/logo-zuuum-color.png';

  return (
    <Image
      src={archivo}
      alt="ZUUUM FIBRA"
      width={Math.round(alto * PROPORCION)}
      height={alto}
      priority={prioridad}
      className={className}
      style={{ height: alto, width: 'auto' }}
    />
  );
}

/** Solo el rayo, para espacios cuadrados. */
export function Isotipo({ tam = 32, className = '' }: { tam?: number; className?: string }) {
  return (
    <Image
      src="/icono-zuuum.png"
      alt=""
      width={tam}
      height={tam}
      className={`rounded-lg ${className}`}
    />
  );
}
