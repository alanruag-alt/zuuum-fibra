import { deflateRawSync } from 'node:zlib';

/**
 * Un Excel de verdad, sin librerías.
 *
 * Un .xlsx no es más que un ZIP con unos cuantos XML adentro. Escribirlo a
 * mano son ciento y pico de líneas; meter una librería de las que hay son
 * varios megas de dependencia, actualizaciones que atender y una superficie
 * más que auditar, todo para armar una tabla de texto.
 *
 * Lo que se genera aquí abre en Excel, en LibreOffice y en Google Sheets sin
 * avisos de «el formato no coincide», que es justo lo que pasa con los
 * archivos de XML plano que muchos sistemas llaman Excel.
 */

export interface Hoja {
  nombre: string;
  filas: (string | number | null | undefined)[][];
}

// ─────────────────────────────────────────────────────────────────── ZIP
interface Entrada {
  nombre: string;
  datos: Buffer;
  crc: number;
  comprimido: Buffer;
}

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zip(entradas: { nombre: string; texto: string }[]): Buffer {
  const items: Entrada[] = entradas.map((e) => {
    const datos = Buffer.from(e.texto, 'utf8');
    return { nombre: e.nombre, datos, crc: crc32(datos), comprimido: deflateRawSync(datos) };
  });

  const locales: Buffer[] = [];
  const central: Buffer[] = [];
  let desplazamiento = 0;

  for (const it of items) {
    const nombre = Buffer.from(it.nombre, 'utf8');

    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0);
    cab.writeUInt16LE(20, 4); // versión necesaria
    cab.writeUInt16LE(0, 6); // banderas
    cab.writeUInt16LE(8, 8); // deflate
    cab.writeUInt16LE(0, 10); // hora
    cab.writeUInt16LE(0x21, 12); // fecha: 1 de enero de 1980, fija a propósito
    cab.writeUInt32LE(it.crc, 14);
    cab.writeUInt32LE(it.comprimido.length, 18);
    cab.writeUInt32LE(it.datos.length, 22);
    cab.writeUInt16LE(nombre.length, 26);
    cab.writeUInt16LE(0, 28);
    locales.push(cab, nombre, it.comprimido);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(it.crc, 16);
    dir.writeUInt32LE(it.comprimido.length, 20);
    dir.writeUInt32LE(it.datos.length, 24);
    dir.writeUInt16LE(nombre.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(desplazamiento, 42);
    central.push(dir, nombre);

    desplazamiento += 30 + nombre.length + it.comprimido.length;
  }

  const cuerpo = Buffer.concat(locales);
  const directorio = Buffer.concat(central);

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(items.length, 8);
  fin.writeUInt16LE(items.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);
  fin.writeUInt16LE(0, 20);

  return Buffer.concat([cuerpo, directorio, fin]);
}

// ─────────────────────────────────────────────────────────────────── XML
function esc(v: string): string {
  return (
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Excel se atraganta con los caracteres de control; se quitan y ya.
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  );
}

function letra(n: number): string {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Los nombres de hoja de Excel no aceptan : \ / ? * [ ] y se cortan en 31.
 * Un código de caja como «CE-CUE-005» pasa entero; se limpia por si acaso.
 */
function nombreHoja(s: string): string {
  return (s || 'Hoja').replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'Hoja';
}

function hojaXml(hoja: Hoja): string {
  const filas = hoja.filas
    .map((fila, i) => {
      const celdas = fila
        .map((valor, j) => {
          if (valor === null || valor === undefined || valor === '') return '';
          const ref = `${letra(j)}${i + 1}`;
          if (typeof valor === 'number' && Number.isFinite(valor)) {
            return `<c r="${ref}"><v>${valor}</v></c>`;
          }
          // Encabezados en negritas: es la primera fila y siempre lo es.
          const estilo = i === 0 ? ' s="1"' : '';
          return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${esc(
            String(valor),
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${i + 1}">${celdas}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas}</sheetData></worksheet>`;
}

export function construirXlsx(hojas: Hoja[]): Buffer {
  const usadas = new Set<string>();
  const limpias = hojas.map((h, i) => {
    let n = nombreHoja(h.nombre);
    while (usadas.has(n.toLowerCase())) n = nombreHoja(`${n} ${i + 1}`);
    usadas.add(n.toLowerCase());
    return { ...h, nombre: n };
  });

  const archivos: { nombre: string; texto: string }[] = [
    {
      nombre: '[Content_Types].xml',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${limpias
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`,
    },
    {
      nombre: '_rels/.rels',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nombre: 'xl/workbook.xml',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${limpias
        .map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${limpias
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rId${limpias.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      nombre: 'xl/styles.xml',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
  ];

  limpias.forEach((h, i) => {
    archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hojaXml(h) });
  });

  return zip(archivos);
}
