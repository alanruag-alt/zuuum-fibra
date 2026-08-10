/** Todo en español, en un solo lugar. */

type Tono = 'ok' | 'aviso' | 'falla' | 'neutro' | 'marca';

export const CATEGORIA: Record<string, string> = {
  ont: 'ONT / módem',
  router: 'Router',
  antenna: 'Antena',
  cable: 'Cable',
  connector: 'Conectores',
  splitter: 'Splitters',
  nap: 'NAP y cajas',
  tool: 'Herramienta',
  consumable: 'Consumible',
  other: 'Otro',
};

export const UNIDAD: Record<string, string> = {
  piece: 'pieza',
  meter: 'metro',
  roll: 'rollo',
  box: 'caja',
  kit: 'kit',
};

export const ESTADO_EQUIPO: Record<string, { texto: string; tono: Tono }> = {
  in_stock: { texto: 'En almacén', tono: 'ok' },
  assigned: { texto: 'Con el técnico', tono: 'aviso' },
  installed: { texto: 'Instalado', tono: 'marca' },
  faulty: { texto: 'Descompuesto', tono: 'falla' },
  lost: { texto: 'Perdido', tono: 'falla' },
  retired: { texto: 'Dado de baja', tono: 'neutro' },
};

export const MOVIMIENTO: Record<string, { texto: string; tono: Tono }> = {
  purchase: { texto: 'Entrada', tono: 'ok' },
  transfer: { texto: 'Traspaso', tono: 'neutro' },
  install: { texto: 'Instalación', tono: 'marca' },
  return: { texto: 'Devolución', tono: 'ok' },
  adjustment: { texto: 'Ajuste', tono: 'aviso' },
  loss: { texto: 'Pérdida', tono: 'falla' },
};

export const DONDE: Record<string, string> = {
  branch: 'Bodega',
  technician: 'Técnico',
  vehicle: 'Camioneta',
  customer: 'Domicilio del cliente',
  scrap: 'Baja',
  supplier: 'Proveedor',
};

export function etiqueta(
  mapa: Record<string, { texto: string; tono: Tono }>,
  clave: string | null,
): { texto: string; tono: Tono } {
  if (!clave) return { texto: '—', tono: 'neutro' };
  return mapa[clave] ?? { texto: clave, tono: 'neutro' };
}
