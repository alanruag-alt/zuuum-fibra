'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { guardarPlano } from '@/modulos/posteria/acciones';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { ConfigPlano, Plano } from '@/modulos/posteria/tipos';
import type { Cable } from '@/modulos/ftth/tipos';
import type { Zona } from '@/modulos/clientes/tipos';

const CAMPO =
  'mt-1 w-full rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800 focus:border-naranja-400 focus:outline-none';

function Campo({
  nombre,
  etiqueta,
  valor,
  ayuda,
  ancho = '',
}: {
  nombre: keyof ConfigPlano;
  etiqueta: string;
  valor?: string | number;
  ayuda?: string;
  ancho?: string;
}) {
  return (
    <label className={`block ${ancho}`}>
      <span className="text-sm font-medium text-marino-600">{etiqueta}</span>
      <input name={`c_${nombre}`} defaultValue={valor ?? ''} className={CAMPO} />
      {ayuda && <span className="mt-1 block text-xs text-marino-400">{ayuda}</span>}
    </label>
  );
}

export function EditorPlano({
  zonas,
  cables,
  planos,
  porDefecto,
}: {
  zonas: Zona[];
  cables: Cable[];
  planos: Plano[];
  porDefecto: ConfigPlano;
}) {
  const [cual, setCual] = useState<string>(planos[0]?.id ?? '');
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(guardarPlano, null);

  const actual = planos.find((p) => p.id === cual);
  const c: ConfigPlano = { ...porDefecto, ...(actual?.config ?? {}) };

  return (
    <Tarjeta
      titulo={actual ? `Editar «${actual.name}»` : 'Nueva hoja'}
      acciones={
        planos.length > 0 ? (
          <select
            value={cual}
            onChange={(e) => setCual(e.target.value)}
            className="rounded-lg border border-marino-200 px-3 py-2 text-sm text-marino-800"
          >
            <option value="">— hoja nueva —</option>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {estado && (
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            estado.ok ? 'bg-green-50 text-exito' : 'bg-red-50 text-falla'
          }`}
        >
          {estado.mensaje}
        </p>
      )}

      <form action={accion} className="space-y-5" key={cual}>
        {actual && <input type="hidden" name="id" value={actual.id} />}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Nombre de la hoja</span>
            <input
              name="nombre"
              required={!actual}
              defaultValue={actual?.name ?? ''}
              placeholder="Cuencamé centro · hoja 1"
              className={CAMPO}
            />
            <span className="mt-1 block text-xs text-marino-400">Para encontrarla después.</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Zona</span>
            <select name="zona" defaultValue={actual?.zone_id ?? ''} className={CAMPO}>
              <option value="">—</option>
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Qué cable dibuja</span>
            <select name="c_cable_id" defaultValue={c.cable_id ?? ''} className={CAMPO}>
              <option value="">Todos</option>
              {cables.map((cb) => (
                <option key={cb.id} value={cb.id}>
                  {cb.code}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-marino-400">
            Quién solicita
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo nombre="concesionario" etiqueta="Concesionario" valor={c.concesionario} />
            <Campo nombre="direccion" etiqueta="Domicilio" valor={c.direccion} />
            <Campo nombre="telefono" etiqueta="Teléfono" valor={c.telefono} />
            <Campo nombre="email" etiqueta="Correo" valor={c.email} />
            <Campo nombre="representante" etiqueta="Representante legal" valor={c.representante} />
            <Campo nombre="id_proyecto" etiqueta="Id del proyecto" valor={c.id_proyecto} />
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-marino-400">
            El proyecto
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo nombre="proyecto" etiqueta="Nombre del proyecto" valor={c.proyecto} />
            <Campo nombre="tipo_fibra" etiqueta="Tipo de fibra" valor={c.tipo_fibra} />
            <Campo nombre="tipo_solicitud" etiqueta="Tipo de solicitud" valor={c.tipo_solicitud} />
            <Campo
              nombre="ubicacion"
              etiqueta="Ubicación"
              valor={c.ubicacion}
              ayuda="Localidad, municipio y estado."
            />
            <Campo nombre="dependencia" etiqueta="Dependencia" valor={c.dependencia} />
            <Campo nombre="emision" etiqueta="Fecha de emisión" valor={c.emision} />
            <Campo nombre="acotacion" etiqueta="Acotación" valor={c.acotacion} />
            <Campo nombre="dibujo" etiqueta="Dibujó" valor={c.dibujo} />
            <Campo nombre="autoriza" etiqueta="Autoriza" valor={c.autoriza} />
            <Campo
              nombre="postes_nuevos"
              etiqueta="Postes nuevos"
              valor={c.postes_nuevos}
              ayuda="Se llena solo con los marcados «por plantar» si lo dejas vacío."
            />
            <Campo nombre="plano_num" etiqueta="Plano número" valor={c.plano_num} />
            <Campo nombre="plano_total" etiqueta="De un total de" valor={c.plano_total} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Tamaño de hoja</span>
            <select name="c_hoja" defaultValue={c.hoja ?? 'carta'} className={CAMPO}>
              <option value="carta">Carta horizontal (11 × 8.5 in)</option>
              <option value="tabloide">Tabloide horizontal (17 × 11 in)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-marino-600">Notas al pie</span>
            <textarea name="c_notas" defaultValue={c.notas ?? ''} rows={4} className={CAMPO} />
          </label>
        </div>

        <Boton type="submit" cargando={enviando}>
          {actual ? 'Guardar cambios' : 'Crear la hoja'}
        </Boton>
      </form>
    </Tarjeta>
  );
}
