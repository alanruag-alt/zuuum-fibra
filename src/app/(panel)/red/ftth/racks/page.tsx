import { Indicador } from '@/componentes/ui/Indicador';
import Racks from '@/app/(panel)/red/ftth/racks/Racks';
import Patcheo from '@/app/(panel)/red/ftth/racks/Patcheo';
import { listarEquiposRack, listarRacks } from '@/modulos/red/racks';
import {
  listarPuertosOdf,
  listarPuertosPon,
  listarSitiosRed,
  listarTarjetas,
} from '@/modulos/red/olt';
import { listarDispositivos, listarElementos } from '@/modulos/red/consultas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

/**
 * El diseño del rack.
 *
 * Lo que hay en la caseta ya estaba capturado; lo que faltaba era dónde está
 * cada cosa. Un inventario contesta «tenemos una OLT»; el rack contesta «está
 * en la U36 del gabinete de la pared norte, y arriba quedan seis unidades».
 * La segunda es la que se necesita cuando hay que ir.
 */
export default async function PaginaRacks() {
  const [racks, equipos, sitios, olts, odfs, pones, puertos, tarjetas] = await Promise.all([
    listarRacks(),
    listarEquiposRack(),
    listarSitiosRed(),
    listarDispositivos(['olt']),
    listarElementos(['odf']),
    listarPuertosPon(),
    listarPuertosOdf(),
    listarTarjetas(),
  ]);

  const unidades = racks.reduce((s, r) => s + r.units, 0);
  const ocupadas = racks.reduce((s, r) => s + Number(r.ocupadas), 0);
  const patcheados = pones.filter((p) => p.odf_port_id).length;

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm text-marino-500">
        El gabinete de cada sitio, unidad por unidad. Sirve para saber si cabe la siguiente tarjeta
        antes de comprarla, y para encontrar el equipo sin abrir las tres puertas.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          valor={numero(racks.length)}
          etiqueta="Gabinetes"
          detalle={`${racks.length === 0 ? 0 : new Set(racks.map((r) => r.site_id)).size} sitios`}
        />
        <Indicador valor={numero(equipos.length)} etiqueta="Equipos montados" tono="marca" />
        <Indicador
          valor={`${numero(ocupadas)} / ${numero(unidades)}`}
          etiqueta="Unidades ocupadas"
          tono={unidades > 0 && ocupadas / unidades >= 0.9 ? 'aviso' : 'neutro'}
        />
        <Indicador
          valor={`${numero(patcheados)} / ${numero(pones.length)}`}
          etiqueta="PON con latiguillo"
          detalle={`${tarjetas.length} tarjetas`}
          tono="ok"
        />
      </div>

      <Racks
        racks={racks}
        equipos={equipos}
        sitios={sitios.map((s) => ({ id: s.id, name: s.name }))}
        olts={olts.map((o) => ({
          id: o.id,
          etiqueta: o.name,
          vendor: o.vendor,
          model: o.model,
          detalle: o.sitio ?? null,
        }))}
        odfs={odfs.map((o) => ({
          id: o.id,
          etiqueta: o.code,
          detalle: o.name ?? null,
        }))}
      />

      <Patcheo pones={pones} puertos={puertos} />
    </div>
  );
}
