import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Mapa } from '@/app/(panel)/red/ftth/mapa/Mapa';
import { puedeEditarRed, puntosDeZona, trazosDeZona, vistaDeZona } from '@/modulos/mapa/consultas';
import { listarCables } from '@/modulos/ftth/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ zona?: string }>;
}

export default async function PaginaMapaFTTH({ searchParams }: Props) {
  const { zona } = await searchParams;
  const zonas = await listarZonas();

  if (zonas.length === 0) {
    return (
      <Tarjeta>
        <div className="py-12 text-center">
          <p className="text-3xl">🗺️</p>
          <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay zonas</p>
          <p className="mt-1 text-sm text-marino-400">
            El mapa se organiza por localidad. Da de alta las zonas primero.
          </p>
        </div>
      </Tarjeta>
    );
  }

  const zonaActual = zonas.find((z) => z.id === zona)?.id ?? zonas[0].id;

  const [vista, puntos, trazos, cables, puedeEditar] = await Promise.all([
    vistaDeZona(zonaActual),
    puntosDeZona(zonaActual),
    trazosDeZona(zonaActual),
    listarCables(),
    puedeEditarRed(),
  ]);

  const deLaZona = cables.filter((c) => c.zone_id === zonaActual || !c.zone_id);
  const sinTrazo = deLaZona.filter((c) => !trazos.some((t) => t.id === c.id));

  return (
    <div>
      <p className="mb-4 text-sm text-marino-500">
        Cada localidad tiene su propio mapa. Se abre donde lo dejaste la última vez.
      </p>

      <Mapa
        zonas={zonas}
        zonaActual={zonaActual}
        vista={vista}
        puntos={puntos}
        trazos={trazos}
        cables={deLaZona}
        puedeEditar={puedeEditar}
      />

      {puedeEditar && sinTrazo.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          <strong>{sinTrazo.length}</strong>{' '}
          {sinTrazo.length === 1 ? 'cable de esta zona no tiene' : 'cables de esta zona no tienen'}{' '}
          su recorrido dibujado: {sinTrazo.map((c) => c.code).join(', ')}. Sin trazo, la postería no
          se puede acomodar sola y el cable no aparece en el mapa. Dale a{' '}
          <strong>Dibujar ruta</strong>, elige el cable y ve marcando poste por poste.
        </div>
      )}

      {puntos.length === 0 && trazos.length === 0 && (
        <div className="mt-4 rounded-lg bg-marino-50 px-4 py-3 text-sm text-marino-500">
          Esta zona todavía no tiene nada capturado con coordenadas. Puedes empezar aquí mismo:
          elige <strong>Poner NAP</strong> o <strong>Poner caja</strong> y dale clic al lugar. Lo
          que pongas aquí es lo mismo que aparece en las otras pestañas.
        </div>
      )}
    </div>
  );
}
