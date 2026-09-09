import type { Db } from '../db/db';
import type { InventarioBucket } from '../../shared/types';

export interface DatosMovimiento {
  fecha: string;
  producto_id: number;
  estado_id: number | null;
  tipo: 'entrada' | 'salida';
  gramos: number;
  ref_tipo: string;
  ref_id: number;
}

/** Stock actual (gramos) de un producto/estado, calculado desde los movimientos. */
export function stockDe(db: Db, producto_id: number, estado_id: number | null): number {
  const row = db.get<{ g: number }>(
    `SELECT COALESCE(SUM(CASE tipo WHEN 'entrada' THEN gramos ELSE -gramos END), 0) AS g
     FROM movimientos_inventario WHERE producto_id = ? AND estado_id IS ?`,
    [producto_id, estado_id],
  );
  return row?.g ?? 0;
}

/** Registra un movimiento de inventario y guarda el saldo resultante. */
export function registrarMovimiento(db: Db, m: DatosMovimiento): void {
  const prev = stockDe(db, m.producto_id, m.estado_id);
  const saldo = m.tipo === 'entrada' ? prev + m.gramos : prev - m.gramos;
  db.run(
    `INSERT INTO movimientos_inventario
       (fecha, producto_id, estado_id, tipo, gramos, saldo_g, ref_tipo, ref_id, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.fecha, m.producto_id, m.estado_id, m.tipo, m.gramos, saldo, m.ref_tipo, m.ref_id, new Date().toISOString()],
  );
}

/** Inventario completo: un renglón por cada bucket (café por estado + cacao). */
export function getInventario(db: Db): InventarioBucket[] {
  const sums = db.all<{ producto_id: number; estado_id: number | null; gramos: number }>(
    `SELECT producto_id, estado_id,
        SUM(CASE tipo WHEN 'entrada' THEN gramos ELSE -gramos END) AS gramos
     FROM movimientos_inventario GROUP BY producto_id, estado_id`,
  );
  const map = new Map<string, number>();
  for (const s of sums) map.set(`${s.producto_id}:${s.estado_id ?? 'null'}`, s.gramos);

  const productos = db.all<{ id: number; nombre: string; permite_estados: number }>(
    'SELECT id, nombre, permite_estados FROM productos WHERE activo = 1 ORDER BY id',
  );
  const buckets: InventarioBucket[] = [];
  for (const p of productos) {
    if (p.permite_estados) {
      const estados = db.all<{ id: number; nombre: string }>(
        'SELECT id, nombre FROM estados_producto WHERE producto_id = ? ORDER BY orden',
        [p.id],
      );
      for (const e of estados) {
        buckets.push({
          producto_id: p.id,
          producto_nombre: p.nombre,
          estado_id: e.id,
          estado_nombre: e.nombre,
          gramos: map.get(`${p.id}:${e.id}`) ?? 0,
        });
      }
    } else {
      buckets.push({
        producto_id: p.id,
        producto_nombre: p.nombre,
        estado_id: null,
        estado_nombre: null,
        gramos: map.get(`${p.id}:null`) ?? 0,
      });
    }
  }
  return buckets;
}
