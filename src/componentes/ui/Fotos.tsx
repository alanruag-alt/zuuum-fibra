'use client';

import { useEffect, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/Boton';
import { crearClienteNavegador } from '@/lib/supabase/cliente';
import { borrarFoto, registrarFoto } from '@/modulos/red/acciones_fotos';

interface Foto {
  id: string;
  ruta: string;
  descripcion: string | null;
  url: string;
}

/**
 * Las fotos de campo de un elemento.
 *
 * El archivo sube directo del navegador al Storage y nunca pasa por el
 * servidor de la aplicación: una foto de celular pesa varios megas y hacerla
 * viajar dos veces solo sirve para que el técnico crea que se trabó.
 *
 * En la base queda la ruta, no la imagen. Y para verla se pide una liga
 * firmada, que caduca: el bucket es privado porque estas fotos enseñan dónde
 * está el equipo y cómo se llega.
 */
export function Fotos({
  tabla,
  registro,
  nombre,
  puedeEditar = true,
}: {
  tabla: string;
  registro: string;
  nombre: string;
  puedeEditar?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;

    (async () => {
      const supabase = crearClienteNavegador();
      const { data } = await supabase
        .from('network_photos')
        .select('id, ruta, descripcion')
        .eq('tabla', tabla)
        .eq('registro_id', registro)
        .order('created_at', { ascending: false });

      const filas = (data ?? []) as { id: string; ruta: string; descripcion: string | null }[];
      const conUrl: Foto[] = [];
      for (const f of filas) {
        const { data: firma } = await supabase.storage.from('red').createSignedUrl(f.ruta, 3600);
        conUrl.push({ ...f, url: firma?.signedUrl ?? '' });
      }
      if (vivo) setFotos(conUrl);
    })();

    return () => {
      vivo = false;
    };
  }, [abierto, tabla, registro, recado]);

  async function subir(f: File) {
    setCargando(true);
    setRecado(null);
    try {
      const supabase = crearClienteNavegador();
      // La ruta lleva la fecha para que dos fotos del mismo día no se pisen y
      // para poder ordenarlas de un vistazo en el bucket.
      const limpio = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '-').slice(-60);
      const ruta = `${tabla}/${registro}/${Date.now()}-${limpio}`;

      const { error } = await supabase.storage.from('red').upload(ruta, f, { upsert: false });
      if (error) throw new Error(error.message);

      const r = await registrarFoto(tabla, registro, ruta, f.size);
      setRecado(r.mensaje);
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'No se pudo subir.');
    } finally {
      setCargando(false);
      if (archivo.current) archivo.current.value = '';
    }
  }

  if (!abierto) {
    return (
      <Boton variante="texto" onClick={() => setAbierto(true)} className="px-2 py-1 text-xs">
        📷 fotos
      </Boton>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-marino-100 bg-marino-50/40 p-3">
      <p className="mb-2 text-xs font-medium text-marino-700">Fotos de {nombre}</p>

      {fotos.length === 0 ? (
        <p className="text-xs text-marino-400">Todavía no hay fotos de este punto.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {fotos.map((f) => (
            <div key={f.id} className="relative">
              <a href={f.url} target="_blank" rel="noreferrer">
                {/* Se usa <img> a propósito: la liga del Storage viene firmada
                    y caduca, así que el optimizador de Next no la puede
                    cachear ni servir por su cuenta. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={f.descripcion ?? 'foto de campo'}
                  className="h-24 w-32 rounded-md border border-marino-200 object-cover"
                />
              </a>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await borrarFoto(f.id);
                    setRecado(r.mensaje);
                  }}
                  className="absolute right-1 top-1 rounded bg-white/90 px-1 text-xs text-falla shadow"
                  aria-label="Borrar foto"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {puedeEditar && (
        <div className="mt-3">
          <input
            ref={archivo}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={cargando}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
            }}
            className="w-full text-xs text-marino-600 file:mr-3 file:rounded-md file:border-0 file:bg-marino-100 file:px-3 file:py-1.5 file:text-xs file:text-marino-700"
          />
          <p className="mt-1 text-xs text-marino-400">
            Desde el celular abre la cámara directo. Hasta 10 MB por foto.
          </p>
        </div>
      )}

      {recado && <p className="mt-2 text-xs text-marino-600">{recado}</p>}

      <Boton variante="texto" onClick={() => setAbierto(false)} className="mt-2 px-2 py-1 text-xs">
        cerrar
      </Boton>
    </div>
  );
}
