'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Boton } from '@/componentes/ui/Boton';
import { crearClienteNavegador } from '@/lib/supabase/cliente';
import { haySupabase } from '@/lib/supabase/configurado';

const CAMPO =
  'w-full rounded-lg border border-marino-200 px-3 py-2.5 text-sm text-marino-800 placeholder:text-marino-300 focus:border-naranja-400';

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
        // No se dice si falló el correo o la contraseña: eso ayudaría a quien
        // esté probando cuentas ajenas.
        setError('Correo o contraseña incorrectos.');
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
    return (
      <div className="space-y-4 text-center">
        <p className="text-3xl">🔌</p>
        <p className="text-sm font-medium text-marino-800">Todavía no hay base de datos</p>
        <p className="text-sm text-marino-400">
          El proyecto de Supabase no está configurado, así que aún no hay cuentas contra las cuales
          entrar. Mientras tanto puedes recorrer el panel en modo demostración.
        </p>
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
