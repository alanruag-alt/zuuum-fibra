import 'server-only';
import { inflateRawSync } from 'node:zlib';

/**
 * Leer un KMZ sin depender de nadie.
 *
 * Un KMZ es un ZIP con un KML adentro. No hace falta una librería: el formato
 * ZIP es viejo y sencillo, y aquí solo se necesita la mitad que lee. Menos
 * dependencias es menos cosas que se rompen dentro de dos años, y este código
 * va a seguir corriendo cuando la moda de las librerías haya cambiado tres
 * veces.
 *
 * Solo se soportan los dos métodos que usan Google Earth y QGIS: sin comprimir
 * (0) y deflate (8). Cualquier otro se rechaza diciendo por qué.
 */
function leerZip(buf: Buffer): Map<string, Buffer> {
  const salida = new Map<string, Buffer>();

  // Se busca el final del directorio central desde atrás: ahí está el índice
  // de verdad. Leer los encabezados locales de frente falla con los archivos
  // que traen el tamaño en el descriptor de después.
  let fin = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('Ese archivo no parece un KMZ: no trae índice de ZIP.');

  const cuantos = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);

  for (let n = 0; n < cuantos; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;

    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const crudo = buf.readUInt32LE(p + 24);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComent = buf.readUInt16LE(p + 32);
    const desplazamiento = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre);

    // El encabezado local dice cuánto miden SUS campos variables, que no
    // tienen por qué medir lo mismo que los del directorio central.
    const ln = buf.readUInt16LE(desplazamiento + 26);
    const le = buf.readUInt16LE(desplazamiento + 28);
    const datos = buf.subarray(
      desplazamiento + 30 + ln + le,
      desplazamiento + 30 + ln + le + comprimido,
    );

    if (metodo === 0) {
      salida.set(nombre, Buffer.from(datos));
    } else if (metodo === 8) {
      const salido = inflateRawSync(datos);
      if (salido.length !== crudo && crudo !== 0) {
        throw new Error(`El archivo ${nombre} viene incompleto dentro del KMZ.`);
      }
      salida.set(nombre, salido);
    } else {
      throw new Error(
        `El KMZ usa una compresión que no se puede leer (método ${metodo}). ` +
          'Vuélvelo a exportar desde Google Earth.',
      );
    }

    p += 46 + largoNombre + largoExtra + largoComent;
  }

  return salida;
}

export interface PuntoKml {
  nombre: string;
  descripcion: string | null;
  lat: number;
  lon: number;
  carpeta: string | null;
}

export interface LineaKml {
  nombre: string;
  descripcion: string | null;
  puntos: [number, number][];
  carpeta: string | null;
}

function sinEtiquetas(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Las coordenadas de un KML vienen «lon,lat,altura» separadas por espacios.
 * Ojo con el orden: al revés de como se dicen. Confundirlo pone Cuencamé en
 * medio del océano Índico.
 */
function coords(txt: string): [number, number][] {
  const salida: [number, number][] = [];
  for (const trozo of txt.trim().split(/\s+/)) {
    const partes = trozo.split(',');
    if (partes.length < 2) continue;
    const lon = Number(partes[0]);
    const lat = Number(partes[1]);
    if (Number.isNaN(lon) || Number.isNaN(lat)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    salida.push([lat, lon]);
  }
  return salida;
}

export interface ContenidoKml {
  puntos: PuntoKml[];
  lineas: LineaKml[];
}

export function leerKml(xml: string): ContenidoKml {
  const puntos: PuntoKml[] = [];
  const lineas: LineaKml[] = [];

  // La carpeta se lleva aparte porque en los KMZ de campo es donde viene la
  // información útil: «Postes», «NAP», «Ruta troncal».
  const carpetas: { nombre: string; desde: number; hasta: number }[] = [];
  const reCarpeta = /<Folder\b[\s\S]*?<name>([\s\S]*?)<\/name>/gi;
  let m: RegExpExecArray | null;
  while ((m = reCarpeta.exec(xml)) !== null) {
    carpetas.push({ nombre: sinEtiquetas(m[1]), desde: m.index, hasta: xml.length });
  }
  for (let i = 0; i < carpetas.length - 1; i++) carpetas[i].hasta = carpetas[i + 1].desde;

  const carpetaDe = (pos: number) =>
    carpetas.find((c) => pos >= c.desde && pos < c.hasta)?.nombre ?? null;

  const rePlacemark = /<Placemark\b[\s\S]*?<\/Placemark>/gi;
  while ((m = rePlacemark.exec(xml)) !== null) {
    const bloque = m[0];
    const nombre = sinEtiquetas((/<name>([\s\S]*?)<\/name>/i.exec(bloque) ?? [, ''])[1]);
    const desc = sinEtiquetas(
      (/<description>([\s\S]*?)<\/description>/i.exec(bloque) ?? [, ''])[1],
    );
    const carpeta = carpetaDe(m.index);

    const punto = /<Point\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i.exec(bloque);
    if (punto) {
      const c = coords(punto[1]);
      if (c.length) {
        puntos.push({
          nombre: nombre || 'Sin nombre',
          descripcion: desc || null,
          lat: c[0][0],
          lon: c[0][1],
          carpeta,
        });
      }
      continue;
    }

    // LineString y LinearRing se tratan igual: son un trazo.
    const linea =
      /<(?:LineString|LinearRing)\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i.exec(bloque);
    if (linea) {
      const c = coords(linea[1]);
      if (c.length >= 2) {
        lineas.push({
          nombre: nombre || 'Sin nombre',
          descripcion: desc || null,
          puntos: c,
          carpeta,
        });
      }
    }
  }

  return { puntos, lineas };
}

/** Abre un KMZ (o un KML suelto) y devuelve lo que trae adentro. */
export function leerKmz(buf: Buffer, nombreArchivo: string): ContenidoKml {
  if (/\.kml$/i.test(nombreArchivo)) {
    return leerKml(buf.toString('utf8'));
  }

  const archivos = leerZip(buf);
  const kml = [...archivos.entries()].find(([n]) => /\.kml$/i.test(n));

  if (!kml) throw new Error('El KMZ no trae ningún archivo KML adentro.');

  return leerKml(kml[1].toString('utf8'));
}
