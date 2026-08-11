import { redirect } from 'next/navigation';

/**
 * El rack dejó de vivir aparte.
 *
 * Se juntó con la caseta porque en campo son el mismo momento: se llega a la
 * comunidad, se abre el gabinete, y de ahí se ve todo. Esta ruta se queda
 * nada más para que los enlaces viejos no truenen.
 */
export default function PaginaRacks() {
  redirect('/red/ftth/sitio');
}
