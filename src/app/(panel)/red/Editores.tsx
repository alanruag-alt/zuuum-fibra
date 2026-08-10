'use client';

import { useActionState, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { Tarjeta } from '@/componentes/ui/Tarjeta';
import { guardarDispositivo, guardarElemento, guardarSitio } from '@/modulos/red/acciones';
import { TIPO_DISPOSITIVO, TIPO_ELEMENTO, TIPO_SITIO } from '@/modulos/red/etiquetas';
import type { Respuesta } from '@/modulos/admin/acciones';
import type { Dispositivo, ElementoRed, Sitio } from '@/modulos/red/tipos';
import type { Zona } from '@/modulos/clientes/tipos';

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

function Coordenadas({ lat, lon }: { lat?: number | null; lon?: number | null }) {
  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-marino-600">Latitud</span>
        <input
          name="lat"
          type="number"
          step="0.0000001"
          defaultValue={lat ?? ''}
          placeholder="24.8720"
          className={CAMPO}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-marino-600">Longitud</span>
        <input
          name="lon"
          type="number"
          step="0.0000001"
          defaultValue={lon ?? ''}
          placeholder="-103.6980"
          className={CAMPO}
        />
        <span className="mt-1 block text-xs text-marino-400">
          Cópialas del GPS del celular. Sin ellas no sale en el mapa.
        </span>
      </label>
    </>
  );
}

// ───────────────────────────────────────────────────────────── elementos FTTH
export function EditarElemento({
  zonas,
  elemento,
  padres,
}: {
  zonas: Zona[];
  elemento?: ElementoRed;
  padres: ElementoRed[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarElemento,
    null,
  );

  if (!abierto) {
    return elemento ? (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        editar
      </Boton>
    ) : (
      <Boton onClick={() => setAbierto(true)}>Dar de alta una NAP</Boton>
    );
  }

  return (
    <Tarjeta
      titulo={elemento ? `Editar ${elemento.code}` : 'Nuevo elemento de red'}
      className="w-full"
    >
      <Aviso estado={estado} />
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          {elemento && <input type="hidden" name="id" value={elemento.id} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Código</span>
              <input
                name="codigo"
                required
                defaultValue={elemento?.code}
                placeholder="NAP-CUE-012"
                className={`${CAMPO} font-mono`}
                autoFocus
              />
              <span className="mt-1 block text-xs text-marino-400">
                Es el que va rotulado en la caja, en el poste.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Qué es</span>
              <select name="tipo" defaultValue={elemento?.element_type ?? 'nap'} className={CAMPO}>
                {Object.entries(TIPO_ELEMENTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Zona</span>
              <select name="zona" defaultValue={elemento?.zone_id ?? ''} className={CAMPO}>
                <option value="">—</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Nombre o referencia</span>
              <input
                name="nombre"
                defaultValue={elemento?.name ?? ''}
                placeholder="Poste frente a la primaria"
                className={CAMPO}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Cuántos puertos</span>
              <input
                name="capacidad"
                type="number"
                min="1"
                defaultValue={elemento?.capacity ?? ''}
                placeholder="8"
                className={CAMPO}
              />
              <span className="mt-1 block text-xs text-marino-400">
                Sin capacidad, el sistema no puede avisar cuándo se va a llenar.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Cuelga de</span>
              <select
                name="padre"
                defaultValue={elemento?.parent_element_id ?? ''}
                className={CAMPO}
              >
                <option value="">Nada</option>
                {padres
                  .filter((p) => p.id !== elemento?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
              </select>
            </label>
            <Coordenadas lat={elemento?.latitude} lon={elemento?.longitude} />
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-sm font-medium text-marino-600">Notas</span>
              <input name="notas" defaultValue={elemento?.notes ?? ''} className={CAMPO} />
            </label>
          </div>

          {elemento && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="activo"
                value="no"
                defaultChecked={!elemento.is_active}
              />
              <span className="text-sm text-marino-600">Ya no está en servicio</span>
            </label>
          )}

          <div className="flex gap-2">
            <Boton type="submit" cargando={enviando}>
              Guardar
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

// ────────────────────────────────────────────────────────────────────── sitios
export function EditarSitio({ zonas, sitio }: { zonas: Zona[]; sitio?: Sitio }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(guardarSitio, null);

  if (!abierto) {
    return sitio ? (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        editar
      </Boton>
    ) : (
      <Boton onClick={() => setAbierto(true)}>Dar de alta un sitio</Boton>
    );
  }

  return (
    <Tarjeta titulo={sitio ? `Editar ${sitio.name}` : 'Nuevo sitio'} className="w-full">
      <Aviso estado={estado} />
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          {sitio && <input type="hidden" name="id" value={sitio.id} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Nombre</span>
              <input
                name="nombre"
                required
                defaultValue={sitio?.name}
                placeholder="Cerro de Velardeña"
                className={CAMPO}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Qué es</span>
              <select name="tipo" defaultValue={sitio?.type ?? 'tower'} className={CAMPO}>
                {Object.entries(TIPO_SITIO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Zona</span>
              <select name="zona" defaultValue={sitio?.zone_id ?? ''} className={CAMPO}>
                <option value="">—</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <Coordenadas lat={sitio?.latitude} lon={sitio?.longitude} />
          </div>

          {sitio && (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="activo" value="no" defaultChecked={!sitio.is_active} />
              <span className="text-sm text-marino-600">Ya no se usa</span>
            </label>
          )}

          <div className="flex gap-2">
            <Boton type="submit" cargando={enviando}>
              Guardar
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

// ───────────────────────────────────────────────────────────────── dispositivos
export function EditarDispositivo({
  zonas,
  sitios,
  dispositivo,
  tipoPorDefecto = 'olt',
}: {
  zonas: Zona[];
  sitios: Sitio[];
  dispositivo?: Dispositivo;
  tipoPorDefecto?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState<Respuesta | null, FormData>(
    guardarDispositivo,
    null,
  );

  if (!abierto) {
    return dispositivo ? (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        editar
      </Boton>
    ) : (
      <Boton onClick={() => setAbierto(true)}>Dar de alta un equipo</Boton>
    );
  }

  return (
    <Tarjeta
      titulo={dispositivo ? `Editar ${dispositivo.name}` : 'Nuevo equipo de red'}
      className="w-full"
    >
      <Aviso estado={estado} />
      {!estado?.ok && (
        <form action={accion} className="mt-3 space-y-4">
          {dispositivo && <input type="hidden" name="id" value={dispositivo.id} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-marino-600">Nombre</span>
              <input
                name="nombre"
                required
                defaultValue={dispositivo?.name}
                placeholder="OLT Cuencamé"
                className={CAMPO}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Qué es</span>
              <select
                name="tipo"
                defaultValue={dispositivo?.device_type ?? tipoPorDefecto}
                className={CAMPO}
              >
                {Object.entries(TIPO_DISPOSITIVO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Sitio</span>
              <select name="sitio" defaultValue={''} className={CAMPO}>
                <option value="">—</option>
                {sitios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Zona</span>
              <select name="zona" defaultValue={dispositivo?.zone_id ?? ''} className={CAMPO}>
                <option value="">—</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">IP de administración</span>
              <input
                name="ip"
                defaultValue={dispositivo?.mgmt_ip ?? ''}
                placeholder="10.10.0.2"
                className={`${CAMPO} font-mono`}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Marca</span>
              <input name="marca" defaultValue={dispositivo?.vendor ?? ''} className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-marino-600">Modelo</span>
              <input name="modelo" defaultValue={dispositivo?.model ?? ''} className={CAMPO} />
            </label>
          </div>

          <p className="rounded-lg bg-marino-50 px-3 py-2 text-xs text-marino-500">
            Aquí <strong>no</strong> se guardan usuarios ni contraseñas de las OLT ni de los
            MikroTik. El sistema solo sabe que el equipo existe y en qué IP vive; las claves las lee
            el agente local de sus propias variables de entorno.
          </p>

          {dispositivo && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="activo"
                value="no"
                defaultChecked={!dispositivo.is_active}
              />
              <span className="text-sm text-marino-600">Ya no está en servicio</span>
            </label>
          )}

          <div className="flex gap-2">
            <Boton type="submit" cargando={enviando}>
              Guardar
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
