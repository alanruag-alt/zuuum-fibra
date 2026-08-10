'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { crearClienteNavegador } from '@/lib/supabase/cliente';
import { haySupabase, motivoSinSupabase } from '@/lib/supabase/configurado';

const CAMPO =
  'w-full rounded-lg border border-marino-200 px-3 py-2.5 text-sm text-marino-800 placeholder:text-marino-300 focus:border-naranja-400';

/**
 * Por qué no entró.
 *
 * Cuando de verdad fue el usuario o la contraseña, no se dice cuál de los dos:
 * eso le serviría a quien esté probando cuentas ajenas.
 *
 * Pero todo lo demás SÍ se dice con nombre y apellido. Antes cualquier fallo
 * salía como «contraseña incorrecta», y eso deja al usuario intentando otra
 * vez con la contraseña correcta, sin manera de saber que el problema era que
 * su correo no estaba confirmado o que ya había demasiados intentos. Un
 * mensaje que no distingue no protege nada; solo hace el problema imposible
 * de arreglar.
 */
function traducirFallo(mensaje: string, estado?: number): string {
  const m = (mensaje || '').toLowerCase();

  if (m.includes('email not confirmed') || m.includes('not confirmed')) {
    return (
      'La cuenta existe, pero el correo no está confirmado. Entra a Supabase → ' +
      'Authentication → Users, abre tu usuario y confírmalo. La contraseña está bien.'
    );
  }
  if (m.includes('rate limit') || m.includes('too many') || estado === 429) {
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.';
  }
  if (m.includes('user is banned') || m.includes('banned')) {
    return 'Esa cuenta está bloqueada en Supabase.';
  }
  if (m.includes('signups not allowed') || m.includes('disabled')) {
    return 'El inicio de sesión con contraseña está apagado en Supabase.';
  }
  if (m.includes('failed to fetch') || m.includes('network') || estado === 0) {
    return 'No se pudo llegar a Supabase. Revisa tu conexión a internet.';
  }
  if (m.includes('invalid api key') || m.includes('api key')) {
    return 'La llave de Supabase en .env.local no es válida para este proyecto.';
  }
  return 'Correo o contraseña incorrectos.';
}

export function FormaEntrar() {
  const router = useRouter();
  const parametros = useSearchParams();
  const regresar = parametros.get('regresar') ?? '/tablero';

  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configurado = haySupabase();

  async function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const supabase = crearClienteNavegador();
      const { error: fallo } = await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: clave,
      });

      if (fallo) {
        setError(traducirFallo(fallo.message, fallo.status));
        return;
      }

      router.push(regresar);
      router.refresh();
    } catch {
      setError('No se pudo conectar. Revisa tu conexión e inténtalo otra vez.');
    } finally {
      setCargando(false);
    }
  }

  if (!configurado) {
    const motivo = motivoSinSupabase();

    return (
      <div className="space-y-4 text-center">
        <p className="text-3xl">🔌</p>
        <p className="text-sm font-medium text-marino-800">Todavía no hay base de datos</p>
        <p className="text-sm text-marino-400">
          El proyecto de Supabase no está configurado, así que aún no hay cuentas contra las cuales
          entrar. Mientras tanto puedes recorrer el panel en modo demostración.
        </p>
        {motivo && (
          <p className="rounded-lg bg-marino-50 px-3 py-2 text-left text-xs text-marino-600">
            <strong>Qué falta:</strong> {motivo}
          </p>
        )}
        <Link
          href="/tablero"
          className="inline-block rounded-lg bg-naranja-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-naranja-600"
        >
          Ver el panel
        </Link>
        <p className="pt-2 text-xs text-marino-300">
          Para activarlo: copia <code>.env.example</code> como <code>.env.local</code> y pon los
          datos de tu proyecto de Supabase.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={alEnviar} className="space-y-4">
      <div>
        <label htmlFor="correo" className="mb-1 block text-sm font-medium text-marino-700">
          Correo
        </label>
        <input
          id="correo"
          type="email"
          required
          autoComplete="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className={CAMPO}
          placeholder="nombre@panelzuuumfibra.com"
        />
      </div>

      <div>
        <label htmlFor="clave" className="mb-1 block text-sm font-medium text-marino-700">
          Contraseña
        </label>
        <input
          id="clave"
          type="password"
          required
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className={CAMPO}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-falla">
          {error}
        </p>
      )}

      <Boton type="submit" cargando={cargando} className="w-full">
        {cargando ? 'Entrando…' : 'Entrar'}
      </Boton>
    </form>
  );
}
