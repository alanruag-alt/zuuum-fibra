import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { EditorAjuste } from '@/app/(panel)/ajustes/EditorAjuste';
import { listarAjustes } from '@/modulos/admin/consultas';

export const dynamic = 'force-dynamic';

const CATEGORIAS: Record<string, { titulo: string; nota?: string }> = {
  cobranza: {
    titulo: 'Cobranza',
    nota: 'Estas fechas mandan sobre todo lo demás. Cambiarlas aquí cambia cuándo vence, cuándo se acaba la gracia y a quién le toca el corte — sin tocar una sola línea de código.',
  },
  instalacion: {
    titulo: 'Instalación',
    nota: 'Cómo se arma el nombre de la red WiFi y qué potencia óptica se considera buena.',
  },
  red: { titulo: 'Red', nota: 'Guardas del OTDR y cada cuánto se resumen las lecturas.' },
  general: { titulo: 'General' },
};

export default async function PaginaAjustes() {
  const ajustes = await listarAjustes();

  const porCategoria = ajustes.reduce<Record<string, typeof ajustes>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Configuración</h1>
        <p className="mt-1 text-sm text-marino-400">
          Las reglas del negocio. Cambiar una regla nunca debería requerir que alguien toque código,
          y aquí no lo requiere.
        </p>
      </div>

      {ajustes.length === 0 ? (
        <Tarjeta>
          <p className="py-8 text-center text-sm text-marino-300">
            No hay ajustes visibles — o no tienes permiso para verlos.
          </p>
        </Tarjeta>
      ) : (
        <div className="space-y-5">
          {Object.entries(porCategoria).map(([cat, lista]) => {
            const info = CATEGORIAS[cat] ?? { titulo: cat };
            return (
              <Tarjeta key={cat} titulo={info.titulo} descripcion={info.nota}>
                <ul className="divide-y divide-marino-100">
                  {lista.map((a) => (
                    <EditorAjuste key={a.key} ajuste={a} />
                  ))}
                </ul>
              </Tarjeta>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-marino-400">
        La base revisa cada valor antes de guardarlo. Un día de corte escrito con letras, o un corte
        que caería antes de que se acabe la gracia, se rechazan aquí — no el día 11, cuando ya nadie
        se acuerda de quién lo cambió.
      </p>
    </div>
  );
}
