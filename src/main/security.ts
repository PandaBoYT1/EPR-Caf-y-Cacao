import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Genera hash de contraseña con scrypt (módulo nativo de Node, sin dependencias). */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

/** Verifica una contraseña contra el hash almacenado, en tiempo constante. */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const test = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (stored.length !== test.length) return false;
  return timingSafeEqual(stored, test);
}
