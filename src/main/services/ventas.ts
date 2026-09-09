import type { Db, Params } from '../db/db';
import type { NuevaVenta, FilaKardexSalida } from '../../shared/types';
import { kgAGramos } from '../../shared/domain/weight';
import { solesACentimos, calcularTotalCentimos } from '../../shared/domain/money';
import { formatearCodigo, PREFIJOS } from '../../shared/domain/codes';
import { registrarMovimiento, stockDe } from './inventario';
import { permitirStockNegativo } from './catalogos';
import type { FiltroKardex } from './compras';

export function registrarVenta(db: Db, p: NuevaVenta) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const gramos = kgAGramos(p.kg);
    if (gramos <= 0) throw new Error('La cantidad debe ser mayor que cero.');
    const precioC = solesACentimos(p.precio_soles);
    if (precioC <= 0) throw new Error('El precio debe ser mayor que cero.');
    const totalC = calcularTotalCentimos(gramos, precioC);

    // REGLA 6: no vender más que el stock disponible
    const disponible = stockDe(db, p.producto_id, p.estado_id);
    if (gramos > disponible && !permitirStockNegativo(db)) {
      throw new Error('No hay stock suficiente para esta venta.');
    }

    const ventaId = db.run(
      `INSERT INTO ventas (fecha, comprador_id, usuario_id, total_centimos, obs, anulada, creado_en)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [p.fecha, p.comprador_id, p.usuario_id, totalC, p.obs ?? null, now],
    ).lastId;
    const codigo = formatearCodigo(PREFIJOS.VENTA, ventaId);
    db.run('UPDATE ventas SET codigo = ? WHERE id = ?', [codigo, ventaId]);

    db.run(
      `INSERT INTO detalle_ventas (venta_id, producto_id, estado_id, lote_id, gramos, precio_centimos_kg, total_centimos)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ventaId, p.producto_id, p.estado_id, p.lote_id, gramos, precioC, totalC],
    );

    if (p.lote_id) actualizarLoteTrasVenta(db, p.lote_id, gramos);

    registrarMovimiento(db, {
      fecha: p.fecha,
      producto_id: p.producto_id,
      estado_id: p.estado_id,
      tipo: 'salida',
      gramos,
      ref_tipo: 'venta',
      ref_id: ventaId,
    });

    return { id: ventaId, codigo, total_centimos: totalC };
  });
}

function actualizarLoteTrasVenta(db: Db, lote_id: number, gramos: number): void {
  const lote = db.get<{ gramos: number }>('SELECT gramos FROM lotes WHERE id = ?', [lote_id]);
  if (!lote) return;
  const restante = Math.max(0, lote.gramos - gramos);
  const estado = restante <= 0 ? 'VENDIDO' : 'PARCIAL';
  db.run('UPDATE lotes SET gramos = ?, estado_lote = ? WHERE id = ?', [restante, estado, lote_id]);
}

export function anularVenta(db: Db, id: number, motivo: string) {
  return db.transaction(() => {
    const venta = db.get<{ anulada: number }>('SELECT anulada FROM ventas WHERE id = ?', [id]);
    if (!venta) throw new Error('La venta no existe.');
    if (venta.anulada) throw new Error('La venta ya está anulada.');

    const detalles = db.all<{ producto_id: number; estado_id: number | null; gramos: number; lote_id: number | null }>(
      'SELECT producto_id, estado_id, gramos, lote_id FROM detalle_ventas WHERE venta_id = ?',
      [id],
    );
    for (const d of detalles) {
      registrarMovimiento(db, {
        fecha: new Date().toISOString().slice(0, 10),
        producto_id: d.producto_id,
        estado_id: d.estado_id,
        tipo: 'entrada',
        gramos: d.gramos,
        ref_tipo: 'venta_anulada',
        ref_id: id,
      });
      if (d.lote_id) {
        db.run("UPDATE lotes SET gramos = gramos + ?, estado_lote = 'DISPONIBLE' WHERE id = ?", [d.gramos, d.lote_id]);
      }
    }
    db.run('UPDATE ventas SET anulada = 1, anulada_motivo = ? WHERE id = ?', [motivo, id]);
    return { ok: true };
  });
}

/** Precio promedio de venta (céntimos/kg) de un producto+estado, según ventas no anuladas. */
export function precioPromedioVenta(db: Db, producto_id: number, estado_id: number | null): number {
  const r = db.get<{ t: number; g: number }>(
    `SELECT COALESCE(SUM(d.total_centimos), 0) AS t, COALESCE(SUM(d.gramos), 0) AS g
     FROM detalle_ventas d JOIN ventas v ON v.id = d.venta_id
     WHERE v.anulada = 0 AND d.producto_id = ? AND d.estado_id IS ?`,
    [producto_id, estado_id],
  );
  if (!r || r.g <= 0) return 0;
  return Math.round((r.t * 1000) / r.g);
}

export function kardexSalida(db: Db, f: FiltroKardex = {}): FilaKardexSalida[] {
  const cond: string[] = [];
  const params: Params = [];
  if (!f.incluir_anuladas) cond.push('v.anulada = 0');
  if (f.fecha_desde) (cond.push('v.fecha >= ?'), params.push(f.fecha_desde));
  if (f.fecha_hasta) (cond.push('v.fecha <= ?'), params.push(f.fecha_hasta));
  if (f.producto_id) (cond.push('d.producto_id = ?'), params.push(f.producto_id));
  if (f.comprador_id) (cond.push('v.comprador_id = ?'), params.push(f.comprador_id));
  if (f.estado_id) (cond.push('d.estado_id = ?'), params.push(f.estado_id));
  if (f.texto) {
    cond.push('(co.nombre LIKE ? OR v.codigo LIKE ?)');
    params.push(`%${f.texto}%`, `%${f.texto}%`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return db.all<FilaKardexSalida>(
    `SELECT v.id, v.codigo, v.fecha, co.nombre AS comprador_nombre, p.nombre AS producto_nombre,
            e.nombre AS estado_nombre, l.codigo AS lote_codigo,
            d.gramos, d.precio_centimos_kg, d.total_centimos, v.anulada
     FROM detalle_ventas d
     JOIN ventas v ON v.id = d.venta_id
     JOIN compradores co ON co.id = v.comprador_id
     JOIN productos p ON p.id = d.producto_id
     LEFT JOIN estados_producto e ON e.id = d.estado_id
     LEFT JOIN lotes l ON l.id = d.lote_id
     ${where}
     ORDER BY v.fecha DESC, v.id DESC`,
    params,
  );
}
