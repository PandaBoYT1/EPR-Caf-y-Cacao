import type { Db } from '../db/db';
import type { NuevoLote, Lote, EstadoLote } from '../../shared/types';
import { formatearCodigo } from '../../shared/domain/codes';
import { stockDe } from './inventario';

/**
 * Regla de consistencia: los lotes de un producto+estado nunca suman más que su stock.
 * Lo que está en stock pero en ningún lote es "stock suelto" (compras aún sin agrupar).
 */

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

/** Stock (gramos) de un producto+estado que no está dentro de ningún lote. */
export function stockSueltoDe(db: Db, producto_id: number, estado_id: number | null): number {
  const r = db.get<{ g: number }>(
    'SELECT COALESCE(SUM(gramos), 0) AS g FROM lotes WHERE producto_id = ? AND estado_id IS ?',
    [producto_id, estado_id],
  );
  return stockDe(db, producto_id, estado_id) - (r?.g ?? 0);
}

/**
 * Recalcula el estado de un lote según su saldo y sus entradas:
 * DISPONIBLE (intacto), PARCIAL (con ventas), VENDIDO (saldo 0) o ANULADO (sin entradas ni saldo).
 * Los lotes cerrados por fusión no cambian.
 */
export function actualizarEstadoLote(db: Db, lote_id: number): void {
  const l = db.get<{ gramos: number; estado_lote: EstadoLote }>('SELECT gramos, estado_lote FROM lotes WHERE id = ?', [lote_id]);
  if (!l || l.estado_lote === 'CERRADO') return;
  const e = db.get<{ n: number; g: number }>(
    'SELECT COUNT(*) AS n, COALESCE(SUM(gramos), 0) AS g FROM lote_detalle WHERE lote_id = ?',
    [lote_id],
  );
  let estado: EstadoLote;
  if (l.gramos <= 0) estado = (e?.n ?? 0) === 0 ? 'ANULADO' : 'VENDIDO';
  else estado = l.gramos >= (e?.g ?? 0) ? 'DISPONIBLE' : 'PARCIAL';
  db.run('UPDATE lotes SET estado_lote = ? WHERE id = ?', [estado, lote_id]);
}

/** Si el lote se cerró por fusión, devuelve el lote que ahora contiene su producto. */
function loteVigente(db: Db, lote_id: number): number {
  let id = lote_id;
  for (let i = 0; i < 100; i++) {
    const l = db.get<{ estado_lote: EstadoLote; fusionado_en: number | null; producto_id: number; estado_id: number | null }>(
      'SELECT estado_lote, fusionado_en, producto_id, estado_id FROM lotes WHERE id = ?',
      [id],
    );
    if (!l || l.estado_lote !== 'CERRADO') return id;
    if (l.fusionado_en) {
      id = l.fusionado_en;
      continue;
    }
    // Fusión anterior a la v2 (sin destino registrado): el lote abierto del mismo tipo/estado.
    return loteAbiertoDe(db, l.producto_id, l.estado_id)?.id ?? id;
  }
  return id;
}

function descontarDeLote(db: Db, detalle_venta_id: number, lote_id: number, gramos: number): void {
  if (gramos <= 0) return;
  db.run('UPDATE lotes SET gramos = gramos - ? WHERE id = ?', [gramos, lote_id]);
  db.run('INSERT INTO venta_lotes (detalle_venta_id, lote_id, gramos) VALUES (?, ?, ?)', [detalle_venta_id, lote_id, gramos]);
  actualizarEstadoLote(db, lote_id);
}

/**
 * Descuenta una venta de los lotes y registra de cuáles salió.
 * Llamar ANTES de registrar el movimiento de salida en el inventario.
 *  1. Si se eligió un lote, sale de ese lote.
 *  2. Lo que falte sale primero del stock suelto (compras sin lote).
 *  3. Si aún falta, sale de los lotes abiertos más antiguos.
 */
export function descontarVentaDeLotes(
  db: Db,
  detalle_venta_id: number,
  producto_id: number,
  estado_id: number | null,
  gramos: number,
  lote_id: number | null,
): void {
  let pendiente = gramos;
  if (lote_id) {
    const l = db.get<{ gramos: number }>('SELECT gramos FROM lotes WHERE id = ?', [lote_id]);
    const g = Math.min(pendiente, Math.max(0, l?.gramos ?? 0));
    descontarDeLote(db, detalle_venta_id, lote_id, g);
    pendiente -= g;
  }
  if (pendiente > 0) pendiente -= Math.min(pendiente, Math.max(0, stockSueltoDe(db, producto_id, estado_id)));
  if (pendiente > 0) {
    const abiertos = db.all<{ id: number; gramos: number }>(
      `SELECT id, gramos FROM lotes
       WHERE producto_id = ? AND estado_id IS ? AND estado_lote IN ('DISPONIBLE','PARCIAL') AND gramos > 0
       ORDER BY id ASC`,
      [producto_id, estado_id],
    );
    for (const l of abiertos) {
      if (pendiente <= 0) break;
      const g = Math.min(pendiente, l.gramos);
      descontarDeLote(db, detalle_venta_id, l.id, g);
      pendiente -= g;
    }
  }
}

/** Devuelve a sus lotes lo que una venta había descontado (al anular la venta). */
export function revertirVentaEnLotes(db: Db, detalle_venta_id: number): void {
  const filas = db.all<{ lote_id: number; gramos: number }>(
    'SELECT lote_id, gramos FROM venta_lotes WHERE detalle_venta_id = ?',
    [detalle_venta_id],
  );
  for (const f of filas) {
    const destino = loteVigente(db, f.lote_id);
    const l = db.get<{ estado_lote: EstadoLote }>('SELECT estado_lote FROM lotes WHERE id = ?', [destino]);
    // Un lote anulado ya no existe: el producto vuelve como stock suelto.
    if (!l || l.estado_lote === 'ANULADO' || l.estado_lote === 'CERRADO') continue;
    db.run('UPDATE lotes SET gramos = gramos + ? WHERE id = ?', [f.gramos, destino]);
    actualizarEstadoLote(db, destino);
  }
}

/**
 * Saca una entrada de compra de su lote (al anular la compra). Si el lote se queda sin
 * entradas ni saldo, queda ANULADO y desaparece de los lotes activos.
 * Devuelve false si la entrada no estaba en ningún lote.
 */
export function quitarEntradaDeLotes(db: Db, detalle_compra_id: number, permitirNegativo: boolean): boolean {
  const filas = db.all<{ id: number; lote_id: number; gramos: number; lote_gramos: number; lote_codigo: string }>(
    `SELECT ld.id, ld.lote_id, ld.gramos, l.gramos AS lote_gramos, l.codigo AS lote_codigo
     FROM lote_detalle ld JOIN lotes l ON l.id = ld.lote_id
     WHERE ld.detalle_compra_id = ?`,
    [detalle_compra_id],
  );
  for (const f of filas) {
    if (f.lote_gramos < f.gramos && !permitirNegativo) {
      throw new Error(
        `No se puede anular: parte de esta compra ya se vendió desde el lote ${f.lote_codigo}. Anule primero esa venta.`,
      );
    }
    db.run('UPDATE lotes SET gramos = gramos - ? WHERE id = ?', [Math.min(f.gramos, Math.max(0, f.lote_gramos)), f.lote_id]);
    db.run('DELETE FROM lote_detalle WHERE id = ?', [f.id]);
    actualizarEstadoLote(db, f.lote_id);
  }
  return filas.length > 0;
}

/** Quita de los lotes las entradas de compras anuladas (datos de versiones anteriores). */
export function repararLotesConComprasAnuladas(db: Db): void {
  const filas = db.all<{ detalle_compra_id: number }>(
    `SELECT DISTINCT ld.detalle_compra_id FROM lote_detalle ld
     JOIN detalle_compras dc ON dc.id = ld.detalle_compra_id
     JOIN compras c ON c.id = dc.compra_id
     WHERE c.anulada = 1`,
  );
  for (const f of filas) quitarEntradaDeLotes(db, f.detalle_compra_id, true);
}

/** Valida que las entradas existan, sean del producto+estado, no estén anuladas ni en otro lote. */
function validarEntradas(db: Db, p: NuevoLote): number {
  if (!p.entradas.length) throw new Error('Selecciona al menos una entrada.');
  const ph = p.entradas.map(() => '?').join(',');
  const filas = db.all<{ id: number; gramos: number; producto_id: number; estado_id: number | null; anulada: number; en_lote: number }>(
    `SELECT dc.id, dc.gramos, dc.producto_id, dc.estado_id, c.anulada,
            (SELECT COUNT(*) FROM lote_detalle ld WHERE ld.detalle_compra_id = dc.id) AS en_lote
     FROM detalle_compras dc JOIN compras c ON c.id = dc.compra_id
     WHERE dc.id IN (${ph})`,
    p.entradas,
  );
  if (filas.length !== new Set(p.entradas).size) throw new Error('Alguna de las entradas no existe.');
  for (const f of filas) {
    if (f.anulada) throw new Error('No se puede agregar a un lote una compra anulada.');
    if (f.en_lote) throw new Error('Alguna de las entradas ya pertenece a un lote.');
    if (f.producto_id !== p.producto_id || (f.estado_id ?? null) !== (p.estado_id ?? null)) {
      throw new Error('Las entradas deben ser del mismo producto y estado del lote.');
    }
  }
  return filas.reduce((s, f) => s + f.gramos, 0);
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
    // Si parte de estas entradas ya se vendió sin lote, el lote solo recibe lo que queda en stock.
    const gramos = Math.min(validarEntradas(db, p), Math.max(0, stockSueltoDe(db, p.producto_id, p.estado_id)));

    // Determinar el lote destino
    let loteId = p.lote_id ?? null;
    if (!loteId && !p.forzar_nuevo) {
      const abierto = loteAbiertoDe(db, p.producto_id, p.estado_id);
      if (abierto) loteId = abierto.id;
    }

    if (loteId) {
      const destino = db.get<Lote>('SELECT * FROM lotes WHERE id = ?', [loteId]);
      if (!destino) throw new Error('El lote no existe.');
      if (destino.estado_lote === 'CERRADO' || destino.estado_lote === 'ANULADO') throw new Error('El lote ya no está activo.');
      if (destino.producto_id !== p.producto_id || (destino.estado_id ?? null) !== (p.estado_id ?? null)) {
        throw new Error('Las entradas deben ser del mismo producto y estado del lote.');
      }
      asociarEntradas(db, loteId, p.entradas);
      db.run('UPDATE lotes SET gramos = gramos + ? WHERE id = ?', [gramos, loteId]);
      actualizarEstadoLote(db, loteId);
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
    actualizarEstadoLote(db, nuevoId);
    return { id: nuevoId, codigo, gramos, agregado: false };
  });
}

/** Pasa entradas y saldo de `origen` a `destino` y cierra el origen recordando su destino. */
function unirLote(db: Db, origen: number, destino: number, gramos: number): void {
  db.run('UPDATE lote_detalle SET lote_id = ? WHERE lote_id = ?', [destino, origen]);
  db.run('UPDATE lotes SET gramos = gramos + ? WHERE id = ?', [gramos, destino]);
  db.run("UPDATE lotes SET gramos = 0, estado_lote = 'CERRADO', fusionado_en = ? WHERE id = ?", [destino, origen]);
}

/** Fusiona varios lotes abiertos del mismo producto+estado en uno solo. */
export function fusionarLotes(db: Db, destino_id: number, origen_ids: number[]) {
  return db.transaction(() => {
    const destino = db.get<Lote>('SELECT * FROM lotes WHERE id = ?', [destino_id]);
    if (!destino) throw new Error('El lote destino no existe.');
    if (destino.estado_lote === 'CERRADO' || destino.estado_lote === 'ANULADO') throw new Error('El lote destino ya no está activo.');
    for (const origenId of origen_ids) {
      if (origenId === destino_id) continue;
      const o = db.get<Lote>('SELECT * FROM lotes WHERE id = ?', [origenId]);
      if (!o || o.estado_lote === 'CERRADO' || o.estado_lote === 'ANULADO') continue;
      if (o.producto_id !== destino.producto_id || (o.estado_id ?? null) !== (destino.estado_id ?? null)) {
        throw new Error('Solo se pueden fusionar lotes del mismo producto y estado.');
      }
      unirLote(db, origenId, destino_id, o.gramos);
    }
    actualizarEstadoLote(db, destino_id);
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
        unirLote(db, origenId, destino!, o?.gramos ?? 0);
        fusionados++;
      }
      actualizarEstadoLote(db, destino!);
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
