import type { Db } from '../db/db';
import type { Usuario, Rol } from '../../shared/types';
import { hashPassword, verifyPassword } from '../security';

export function login(db: Db, usuario: string, password: string): Usuario {
  const row = db.get<Usuario & { hash: string; salt: string }>(
    'SELECT * FROM usuarios WHERE usuario = ? AND activo = 1',
    [usuario.trim().toLowerCase()],
  );
  if (!row || !verifyPassword(password, row.hash, row.salt)) {
    throw new Error('Usuario o contraseña incorrectos.');
  }
  return { id: row.id, nombre: row.nombre, usuario: row.usuario, rol: row.rol, activo: row.activo };
}

export function listarUsuarios(db: Db): Usuario[] {
  return db.all<Usuario>('SELECT id, nombre, usuario, rol, activo FROM usuarios ORDER BY nombre');
}

export function crearUsuario(
  db: Db,
  p: { nombre: string; usuario: string; password: string; rol: Rol },
): { id: number } {
  return db.transaction(() => {
    const u = p.usuario.trim().toLowerCase();
    if (db.get('SELECT id FROM usuarios WHERE usuario = ?', [u])) {
      throw new Error('Ya existe un usuario con ese nombre de acceso.');
    }
    const { hash, salt } = hashPassword(p.password);
    const id = db.run(
      'INSERT INTO usuarios (nombre, usuario, hash, salt, rol, activo, creado_en) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [p.nombre.trim(), u, hash, salt, p.rol, new Date().toISOString()],
    ).lastId;
    return { id };
  });
}

export function cambiarPassword(db: Db, usuario_id: number, password: string): void {
  db.transaction(() => {
    const { hash, salt } = hashPassword(password);
    db.run('UPDATE usuarios SET hash = ?, salt = ? WHERE id = ?', [hash, salt, usuario_id]);
  });
}

export function activarUsuario(db: Db, usuario_id: number, activo: boolean): void {
  db.transaction(() => {
    db.run('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, usuario_id]);
  });
}
