type Tono = 'neutro' | 'marca' | 'ok' | 'aviso' | 'falla';

const TEXTO: Record<Tono, string> = {
  neutro: 'text-marino-800',
  marca: 'text-naranja-600',
  ok: 'text-exito',
  aviso: 'text-aviso',
  falla: 'text-falla',
};

const BORDE: Record<Tono, string> = {
  neutro: 'border-l-marino-300',
  marca: 'border-l-naranja-500',
  ok: 'border-l-exito',
  aviso: 'border-l-aviso',
  falla: 'border-l-falla',
};

interface Props {
  valor: string;
  etiqueta: string;
  detalle?: string;
  tono?: Tono;
}

export function Indicador({ valor, etiqueta, detalle, tono = 'neutro' }: Props) {
  return (
    <div
      className={`rounded-lg border border-l-4 border-marino-100 bg-white p-4 shadow-tarjeta ${BORDE[tono]}`}
    >
      <p className={`text-2xl font-bold leading-tight ${TEXTO[tono]}`}>{valor}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-marino-400">{etiqueta}</p>
      {detalle && <p className="mt-1 text-xs text-marino-300">{detalle}</p>}
    </div>
  );
}
