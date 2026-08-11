import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { postesDelMapa, puntosDelMapa, trazosDelMapa } from '@/modulos/red/consultas';
import { numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

/** Un color por cable, para poder seguir cada uno con la vista. */
const TRAZO = ['#f2820c', '#16a34a', '#2563eb', '#db2777', '#0ea5e9', '#7c3aed'];

const COLOR: Record<string, string> = {
  ok: '#16a34a',
  aviso: '#d97706',
  falla: '#dc2626',
  marca: '#f97316',
  neutro: '#94a3b8',
};

/**
 * El mapa.
 *
 * No usa Google Maps ni Leaflet a propósito: la oficina de Cuencamé no siempre
 * tiene internet estable, y un mapa que depende de cargar mosaicos de un
 * servidor ajeno es un mapa que el día que más se necesita no abre. Esto es un
 * SVG dibujado con las coordenadas que ya están en la base — sin fondo, pero
 * con las distancias reales entre los puntos, que es lo que sirve para decidir
 * de qué NAP colgar a alguien o a qué torre subir.
 */
export default async function PaginaMapa() {
  const [infra, postes, trazos] = await Promise.all([
    puntosDelMapa(),
    postesDelMapa(),
    trazosDelMapa(),
  ]);
  const puntos = [...infra, ...postes];

  const sitios = puntos.filter((p) => p.clase === 'sitio');
  const cuantosPostes = puntos.filter((p) => p.clase === 'poste').length;
  const alarmados = puntos.filter((p) => p.tono === 'falla');

  if (puntos.length === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-xl font-semibold text-marino-800">Mapa</h1>
        <p className="mt-1 text-sm text-marino-400">La red dibujada con sus coordenadas reales.</p>
        <Tarjeta className="mt-5">
          <div className="py-12 text-center">
            <p className="text-3xl">🗺️</p>
            <p className="mt-3 text-sm font-medium text-marino-800">
              Todavía no hay nada con coordenadas
            </p>
            <p className="mt-1 text-sm text-marino-400">
              Cada torre y cada NAP que captures con latitud y longitud va a aparecer aquí.{' '}
              <Link href="/red/wisp" className="text-naranja-600 hover:underline">
                Empieza por los sitios
              </Link>
              .
            </p>
          </div>
        </Tarjeta>
      </div>
    );
  }

  // Proyección sencilla. A esta escala —un municipio— la Tierra es plana para
  // fines prácticos; lo único que hay que corregir es que un grado de longitud
  // mide menos que uno de latitud conforme uno se aleja del ecuador.
  // El encuadre toma también los trazos: si un cable sale del área donde hay
  // puntos, se saldría del dibujo y parecería cortado.
  const lats = [...puntos.map((p) => p.lat), ...trazos.flatMap((t) => t.puntos.map((q) => q[0]))];
  const lons = [...puntos.map((p) => p.lon), ...trazos.flatMap((t) => t.puntos.map((q) => q[1]))];
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);
  const latMedia = (latMin + latMax) / 2;
  const k = Math.cos((latMedia * Math.PI) / 180);

  const anchoGeo = Math.max((lonMax - lonMin) * k, 0.0008);
  const altoGeo = Math.max(latMax - latMin, 0.0008);

  const W = 1000;
  const H = Math.max(360, Math.min(760, Math.round((W * altoGeo) / anchoGeo)));
  const M = 46;

  const x = (lon: number) => M + ((lon - lonMin) * k * (W - 2 * M)) / anchoGeo;
  // La latitud crece hacia arriba y la Y del SVG hacia abajo: se invierte.
  const y = (lat: number) => H - M - ((lat - latMin) * (H - 2 * M)) / altoGeo;

  // Escala: cuántos metros mide el ancho dibujado.
  const metrosAncho = anchoGeo * 111_320;
  const objetivo = metrosAncho / 4;
  const paso = [50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000].reduce((a, b) =>
    Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a,
  );
  const anchoBarra = (paso / metrosAncho) * (W - 2 * M);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Mapa</h1>
        <p className="mt-1 text-sm text-marino-400">
          La red dibujada con sus coordenadas reales. Sin internet también abre.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(sitios.length)} etiqueta="Sitios en el mapa" tono="marca" />
        <Indicador valor={numero(trazos.length)} etiqueta="Cables dibujados" />
        <Indicador
          valor={numero(alarmados.length)}
          etiqueta="Con problema"
          tono={alarmados.length > 0 ? 'falla' : 'ok'}
        />
        <Indicador valor={numero(cuantosPostes)} etiqueta="Postes" />
      </div>

      <Tarjeta>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-marino-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rotate-45 bg-naranja-500" /> torre o caseta
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-exito" /> NAP con lugar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-aviso" /> por llenarse
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-falla" /> llena o caída
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#1e40af]" /> poste
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 bg-naranja-500" /> cable
          </span>
        </div>

        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[560px] rounded-lg bg-marino-50"
            role="img"
            aria-label="Mapa de la red"
          >
            <defs>
              <pattern id="cuadricula" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#cuadricula)" />

            {/* Primero los cables: van abajo de todo, como en la calle. */}
            {trazos.map((t, i) => (
              <g key={t.id}>
                <path
                  d={t.puntos
                    .map(
                      (q, j) =>
                        `${j === 0 ? 'M' : 'L'} ${x(q[1]).toFixed(1)} ${y(q[0]).toFixed(1)}`,
                    )
                    .join(' ')}
                  fill="none"
                  stroke={t.color ?? TRAZO[i % TRAZO.length]}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
                <text
                  x={x(t.puntos[0][1])}
                  y={y(t.puntos[0][0]) - 6}
                  fontSize="10"
                  fontWeight="600"
                  fill={t.color ?? TRAZO[i % TRAZO.length]}
                >
                  {t.codigo}
                </text>
              </g>
            ))}

            {puntos.map((p) => {
              const px = x(p.lon);
              const py = y(p.lat);
              const color = COLOR[p.tono] ?? COLOR.neutro;
              return (
                <g key={p.id}>
                  {p.clase === 'poste' ? (
                    <circle cx={px} cy={py} r={3} fill="#1e40af" />
                  ) : p.clase === 'sitio' ? (
                    <rect
                      x={px - 7}
                      y={py - 7}
                      width={14}
                      height={14}
                      fill={color}
                      transform={`rotate(45 ${px} ${py})`}
                    />
                  ) : (
                    <circle cx={px} cy={py} r={6} fill={color} />
                  )}
                  <text
                    x={px}
                    y={py - (p.clase === 'sitio' ? 14 : p.clase === 'poste' ? 6 : 11)}
                    textAnchor="middle"
                    fontSize={p.clase === 'poste' ? 8 : 11}
                    fontWeight={p.clase === 'sitio' ? 600 : 400}
                    fill={p.clase === 'poste' ? '#64748b' : '#334155'}
                  >
                    {p.nombre}
                  </text>
                  {p.detalle && p.clase !== 'poste' && (
                    <text x={px} y={py + 19} textAnchor="middle" fontSize="9.5" fill="#94a3b8">
                      {p.detalle}
                    </text>
                  )}
                </g>
              );
            })}

            <g transform={`translate(${M} ${H - 18})`}>
              <line x1="0" y1="0" x2={anchoBarra} y2="0" stroke="#475569" strokeWidth="2" />
              <line x1="0" y1="-4" x2="0" y2="4" stroke="#475569" strokeWidth="2" />
              <line
                x1={anchoBarra}
                y1="-4"
                x2={anchoBarra}
                y2="4"
                stroke="#475569"
                strokeWidth="2"
              />
              <text x={anchoBarra / 2} y="-8" textAnchor="middle" fontSize="11" fill="#475569">
                {paso >= 1000 ? `${paso / 1000} km` : `${paso} m`}
              </text>
            </g>
            <text x={W - 12} y={H - 14} textAnchor="end" fontSize="10" fill="#94a3b8">
              norte arriba
            </text>
          </svg>
        </div>

        <p className="mt-3 text-xs text-marino-400">
          Las distancias entre puntos son reales; lo que no hay es fondo de calles. Para eso,
          cualquier coordenada de esta lista se pega en el mapa del celular.
        </p>
      </Tarjeta>
    </div>
  );
}
