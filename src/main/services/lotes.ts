import type { Db } from '../db/db';
import type { NuevoLote, Lote } from '../../shared/types';
import { formatearCodigo } from '../../shared/domain/codes';

function prefijoLote(db: Db, producto_id: number): string {
  const p = db.get<{ codigo: string }>('SELECT codigo FROM productos WHERE id = ?', [producto_id]);
  return p?.codigo === 'CACAO' ? 'CAC' : 'CAF';
}

/** Lote abierto (que se puede seguir llenando) para un producto + estado. */
export function loteAbiertoDe(db: Db, producto_id: number, estado_id: number | null): Lote | undefined {
  return db.get<Lote>(
    `SELECT l.*, p.nombre AS producto_nombre, e.nombre AS estado_nombre
     FROM lotes l
     JOIN productos p ON p.id = l.producto_id
     LEFT JOIN estados_producto e ON e.id = l.estado_id
     WHERE l.producto_id = ? AND l.estado_id IS ? AND l.estado_lote IN ('DISPONIBLE','PARCIAL')
     ORDER BY l.id ASC LIMIT 1`,
    [producto_id, estado_id],
  );
}

function sumarGramosEntradas(db: Db, entradas: number[]): number {
  if (!entradas.length) return 0;
  const placeholders = entradas.map(() => '?').join(',');
  const row = db.get<{ g: number }>(
    `SELECT COALESCE(SUM(gramos), 0) AS g FROM detalle_compras WHERE id IN (${placeholders})`,
    entradas,
  );
  return row?.g ?? 0;
}

function asociarEntradas(db: Db, loteId: number, entradas: number[]): void {
  for (const detalleId of entradas) {
    const d = db.get<{ gramos: number }>('SELECT gramos FROM detalle_compras WHERE id = ?', [detalleId]);
    db.run('INSERT INTO lote_detalle (lote_id, detalle_compra_id, gramos) VALUES (?, ?, ?)', [
      loteId,
      detalleId,
      d?.gramos ?? 0,
    ]);
  }
}

/**
 * Crea un lote nuevo o AGREGA entradas a un lote existente.
 * Por defecto, si ya existe un lote abierto del mismo producto+estado, se agrega a él
 * (los lotes se agrupan por tipo y estado, no por proveedor).
 */
export function crearLote(db: Db, p: NuevoLote) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const gramos = sumarGramosEntradas(db, p.entradas);

    // Determinar el lote destino
    let loteId = p.lote_id ?? null;
    if (!loteId && !p.forzar_nuevo) {
      const abierto = loteAbiertoDe(db, p.producto_id, p.estado_id);
      if (abierto) loteId = abierto.id;
    }

    if (loteId) {
      asociarEntradas(db, loteId, p.entradas);
      db.run('UPDATE lotes SET gramos = gramos + ? WHERE id = ?', [gramos, loteId]);
      const l = db.get<{ codigo: string; gramos: number }>('SELECT codigo, gramos FROM lotes WHERE id = ?', [loteId]);
      return { id: loteId, codigo: l?.codigo ?? '', gramos: l?.gramos ?? 0, agregado: true };
    }

    // Crear lote nuevo
    const nuevoId = db.run(
      `INSERT INTO lotes (producto_id, estado_id, gramos, estado_lote, obs, creado_en)
       VALUES (?, ?, ?, 'DISPONIBLE', ?, ?)`,
      [p.producto_id, p.estado_id, gramos, p.obs ?? null, now],
    ).lastId;
    const codigo = formatearCodigo(prefijoLote(db, p.producto_id), nuevoId, 4);
    db.run('UPDATE lotes SET codigo = ? WHERE id = ?', [codigo, nuevoId]);
    asociarEntradas(db, nuevoId, p.entradas);
    return { id: nuevoId, codigo, gramos, agregado: false };
  });
}

/** Fusiona varios lotes abiertos del mismo producto+estado en uno solo. */
export function fusionarLotes(db: Db, destino_id: number, origen_ids: number[]) {
  return db.transaction(() => {
    const destino = db.get<Lote>('SELECT * FROM lotes WHERE id = ?', [destino_id]);
    if (!destino) throw new Error('El lote destino no existe.');
    for (const origenId of origen_ids) {
      if (origenId === destino_id) continue;
      const o = db.get<Lote>('SELECT * FROM lotes WHERE id = ?', [origenId]);
      if (!o) continue;
      if (o.producto_id !== destino.producto_id || (o.estado_id ?? null) !== (destino.estado_id ?? null)) {
        throw new Error('Solo se pueden fusionar lotes del mismo producto y estado.');
      }
      db.run('UPDATE lote_detalle SET lote_id = ? WHERE lote_id = ?', [destino_id, origenId]);
      db.run('UPDATE lotes SET gramos = gramos + ? WHERE id = ?', [o.gramos, destino_id]);
      db.run("UPDATE lotes SET gramos = 0, estado_lote = 'CERRADO' WHERE id = ?", [origenId]);
    }
    const l = db.get<{ codigo: string; gramos: number }>('SELECT codigo, gramos FROM lotes WHERE id = ?', [destino_id]);
    return { id: destino_id, codigo: l?.codigo ?? '', gramos: l?.gramos ?? 0 };
  });
}

/** Fusiona automáticamente todos los grupos de lotes abiertos duplicados. */
export function fusionarDuplicados(db: Db) {
  return db.transaction(() => {
    const grupos = db.all<{ producto_id: number; estado_id: number | null; ids: string; n: number }>(
      `SELECT producto_id, estado_id, GROUP_CONCAT(id) AS ids, COUNT(*) AS n
       FROM lotes WHERE estado_lote IN ('DISPONIBLE','PARCIAL')
       GROUP BY producto_id, estado_id HAVING n > 1`,
    );
    let fusionados = 0;
    for (const g of grupos) {
      const ids = g.ids.split(',').map(Number).sort((a, b) => a - b);
      const [destino, ...origen] = ids;
      // Reutiliza la lógica de fusión (ya estamos en transacción; hacemos las escrituras aquí).
      for (const origenId of origen) {
        const o = db.get<{ gramos: number }>('SELECT gramos FROM lotes WHERE id = ?', [origenId]);
        db.run('UPDATE lote_detalle SET lote_id = ? WHERE lote_id = ?', [destino, origenId]);
        db.run('UPDATE lotes SET gramos = gramos + ? WHERE id = ?', [o?.gramos ?? 0, destino!]);
        db.run("UPDATE lotes SET gramos = 0, estado_lote = 'CERRADO' WHERE id = ?", [origenId]);
        fusionados++;
      }
    }
    return { fusionados };
  });
}

/** Subconsulta que calcula el costo promedio de compra (céntimos/kg) de un lote. */
const COSTO_PROM_SUBQUERY = `(
  SELECT CASE WHEN COALESCE(SUM(ld.gramos), 0) > 0
              THEN CAST(ROUND(SUM(dc.total_centimos) * 1000.0 / SUM(ld.gramos)) AS INTEGER)
              ELSE 0 END
  FROM lote_detalle ld JOIN detalle_compras dc ON dc.id = ld.detalle_compra_id
  WHERE ld.lote_id = l.id
)`;

export function listarLotes(db: Db, soloDisponibles = false): Lote[] {
  const where = soloDisponibles ? "WHERE l.estado_lote IN ('DISPONIBLE','PARCIAL')" : '';
  return db.all<Lote>(
    `SELECT l.*, p.nombre AS producto_nombre, e.nombre AS estado_nombre,
            ${COSTO_PROM_SUBQUERY} AS costo_prom_centimos_kg
     FROM lotes l
     JOIN productos p ON p.id = l.producto_id
     LEFT JOIN estados_producto e ON e.id = l.estado_id
     ${where}
     ORDER BY l.id DESC`,
  );
}

export function detalleLote(db: Db, id: number) {
  const lote = db.get<Lote>(
    `SELECT l.*, p.nombre AS producto_nombre, e.nombre AS estado_nombre,
            ${COSTO_PROM_SUBQUERY} AS costo_prom_centimos_kg
     FROM lotes l JOIN productos p ON p.id = l.producto_id
     LEFT JOIN estados_producto e ON e.id = l.estado_id WHERE l.id = ?`,
    [id],
  );
  const entradas = db.all(
    `SELECT c.codigo, c.fecha, ld.gramos, pr.nombre AS proveedor_nombre,
            dc.precio_centimos_kg, dc.total_centimos
     FROM lote_detalle ld
     JOIN detalle_compras dc ON dc.id = ld.detalle_compra_id
     JOIN compras c ON c.id = dc.compra_id
     JOIN proveedores pr ON pr.id = c.proveedor_id
     WHERE ld.lote_id = ?`,
    [id],
  );
  return { lote, entradas };
}
