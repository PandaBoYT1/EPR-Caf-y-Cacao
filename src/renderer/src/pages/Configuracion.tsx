import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import type { Usuario, Rol } from '@shared/types';
import { PageHeader, Field, Modal, Alerta, Select, Vacio } from '../components/ui';
import { useSession } from '../state/session';

export default function Configuracion() {
  const { usuario } = useSession();
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [msg, setMsg] = useState('');
  const [modalUser, setModalUser] = useState(false);
  const [pass, setPass] = useState<Usuario | null>(null);

  function cargar() {
    call<Record<string, string>>('config:get').then(setCfg);
    call<Usuario[]>('usuarios:listar').then(setUsuarios);
  }
  useEffect(cargar, []);

  async function guardarCfg(clave: string, valor: string) {
    setCfg((c) => ({ ...c, [clave]: valor }));
    await call('config:set', { clave, valor });
    setMsg('✅ Configuración guardada.');
  }

  async function elegirCarpeta() {
    const res = await call<{ canceled: boolean; path?: string }>('backup:elegirCarpeta');
    if (!res.canceled && res.path) {
      setCfg((c) => ({ ...c, carpeta_respaldo: res.path! }));
      setMsg('✅ Carpeta de respaldo configurada.');
    }
  }

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Ajustes del negocio y usuarios." />

      {msg && (
        <div className="mb-4">
          <Alerta tipo="ok">{msg}</Alerta>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-bold text-gray-700 mb-4">Rendimiento del café</h2>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Muestra (g)">
              <input className="field" type="number" value={cfg.muestra_defecto_g ?? '250'} onChange={(e) => guardarCfg('muestra_defecto_g', e.target.value)} />
            </Field>
            <Field label="Merma mín. %">
              <input className="field" type="number" value={cfg.merma_min ?? '18'} onChange={(e) => guardarCfg('merma_min', e.target.value)} />
            </Field>
            <Field label="Merma máx. %">
              <input className="field" type="number" value={cfg.merma_max ?? '20'} onChange={(e) => guardarCfg('merma_max', e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-gray-400">Rango de referencia para advertir (no bloquea la operación).</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-gray-700 mb-4">Inventario</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-5 h-5"
              checked={cfg.permitir_stock_negativo === '1'}
              onChange={(e) => guardarCfg('permitir_stock_negativo', e.target.checked ? '1' : '0')}
            />
            <span>Permitir stock negativo (opción avanzada)</span>
          </label>
          <p className="text-xs text-gray-400 mt-2">Normalmente desactivado: no se puede vender más de lo que hay.</p>
        </div>

        <div className="card md:col-span-2">
          <h2 className="text-lg font-bold text-gray-700 mb-2">Respaldo (Google Drive)</h2>
          <p className="text-sm text-gray-500 mb-3">
            Elige una carpeta de respaldo. Si eliges tu carpeta de <b>Google Drive para escritorio</b>, los respaldos se
            sincronizan solos a la nube. Genera un respaldo desde <b>Reportes → Respaldar ahora</b>.
          </p>
          <div className="flex items-center gap-3">
            <input className="field flex-1" readOnly value={cfg.carpeta_respaldo || 'Sin configurar'} />
            <button className="btn-neutral" onClick={elegirCarpeta}>
              📁 Elegir carpeta
            </button>
          </div>
        </div>

        <div className="card md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-700">Usuarios</h2>
            <button className="btn-primary" onClick={() => setModalUser(true)}>
              ➕ Nuevo usuario
            </button>
          </div>
          {usuarios.length === 0 ? (
            <Vacio>Sin usuarios.</Vacio>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-left">
                <tr>
                  <th className="py-2">Nombre</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="py-2 font-medium">{u.nombre}</td>
                    <td>{u.usuario}</td>
                    <td>{u.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Trabajador'}</td>
                    <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="text-sky-600 hover:underline mr-4" onClick={() => setPass(u)}>
                        Contraseña
                      </button>
                      {u.id !== usuario?.id && (
                        <button
                          className="text-gray-600 hover:underline"
                          onClick={async () => {
                            await call('usuarios:activar', { usuario_id: u.id, activo: !u.activo });
                            cargar();
                          }}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalUser && <ModalUsuario onClose={() => setModalUser(false)} onCreado={() => { setModalUser(false); cargar(); }} />}
      {pass && <ModalPassword usuario={pass} onClose={() => setPass(null)} onHecho={() => { setPass(null); setMsg('✅ Contraseña actualizada.'); }} />}
    </div>
  );
}

function ModalUsuario({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>('TRABAJADOR');
  const [error, setError] = useState('');

  async function crear() {
    if (!nombre.trim() || !usuario.trim() || !password) return setError('Completa todos los campos.');
    try {
      await call('usuarios:crear', { nombre, usuario, password, rol });
      onCreado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Modal open title="Nuevo usuario" onClose={onClose}>
      <Field label="Nombre completo">
        <input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </Field>
      <Field label="Usuario (para iniciar sesión)">
        <input className="field" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
      </Field>
      <Field label="Contraseña">
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Rol">
        <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
          <option value="TRABAJADOR">Trabajador</option>
          <option value="ADMINISTRADOR">Administrador</option>
        </Select>
      </Field>
      {error && <Alerta tipo="error">{error}</Alerta>}
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-neutral" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={crear}>
          Crear usuario
        </button>
      </div>
    </Modal>
  );
}

function ModalPassword({ usuario, onClose, onHecho }: { usuario: Usuario; onClose: () => void; onHecho: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function guardar() {
    if (password.length < 4) return setError('La contraseña debe tener al menos 4 caracteres.');
    try {
      await call('usuarios:password', { usuario_id: usuario.id, password });
      onHecho();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Modal open title={`Contraseña de ${usuario.nombre}`} onClose={onClose}>
      <Field label="Nueva contraseña">
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      {error && <Alerta tipo="error">{error}</Alerta>}
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-neutral" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={guardar}>
          Guardar contraseña
        </button>
      </div>
    </Modal>
  );
}
