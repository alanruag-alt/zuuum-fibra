import Link from 'next/link';
import { Indicador } from '@/componentes/ui/Indicador';
import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { Invitar } from '@/app/(panel)/usuarios/Invitar';
import { listarPersonas, listarRoles } from '@/modulos/admin/consultas';
import { listarZonas } from '@/modulos/clientes/consultas';
import { hayLlaveDeServicio } from '@/lib/supabase/administrador';
import { fecha, numero } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const ALCANCE: Record<string, string> = {
  all: 'Toda la empresa',
  zones: 'Solo sus zonas',
  own: 'Solo lo suyo',
};

export default async function PaginaUsuarios() {
  const [personas, roles, zonas] = await Promise.all([
    listarPersonas(),
    listarRoles(),
    listarZonas(),
  ]);

  const llave = hayLlaveDeServicio();
  const activos = personas.filter((p) => p.is_active);
  const sinZonas = activos.filter((p) => p.alcance === 'zones' && p.zonas === 0);
  const sinRol = activos.filter((p) => !p.rol_codigo);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-marino-800">Usuarios y permisos</h1>
          <p className="mt-1 text-sm text-marino-400">Quién puede entrar, qué ve y dónde cobra.</p>
        </div>
        <Invitar roles={roles} zonas={zonas} hayLlave={llave} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={numero(activos.length)} etiqueta="Con acceso" tono="ok" />
        <Indicador
          valor={numero(personas.length - activos.length)}
          etiqueta="Desactivados"
          detalle="conservan su historial"
        />
        <Indicador
          valor={numero(sinZonas.length)}
          etiqueta="Sin zonas"
          tono={sinZonas.length > 0 ? 'aviso' : 'ok'}
          detalle={sinZonas.length > 0 ? 'no ven ningún cliente' : undefined}
        />
        <Indicador
          valor={numero(sinRol.length)}
          etiqueta="Sin rol"
          tono={sinRol.length > 0 ? 'falla' : 'ok'}
        />
      </div>

      {(sinZonas.length > 0 || sinRol.length > 0) && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-aviso">
          {sinRol.length > 0 && (
            <p>
              <strong>{sinRol.map((p) => p.full_name).join(', ')}</strong>{' '}
              {sinRol.length === 1 ? 'no tiene' : 'no tienen'} rol. Sin rol se puede entrar al panel
              pero no se ve nada.
            </p>
          )}
          {sinZonas.length > 0 && (
            <p className={sinRol.length > 0 ? 'mt-1' : undefined}>
              <strong>{sinZonas.map((p) => p.full_name).join(', ')}</strong>{' '}
              {sinZonas.length === 1 ? 'no tiene' : 'no tienen'} zonas asignadas, y con su rol eso
              significa que no {sinZonas.length === 1 ? 've' : 'ven'} ningún cliente.
            </p>
          )}
        </div>
      )}

      <Tarjeta>
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-marino-100">
                {['Nombre', 'Correo', 'Rol', 'Alcance', 'Zonas', 'Permisos', 'Estado'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-marino-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-marino-100">
              {personas.map((p) => (
                <tr
                  key={p.id}
                  className={`transition-colors hover:bg-marino-50 ${
                    p.is_active ? '' : 'opacity-50'
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <Link href={`/usuarios/${p.id}`} className="hover:underline">
                      <span className="font-medium text-marino-800">{p.full_name}</span>
                    </Link>
                    {p.employee_code && (
                      <span className="ml-2 font-mono text-xs text-marino-400">
                        {p.employee_code}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-marino-500">{p.email ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {p.rol ? (
                      <span className="text-marino-700">{p.rol}</span>
                    ) : (
                      <Insignia tono="falla">sin rol</Insignia>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-marino-400">
                    {p.alcance ? (ALCANCE[p.alcance] ?? p.alcance) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {p.alcance === 'all' ? (
                      <span className="text-marino-400">todas</span>
                    ) : p.zonas === 0 ? (
                      <Insignia tono="aviso">ninguna</Insignia>
                    ) : (
                      <span className="text-marino-600" title={p.zonas_nombres ?? undefined}>
                        {p.zonas}
                        {p.zonas_cobra > 0 && (
                          <span className="ml-1 text-xs text-naranja-600">
                            ({p.zonas_cobra} cobra)
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {p.permisos_especiales > 0 ? (
                      <Insignia tono="marca">{p.permisos_especiales} fuera del rol</Insignia>
                    ) : (
                      <span className="text-marino-300">del rol</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {p.is_active ? (
                      <Insignia tono="ok">Activo</Insignia>
                    ) : (
                      <Insignia tono="neutro">Desactivado</Insignia>
                    )}
                    {p.last_seen_at && (
                      <span className="ml-2 text-xs text-marino-300">{fecha(p.last_seen_at)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Los siete roles"
        descripcion="Qué trae cada uno de fábrica."
        className="mt-6"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-lg bg-marino-50 p-3">
              <p className="text-sm font-medium text-marino-800">{r.name}</p>
              <p className="mt-0.5 text-xs text-marino-400">
                {ALCANCE[r.scope_type] ?? r.scope_type} · {r.permisos} permisos
              </p>
              {r.description && <p className="mt-1 text-xs text-marino-500">{r.description}</p>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-marino-400">
          Un técnico, almacén o cliente nunca puede tener permisos de dinero, ni aunque se los den a
          mano. Eso está bloqueado en la base, no en esta pantalla.
        </p>
      </Tarjeta>
    </div>
  );
}
