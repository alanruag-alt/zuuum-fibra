import { Insignia } from '@/componentes/ui/Insignia';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { listarAuditoria } from '@/modulos/admin/consultas';
import { fechaHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const TABLA: Record<string, string> = {
  customers: 'Clientes',
  customer_services: 'Servicios',
  charges: 'Cargos',
  payments: 'Pagos',
  payment_allocations: 'Aplicaciones de pago',
  cash_sessions: 'Cajas',
  profiles: 'Personas',
  user_roles: 'Roles asignados',
  user_permissions: 'Permisos sueltos',
  user_zones: 'Zonas asignadas',
  settings: 'Configuración',
  zones: 'Zonas',
  service_plans: 'Planes',
  work_orders: 'Órdenes',
  tickets: 'Tickets',
  equipment_units: 'Equipos',
};

const ACCION: Record<string, { texto: string; tono: 'ok' | 'aviso' | 'falla' | 'neutro' }> = {
  insert: { texto: 'creó', tono: 'ok' },
  update: { texto: 'cambió', tono: 'aviso' },
  delete: { texto: 'borró', tono: 'falla' },
};

export default async function PaginaAuditoria() {
  const movimientos = await listarAuditoria(150);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-marino-800">Auditoría</h1>
        <p className="mt-1 text-sm text-marino-400">
          Quién tocó qué y cuándo. No se puede editar ni borrar desde ningún lado del sistema.
        </p>
      </div>

      <Tarjeta>
        {movimientos.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">🔍</p>
            <p className="mt-3 text-sm font-medium text-marino-800">Todavía no hay movimientos</p>
            <p className="mt-1 text-sm text-marino-400">
              O no tienes permiso para ver la auditoría. Se llena sola conforme la gente usa el
              sistema.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-marino-100">
            {movimientos.map((m) => {
              const a = ACCION[m.action] ?? { texto: m.action, tono: 'neutro' as const };
              const cambios = m.cambios ? Object.entries(m.cambios) : [];
              return (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-marino-800">
                      {m.quien ?? 'el sistema'}
                    </span>
                    <Insignia tono={a.tono}>{a.texto}</Insignia>
                    <span className="text-sm text-marino-600">
                      {TABLA[m.table_name] ?? m.table_name}
                    </span>
                    <span className="ml-auto text-xs text-marino-400">
                      {fechaHora(m.created_at)}
                    </span>
                  </div>

                  {cambios.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {cambios.slice(0, 6).map(([campo, v]) => {
                        const d = v as { antes?: unknown; ahora?: unknown };
                        return (
                          <li key={campo} className="text-xs text-marino-500">
                            <span className="font-mono text-marino-400">{campo}</span>{' '}
                            {'antes' in d ? (
                              <>
                                <span className="line-through opacity-60">
                                  {String(d.antes ?? '—')}
                                </span>{' '}
                                → <span className="text-marino-700">{String(d.ahora ?? '—')}</span>
                              </>
                            ) : (
                              String(v)
                            )}
                          </li>
                        );
                      })}
                      {cambios.length > 6 && (
                        <li className="text-xs text-marino-300">
                          y {cambios.length - 6} campos más
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
