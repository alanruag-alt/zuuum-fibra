'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { abrirTicket, atenderTicket } from '@/modulos/campo/acciones';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Persona } from '@/modulos/admin/tipos';
import type { Ticket } from '@/modulos/campo/tipos';
import type { ClienteResumen } from '@/modulos/clientes/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

function Aviso({ estado }: { estado: Respuesta | null }) {
  if (!estado) return null;
  return (
    <p
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${
        estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
      }`}
    >
      {estado.mensaje}
    </p>
  );
}

export function NuevoTicket({ clientes }: { clientes: ClienteResumen[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(abrirTicket, null);

  if (!abierto) return <Boton onClick={() => setAbierto(true)}>Reportar una falla</Boton>;

  return (
    <Tarjeta titulo="Nuevo reporte" className="w-full">
      {estado && <Aviso estado={estado} />}
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Cliente</span>
              <select name="cliente" required className={CAMPO}>
                <option value="">Elige</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customer_code} · {c.full_name} · {c.zona}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Qué pasa</span>
              <select name="categoria" required className={CAMPO}>
                <option value="no_service">No tiene servicio</option>
                <option value="slow">Va lento</option>
                <option value="intermittent">Se va y viene</option>
                <option value="equipment">Problema con el equipo</option>
                <option value="billing">Cobranza</option>
                <option value="other">Otra cosa</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Asunto</span>
              <input
                name="asunto"
                required
                placeholder="No tiene internet desde ayer en la tarde"
                className={CAMPO}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Detalle</span>
              <input
                name="detalle"
                placeholder="Qué dijo el cliente, qué luces tiene el equipo…"
                className={CAMPO}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Prioridad</span>
              <select name="prioridad" defaultValue="normal" className={CAMPO}>
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <Boton type="submit" cargando={enviando}>
              Abrir el ticket
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
      {estado?.ok && (
        <Boton variante="secundario" onClick={() => setAbierto(false)} className="mt-3">
          Cerrar
        </Boton>
      )}
    </Tarjeta>
  );
}

export function AtenderTicket({ ticket, gente }: { ticket: Ticket; gente: Persona[] }) {
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    atenderTicket,
    null,
  );
  const [nuevoEstado, setNuevoEstado] = useState(ticket.status);

  const cerrando = ['resolved', 'closed'].includes(nuevoEstado);
  const yaCerrado = ticket.status === 'closed';

  if (yaCerrado) {
    return <p className="text-sm text-marino-400">Este ticket ya está cerrado.</p>;
  }

  return (
    <div>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="ticket" value={ticket.id} />
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Estado</span>
            <select
              name="estado"
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value)}
              className={CAMPO}
            >
              <option value="open">Abierto</option>
              <option value="assigned">Asignado</option>
              <option value="in_progress">En curso</option>
              <option value="waiting">Esperando al cliente</option>
              <option value="resolved">Resuelto</option>
              <option value="closed">Cerrado</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-marino-600">Quién lo atiende</span>
            <select name="asignar" defaultValue={ticket.assigned_to ?? ''} className={CAMPO}>
              <option value="">Nadie todavía</option>
              {gente.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-marino-600">
              Causa {cerrando && <span className="text-falla">*</span>}
            </span>
            <select
              name="causa"
              defaultValue={ticket.root_cause ?? ''}
              required={cerrando}
              className={CAMPO}
            >
              <option value="">Todavía no se sabe</option>
              <option value="fiber_cut">Fibra cortada</option>
              <option value="dirty_connector">Conector sucio</option>
              <option value="equipment_failure">Falló el equipo</option>
              <option value="power">Se fue la luz</option>
              <option value="configuration">Mala configuración</option>
              <option value="customer_side">Cosa del cliente</option>
              <option value="false_alarm">Falsa alarma</option>
              <option value="other">Otra</option>
            </select>
          </label>
        </div>

        {cerrando && (
          <p className="rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-600">
            Para resolver hay que decir la causa. Sin eso, al tercer reporte del mismo poste nadie
            puede saber que es el mismo poste.
          </p>
        )}

        <label className="block">
          <span className="text-sm font-medium text-marino-600">Comentario</span>
          <input name="comentario" placeholder="Qué se hizo o qué se encontró" className={CAMPO} />
        </label>

        <label className="flex items-center gap-2 text-sm text-marino-600">
          <input type="checkbox" name="publico" value="si" className="rounded" />
          El cliente puede ver este comentario
        </label>

        <Boton type="submit" cargando={enviando}>
          Guardar
        </Boton>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}
