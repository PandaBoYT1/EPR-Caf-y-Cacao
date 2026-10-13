import type { Db, Params } from '../db/db';
import type { NuevaVenta, FilaKardexSalida } from '../../shared/types';
import { kgAGramos } from '../../shared/domain/weight';
import { solesACentimos, calcularTotalCentimos } from '../../shared/domain/money';
import { formatearCodigo, PREFIJOS } from '../../shared/domain/codes';
import { registrarMovimiento, stockDe } from './inventario';
import { permitirStockNegativo } from './catalogos';
import { hoyLocal, type FiltroKardex } from './compras';
import { descontarVentaDeLotes, revertirVentaEnLotes } from './lotes';

export function registrarVenta(db: Db, p: NuevaVenta) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const gramos = kgAGramos(p.kg);
    if (gramos <= 0) throw new Error('La cantidad debe ser mayor que cero.');
    const precioC = solesACentimos(p.precio_soles);
    if (precioC <= 0) throw new Error('El precio debe ser mayor que cero.');
    const totalC = calcularTotalCentimos(gramos, precioC);

    // REGLA 6: no vender más que el stock disponible
    const permitir = permitirStockNegativo(db);
    const disponible = stockDe(db, p.producto_id, p.estado_id);
    if (gramos > disponible && !permitir) {
      throw new Error('No hay stock suficiente para esta venta.');
    }
    if (p.lote_id) {
      const lote = db.get<{ codigo: string; producto_id: number; estado_id: number | null; gramos: number; estado_lote: string }>(
        'SELECT codigo, producto_id, estado_id, gramos, estado_lote FROM lotes WHERE id = ?',
        [p.lote_id],
      );
      if (!lote) throw new Error('El lote no existe.');
      if (lote.producto_id !== p.producto_id || (lote.estado_id ?? null) !== (p.estado_id ?? null)) {
        throw new Error('El lote elegido no corresponde al producto y estado de la venta.');
      }
      if (lote.estado_lote !== 'DISPONIBLE' && lote.estado_lote !== 'PARCIAL') {
        throw new Error(`El lote ${lote.codigo} ya no está disponible.`);
      }
      if (gramos > lote.gramos && !permitir) {
        throw new Error(`La cantidad supera lo disponible en el lote ${lote.codigo}.`);
      }
    }

    const ventaId = db.run(
      `INSERT INTO ventas (fecha, comprador_id, usuario_id, total_centimos, obs, anulada, creado_en)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [p.fecha, p.comprador_id, p.usuario_id, totalC, p.obs ?? null, now],
    ).lastId;
    const codigo = formatearCodigo(PREFIJOS.VENTA, ventaId);
    db.run('UPDATE ventas SET codigo = ? WHERE id = ?', [codigo, ventaId]);

    const detalleId = db.run(
      `INSERT INTO detalle_ventas (venta_id, producto_id, estado_id, lote_id, gramos, precio_centimos_kg, total_centimos)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ventaId, p.producto_id, p.estado_id, p.lote_id, gramos, precioC, totalC],
    ).lastId;

    // Antes del movimiento: el reparto entre lotes y stock suelto usa el stock previo a la venta.
    descontarVentaDeLotes(db, detalleId, p.producto_id, p.estado_id, gramos, p.lote_id);

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

/** Anula una venta: el producto regresa al inventario y a los lotes de los que salió. */
export function anularVenta(db: Db, id: number, motivo: string) {
  return db.transaction(() => {
    const venta = db.get<{ anulada: number }>('SELECT anulada FROM ventas WHERE id = ?', [id]);
    if (!venta) throw new Error('La venta no existe.');
    if (venta.anulada) throw new Error('La venta ya está anulada.');

    const detalles = db.all<{ id: number; producto_id: number; estado_id: number | null; gramos: number }>(
      'SELECT id, producto_id, estado_id, gramos FROM detalle_ventas WHERE venta_id = ?',
      [id],
    );
    for (const d of detalles) {
      revertirVentaEnLotes(db, d.id);
      registrarMovimiento(db, {
        fecha: hoyLocal(),
        producto_id: d.producto_id,
        estado_id: d.estado_id,
        tipo: 'entrada',
        gramos: d.gramos,
        ref_tipo: 'venta_anulada',
        ref_id: id,
      });
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
            e.nombre AS estado_nombre,
            COALESCE(l.codigo, (SELECT GROUP_CONCAT(l2.codigo, ', ') FROM venta_lotes vl
                                JOIN lotes l2 ON l2.id = vl.lote_id WHERE vl.detalle_venta_id = d.id)) AS lote_codigo,
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
