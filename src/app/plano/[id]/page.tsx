import { notFound } from 'next/navigation';
import { obtenerPlano } from '@/modulos/posteria/consultas';
import { listarPostes } from '@/modulos/posteria/consultas';
import { listarCables } from '@/modulos/ftth/consultas';
import { PLANO_POR_DEFECTO, type ConfigPlano } from '@/modulos/posteria/tipos';
import { Imprimir } from '@/app/plano/[id]/Imprimir';

export const dynamic = 'force-dynamic';

const HOJAS = {
  carta: { w: 1056, h: 816, css: '11in 8.5in' },
  tabloide: { w: 1632, h: 1056, css: '17in 11in' },
};

/**
 * La hoja de CFE.
 *
 * Vive fuera del panel a propósito: se abre en su pestaña, se imprime y se
 * cierra. Meterla adentro obligaría a esconder el menú al imprimir, y siempre
 * se cuela algo.
 */
export default async function PaginaImprimirPlano({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [plano, cables] = await Promise.all([obtenerPlano(id), listarCables()]);
  if (!plano) notFound();

  const c: ConfigPlano = { ...PLANO_POR_DEFECTO, ...(plano.config ?? {}) };
  const postes = await listarPostes(c.cable_id ?? undefined);
  const conCoord = postes.filter((p) => p.latitude !== null && p.longitude !== null);

  const hoja = HOJAS[c.hoja === 'tabloide' ? 'tabloide' : 'carta'];
  const nuevos = postes.filter((p) => p.is_new).length;
  const metros = postes.reduce((s, p) => s + Number(p.span_m ?? 0), 0);

  // El dibujo: mismo criterio que el mapa. Sin fondo de calles, pero con las
  // distancias reales, que es lo que CFE revisa.
  let svg: React.ReactNode = null;
  if (conCoord.length >= 2) {
    const lats = conCoord.map((p) => Number(p.latitude));
    const lons = conCoord.map((p) => Number(p.longitude));
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lonMin = Math.min(...lons);
    const lonMax = Math.max(...lons);
    const k = Math.cos(((latMin + latMax) / 2) * (Math.PI / 180));
    const anchoGeo = Math.max((lonMax - lonMin) * k, 0.0004);
    const altoGeo = Math.max(latMax - latMin, 0.0004);

    const W = hoja.w - 60;
    const H = Math.round(hoja.h * 0.62);
    const M = 34;
    const x = (lon: number) => M + ((lon - lonMin) * k * (W - 2 * M)) / anchoGeo;
    const y = (lat: number) => H - M - ((lat - latMin) * (H - 2 * M)) / altoGeo;

    const porCable = new Map<string, typeof conCoord>();
    for (const p of conCoord) {
      const kk = p.cable ?? 'sueltos';
      if (!porCable.has(kk)) porCable.set(kk, []);
      porCable.get(kk)!.push(p);
    }

    svg = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trazo de la fibra">
        {[...porCable.entries()].map(([nombre, lista], ci) => {
          const orden = [...lista].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const color = ['#f2820c', '#16a34a', '#2563eb', '#db2777', '#0ea5e9'][ci % 5];
          const d = orden
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${x(Number(p.longitude)).toFixed(1)} ${y(Number(p.latitude)).toFixed(1)}`,
            )
            .join(' ');
          return (
            <g key={nombre}>
              {orden.length >= 2 && <path d={d} fill="none" stroke={color} strokeWidth="2.5" />}
              {orden.map((p) => {
                const px = x(Number(p.longitude));
                const py = y(Number(p.latitude));
                return (
                  <g key={p.id}>
                    <circle
                      cx={px}
                      cy={py}
                      r="5"
                      fill={p.is_new ? '#ffffff' : '#1e40af'}
                      stroke="#1e40af"
                      strokeWidth="2"
                    />
                    <text x={px} y={py - 9} textAnchor="middle" fontSize="10" fill="#1e293b">
                      {p.number ?? ''}
                    </text>
                    {p.span_m !== null && (
                      <text x={px} y={py + 16} textAnchor="middle" fontSize="8.5" fill="#64748b">
                        {Math.round(Number(p.span_m))}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    );
  }

  const Casilla = ({ t, v, ancho = '' }: { t: string; v?: string | number; ancho?: string }) => (
    <div className={`border border-black px-1.5 py-0.5 ${ancho}`}>
      <p className="text-[7px] uppercase leading-tight text-black/60">{t}</p>
      <p className="text-[9px] font-semibold leading-tight text-black">{v || ' '}</p>
    </div>
  );

  return (
    <>
      <Imprimir tamano={hoja.css} />
      <div className="mx-auto bg-white p-4 text-black" style={{ maxWidth: hoja.w }}>
        <div className="mb-2 flex items-start justify-between gap-3 print:hidden">
          <p className="text-sm text-slate-500">
            Esta hoja está lista para imprimir. Usa Ctrl+P y elige{' '}
            {c.hoja === 'tabloide' ? 'tabloide' : 'carta'} horizontal, sin márgenes.
          </p>
        </div>

        <div className="border-2 border-black">
          <div className="flex items-stretch justify-between border-b-2 border-black">
            <div className="flex-1 px-2 py-1">
              <p className="text-[13px] font-bold uppercase">{c.proyecto}</p>
              <p className="text-[9px]">{c.tipo_solicitud}</p>
            </div>
            <div className="w-52 border-l-2 border-black px-2 py-1">
              <p className="text-[10px] font-bold">{c.concesionario || 'ZUUUM FIBRA'}</p>
              <p className="text-[8px] leading-tight">{c.direccion}</p>
              <p className="text-[8px] leading-tight">
                {[c.telefono, c.email].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          <div className="border-b-2 border-black p-2">
            {svg ?? (
              <p className="py-16 text-center text-sm text-slate-400">
                Todavía no hay postes con coordenadas para dibujar.
              </p>
            )}
          </div>

          <div className="grid grid-cols-6 gap-0 border-b border-black text-black">
            <Casilla t="Ubicación" v={c.ubicacion} ancho="col-span-2" />
            <Casilla t="Dependencia" v={c.dependencia} />
            <Casilla t="Tipo de fibra" v={c.tipo_fibra} ancho="col-span-2" />
            <Casilla t="Acotación" v={c.acotacion} />
            <Casilla t="Postes en el plano" v={postes.length} />
            <Casilla t="Postes nuevos" v={c.postes_nuevos || nuevos} />
            <Casilla t="Longitud total" v={`${Math.round(metros)} m`} />
            <Casilla t="Cables" v={c.cable_id ? 1 : cables.length} />
            <Casilla t="Emisión" v={c.emision} />
            <Casilla t="Id del proyecto" v={c.id_proyecto} />
            <Casilla t="Dibujó" v={c.dibujo} ancho="col-span-2" />
            <Casilla t="Representante legal" v={c.representante} ancho="col-span-2" />
            <Casilla t="Autoriza" v={c.autoriza} />
            <Casilla t="Plano" v={`${c.plano_num ?? 1} de ${c.plano_total ?? 1}`} />
          </div>

          <div className="flex items-start gap-4 p-2">
            <div className="flex-1">
              <p className="whitespace-pre-line text-[8.5px] leading-tight">{c.notas}</p>
            </div>
            <div className="w-64 shrink-0">
              <p className="mb-1 text-[8px] font-bold uppercase">Simbología</p>
              <div className="space-y-0.5 text-[8px]">
                <p className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-6 bg-[#f2820c]" /> Fibra óptica nueva ADSS
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#1e40af] bg-[#1e40af]" />{' '}
                  Poste de concreto existente propiedad de CFE
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#1e40af] bg-white" />{' '}
                  Poste nuevo por plantar
                </p>
                <p className="text-black/60">
                  El número de arriba es el poste; el de abajo, el vano en metros.
                </p>
              </div>
            </div>
          </div>
        </div>

        <table className="mt-3 w-full border border-black text-[8.5px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black px-1 py-0.5 text-left">Poste</th>
              <th className="border border-black px-1 py-0.5 text-left">Tipo</th>
              <th className="border border-black px-1 py-0.5 text-left">Latitud</th>
              <th className="border border-black px-1 py-0.5 text-left">Longitud</th>
              <th className="border border-black px-1 py-0.5 text-right">Vano (m)</th>
            </tr>
          </thead>
          <tbody>
            {conCoord.map((p) => (
              <tr key={p.id}>
                <td className="border border-black px-1 py-0.5 font-semibold">
                  {p.number ?? '—'}
                  {p.is_new && ' (nuevo)'}
                </td>
                <td className="border border-black px-1 py-0.5">
                  {p.pole_type.startsWith('cfe') ? 'CFE' : 'Propio'}
                </td>
                <td className="border border-black px-1 py-0.5">{Number(p.latitude).toFixed(6)}</td>
                <td className="border border-black px-1 py-0.5">
                  {Number(p.longitude).toFixed(6)}
                </td>
                <td className="border border-black px-1 py-0.5 text-right">
                  {p.span_m !== null ? Math.round(Number(p.span_m)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
