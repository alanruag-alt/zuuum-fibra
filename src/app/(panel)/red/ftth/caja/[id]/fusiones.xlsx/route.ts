import { NextResponse } from 'next/server';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import { construirXlsx, type Hoja } from '@/lib/xlsx';
import { TIPO_EMPALME } from '@/modulos/ftth/etiquetas';
import type { FusionDeCaja } from '@/modulos/ftth/caja_tipos';

export const dynamic = 'force-dynamic';

/**
 * La hoja de la caja.
 *
 * Se imprime, se mete adentro de la caja, y ahí se queda. El siguiente que la
 * abra —que puede ser otro, dentro de tres años— sabe qué hay adentro antes
 * de tocar nada. Por eso lleva el color y el tubo de cada hilo: es lo único
 * que se ve cuando ya está la caja abierta y no hay señal de teléfono.
 *
 * La segunda hoja es a quién le va a doler. Conviene saberlo antes de subir.
 */
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: elemento }, { data: fus, error }, { data: cli }] = await Promise.all([
    supabase.from('network_elements').select('code').eq('id', id).maybeSingle(),
    supabase.rpc('fusiones_de_caja', { p_caja: id }),
    supabase.rpc('clientes_de_caja', { p_caja: id }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const codigo = ((elemento as { code?: string } | null)?.code ?? 'caja').toString();
  const fusiones = (fus ?? []) as unknown as FusionDeCaja[];
  const clientes = (cli ?? []) as unknown as Record<string, unknown>[];

  const hojaFusiones: Hoja = {
    nombre: codigo,
    filas: [
      [
        'Caja',
        'Cable que entra',
        'Tubo',
        'Hilo',
        'Color',
        'Tipo de empalme',
        'Cable que sale',
        'Tubo',
        'Hilo',
        'Color',
        'Termina en',
        'Pérdida (dB)',
        'Estado',
        'Responsable',
        'Fecha',
        'Observaciones',
      ],
      ...fusiones.map((f) => [
        f.caja,
        f.cable_entra,
        f.tubo_entra,
        f.hilo_entra,
        f.color_entra,
        TIPO_EMPALME[f.tipo] ?? f.tipo,
        f.cable_sale,
        f.tubo_sale,
        f.hilo_sale,
        f.color_sale,
        f.termina_en,
        f.perdida_db === null ? null : Number(f.perdida_db),
        f.estado,
        f.responsable,
        f.fecha,
        f.observaciones,
      ]),
    ],
  };

  const hojas: Hoja[] = [hojaFusiones];

  if (clientes.length > 0) {
    hojas.push({
      nombre: 'Clientes afectados',
      filas: [
        ['Contrato', 'Cliente', 'Teléfono', 'Dirección', 'NAP', 'Puerto', 'Rx (dBm)', 'Estado'],
        ...clientes.map((c) => [
          c.contrato as string,
          c.cliente as string,
          c.telefono as string,
          c.direccion as string,
          c.nap as string,
          c.puerto as number,
          c.rx_dbm === null || c.rx_dbm === undefined ? null : Number(c.rx_dbm),
          c.estado as string,
        ]),
      ],
    });
  }

  const libro = construirXlsx(hojas);
  const nombre = `fusiones_${codigo.replace(/[^A-Za-z0-9_-]+/g, '_')}.xlsx`;

  return new NextResponse(new Uint8Array(libro), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  });
}
