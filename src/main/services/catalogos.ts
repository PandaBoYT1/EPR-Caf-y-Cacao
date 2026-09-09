import type { Db } from '../db/db';
import type { Producto, EstadoProducto } from '../../shared/types';

export function listarProductos(db: Db): Producto[] {
  return db.all<Producto>('SELECT * FROM productos WHERE activo = 1 ORDER BY id');
}

export function listarEstados(db: Db, producto_id: number): EstadoProducto[] {
  return db.all<EstadoProducto>(
    'SELECT * FROM estados_producto WHERE producto_id = ? ORDER BY orden',
    [producto_id],
  );
}

export function getConfig(db: Db): Record<string, string> {
  const rows = db.all<{ clave: string; valor: string }>('SELECT clave, valor FROM configuraciones');
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.clave] = r.valor;
  return cfg;
}

export function setConfig(db: Db, clave: string, valor: string): void {
  db.transaction(() => {
    const exists = db.get('SELECT clave FROM configuraciones WHERE clave = ?', [clave]);
    if (exists) db.run('UPDATE configuraciones SET valor = ? WHERE clave = ?', [valor, clave]);
    else db.run('INSERT INTO configuraciones (clave, valor) VALUES (?, ?)', [clave, valor]);
  });
}

/** Rango de referencia de merma configurado. */
export function mermaOpts(db: Db): { mermaRefMin: number; mermaRefMax: number } {
  const cfg = getConfig(db);
  return {
    mermaRefMin: Number(cfg.merma_min ?? 18),
    mermaRefMax: Number(cfg.merma_max ?? 20),
  };
}

export function permitirStockNegativo(db: Db): boolean {
  return getConfig(db).permitir_stock_negativo === '1';
}
