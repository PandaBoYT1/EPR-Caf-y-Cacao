import { useState } from 'react';
import { call } from '../lib/api';
import { useSession } from '../state/session';
import type { Usuario } from '@shared/types';
import { Alerta } from '../components/ui';

export default function Login() {
  const { setUsuario } = useSession();
  const [usuario, setU] = useState('admin');
  const [password, setP] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const u = await call<Usuario>('auth:login', { usuario, password });
      setUsuario(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cafe-dark p-4">
      <form onSubmit={entrar} className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">☕🍫</div>
          <h1 className="text-2xl font-bold text-gray-800">Acopio Café y Cacao</h1>
          <p className="text-gray-500">Inicia sesión para continuar</p>
        </div>

        <label className="label">Usuario</label>
        <input className="field mb-4" value={usuario} onChange={(e) => setU(e.target.value)} autoFocus />

        <label className="label">Contraseña</label>
        <input className="field mb-6" type="password" value={password} onChange={(e) => setP(e.target.value)} />

        {error && (
          <div className="mb-4">
            <Alerta tipo="error">{error}</Alerta>
          </div>
        )}

        <button className="btn-primary w-full text-lg py-4" disabled={cargando}>
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-6">
          Acceso inicial: usuario <b>admin</b> · contraseña <b>admin123</b>
          <br />
          (cámbiala en Configuración)
        </p>
      </form>
    </div>
  );
}
