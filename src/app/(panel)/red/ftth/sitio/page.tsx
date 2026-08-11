import { Indicador } from '@/componentes/ui/Indicador';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Elegir } from '@/app/(panel)/red/ftth/sitio/Elegir';
import { Montado } from '@/app/(panel)/red/ftth/sitio/Montado';
import { Sueltos } from '@/app/(panel)/red/ftth/sitio/Sueltos';
import Rack from '@/app/(panel)/red/ftth/sitio/Rack';
import Patcheo from '@/app/(panel)/red/ftth/sitio/Patcheo';
import {
  equiposDeLaCaseta,
  listarEquiposRack,
  listarRacks,
  listarSitiosConRack,
  sinCaseta,
  sueltosDelSitio,
} from '@/modulos/red/racks';
import {
  hilosSinOrigen,
  listarTarjetas,
  puertosOdfDeLaCaseta,
  puertosPonDeLaCaseta,
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

  const [sitios, racks, equiposRack, tarjetas, hilos, zonas, huerfanos] = await Promise.all([
    listarSitiosConRack(),
    listarRacks(),
    listarEquiposRack(),
    listarTarjetas(),
    hilosSinOrigen(),
    listarZonas(),
    sinCaseta(),
  ]);

  // «Sin caseta» es una caseta más. Lo que no pertenece a ningún sitio existe
  // y estorba igual; si no tiene dónde enseñarse, no hay forma de componerlo.
  const HUERFANOS = 'sin-caseta';
  const hayHuerfanos = huerfanos.length > 0;

  const elegido =
    (pedido === HUERFANOS && hayHuerfanos ? HUERFANOS : null) ??
    (pedido && sitios.some((s) => s.id === pedido) ? pedido : null) ??
    sitios.find((s) => s.racks > 0)?.id ??
    sitios[0]?.id ??
    (hayHuerfanos ? HUERFANOS : null);

  const orfandad = elegido === HUERFANOS;
  const sitio = orfandad ? null : (sitios.find((s) => s.id === elegido) ?? null);
  const idSitio = orfandad ? null : (elegido ?? null);

  const susRacks = orfandad ? [] : racks.filter((r) => r.site_id === elegido);
  const idsRack = new Set(susRacks.map((r) => r.id));
  const susItems = equiposRack.filter((e) => idsRack.has(e.rack_id));

  // Se sacan de donde de verdad viven —los equipos y los elementos— y el rack
  // se pega al lado nada más para decir en qué U están, si es que están.
  const [enLaCaseta, susPon, susPuertos, sueltos] = await Promise.all([
    equiposDeLaCaseta(idSitio),
    puertosPonDeLaCaseta(idSitio),
    puertosOdfDeLaCaseta(idSitio),
    orfandad ? Promise.resolve([]) : sueltosDelSitio(elegido!),
  ]);

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
        huerfanos={huerfanos.length}
      />

      {orfandad ? (
        <>
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-aviso">
            Esto no pertenece a ninguna comunidad. Existe y cuenta para todas las validaciones
            —incluso impide borrar cosas— así que conviene componerlo: asígnale su caseta, o
            bórralo.
          </p>

          <Sueltos sueltos={huerfanos} racks={[]} sitio="sin caseta" sitios={sitios} />

          <Montado
            equipos={enLaCaseta}
            tarjetas={tarjetas}
            pones={susPon}
            puertosOdf={susPuertos}
            hilos={hilos}
          />

          <Patcheo pones={susPon} puertos={susPuertos} />
        </>
      ) : !sitio ? (
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

          <Rack racks={susRacks} equipos={susItems} sitio={{ id: sitio.id, name: sitio.name }} />

          <Sueltos sueltos={sueltos} racks={susRacks} sitio={sitio.name} sitios={sitios} />

          <Montado
            equipos={enLaCaseta}
            tarjetas={tarjetas}
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
