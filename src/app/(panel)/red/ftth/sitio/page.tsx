import { Indicador } from '@/componentes/ui/Indicador';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Elegir } from '@/app/(panel)/red/ftth/sitio/Elegir';
import { Montado } from '@/app/(panel)/red/ftth/sitio/Montado';
import { Sueltos } from '@/app/(panel)/red/ftth/sitio/Sueltos';
import Rack from '@/app/(panel)/red/ftth/sitio/Rack';
import Patcheo from '@/app/(panel)/red/ftth/sitio/Patcheo';
import {
  listarEquiposRack,
  listarRacks,
  listarSitiosConRack,
  sueltosDelSitio,
} from '@/modulos/red/racks';
import {
  hilosSinOrigen,
  listarPuertosOdf,
  listarPuertosPon,
  listarTarjetas,
} from '@/modulos/red/olt';
import { listarZonas } from '@/modulos/clientes/consultas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

/**
 * La caseta, de arriba a abajo.
 *
 * Antes esto vivía en dos pestañas: una para la OLT y el ODF, otra para el
 * gabinete. Se separaron por cómo está guardado, no por cómo se trabaja, y en
 * campo es un solo momento: se llega a la comunidad, se abre el gabinete, y de
 * ahí se ve todo. Ahora se captura en el orden en que se instala —comunidad,
 * rack, ODF y OLT, tarjetas— sin cambiar de pantalla.
 */
export default async function PaginaSitio({
  searchParams,
}: {
  searchParams: Promise<{ sitio?: string }>;
}) {
  const { sitio: pedido } = await searchParams;

  const [sitios, racks, equipos, tarjetas, pones, puertosOdf, hilos, zonas] = await Promise.all([
    listarSitiosConRack(),
    listarRacks(),
    listarEquiposRack(),
    listarTarjetas(),
    listarPuertosPon(),
    listarPuertosOdf(),
    hilosSinOrigen(),
    listarZonas(),
  ]);

  // Si no se pide ninguna, se abre la que ya tiene gabinete: es la que se está
  // trabajando. Una lista de doce comunidades vacías no le sirve a nadie.
  const elegido =
    (pedido && sitios.some((s) => s.id === pedido) ? pedido : null) ??
    sitios.find((s) => s.racks > 0)?.id ??
    sitios[0]?.id ??
    null;

  const sitio = sitios.find((s) => s.id === elegido) ?? null;
  const susRacks = racks.filter((r) => r.site_id === elegido);
  const idsRack = new Set(susRacks.map((r) => r.id));
  const susEquipos = equipos.filter((e) => idsRack.has(e.rack_id));
  const susOdf = new Set(susEquipos.filter((e) => e.element_id).map((e) => e.element_id));
  const susOlt = new Set(susEquipos.filter((e) => e.device_id).map((e) => e.device_id));

  const susTarjetas = tarjetas.filter((t) => susOlt.has(t.device_id));
  const idsTarjeta = new Set(susTarjetas.map((t) => t.id));
  const susPon = pones.filter((p) => idsTarjeta.has(p.card_id));
  const susPuertos = puertosOdf.filter((p) => susOdf.has(p.odf_id));

  // Lo que pertenece a la caseta pero no está montado en ningún gabinete. Se
  // consulta aparte porque hasta ahora era justo lo que quedaba invisible.
  const sueltos = elegido ? await sueltosDelSitio(elegido) : [];

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm text-marino-500">
        La caseta de cada comunidad, de arriba a abajo: el gabinete, y adentro el ODF y la OLT con
        sus tarjetas. Se captura en el orden en que se instala.
      </p>

      <Elegir
        sitios={sitios.map((s) => ({
          id: s.id,
          name: s.name,
          zona: s.zona,
          racks: Number(s.racks),
          olts: Number(s.olts),
          odfs: Number(s.odfs),
        }))}
        elegido={elegido}
        zonas={zonas.map((z) => ({ id: z.id, name: z.name }))}
      />

      {!sitio ? (
        <Tarjeta>
          <div className="py-12 text-center">
            <p className="text-3xl">🏘️</p>
            <p className="mt-3 text-sm font-medium text-marino-800">
              Todavía no hay ninguna caseta
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-marino-400">
              Empieza por la comunidad: es donde va el gabinete. Adentro del gabinete se cuelga el
              ODF y la OLT, y de la OLT sus tarjetas.
            </p>
          </div>
        </Tarjeta>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              valor={numero(Number(sitio.racks))}
              etiqueta="Gabinetes"
              detalle={sitio.zona ?? 'sin zona'}
            />
            <Indicador
              valor={`${numero(Number(sitio.ocupadas))} / ${numero(Number(sitio.unidades))}`}
              etiqueta="Unidades ocupadas"
              tono="marca"
            />
            <Indicador
              valor={`${numero(Number(sitio.pon_patcheados))} / ${numero(Number(sitio.puertos_pon))}`}
              etiqueta="PON con latiguillo"
              detalle={`${sitio.tarjetas} tarjetas en ${sitio.olts} OLT`}
              tono="ok"
            />
            <Indicador
              valor={numero(Number(sitio.odf_libres))}
              etiqueta="Puertos del ODF libres"
              detalle={`de ${sitio.puertos_odf}`}
              tono={
                Number(sitio.puertos_odf) > 0 && Number(sitio.odf_libres) === 0 ? 'aviso' : 'neutro'
              }
            />
          </div>

          <Rack racks={susRacks} equipos={susEquipos} sitio={{ id: sitio.id, name: sitio.name }} />

          <Sueltos sueltos={sueltos} racks={susRacks} sitio={sitio.name} />

          <Montado
            equipos={susEquipos}
            tarjetas={susTarjetas}
            pones={susPon}
            puertosOdf={susPuertos}
            hilos={hilos}
          />

          <Patcheo pones={susPon} puertos={susPuertos} />
        </>
      )}
    </div>
  );
}
