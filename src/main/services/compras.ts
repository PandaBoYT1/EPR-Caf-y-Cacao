import type { Db, Params } from '../db/db';
import type { NuevaCompra, FilaKardexEntrada } from '../../shared/types';
import { kgAGramos } from '../../shared/domain/weight';
import { solesACentimos, calcularTotalCentimos } from '../../shared/domain/money';
import { calcularRendimiento } from '../../shared/domain/rendimiento';
import { formatearCodigo, PREFIJOS } from '../../shared/domain/codes';
import { registrarMovimiento, stockDe } from './inventario';
import { mermaOpts, permitirStockNegativo } from './catalogos';

export function registrarCompra(db: Db, p: NuevaCompra) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const gramos = kgAGramos(p.kg);
    if (gramos <= 0) throw new Error('La cantidad debe ser mayor que cero.');
    const precioC = solesACentimos(p.precio_soles);
    if (precioC <= 0) throw new Error('El precio debe ser mayor que cero.');
    const totalC = calcularTotalCentimos(gramos, precioC);

    let rendimientoId: number | null = null;
    if (p.rendimiento) {
      const r = calcularRendimiento(p.rendimiento, mermaOpts(db));
      if (!r.valido) throw new Error(r.errores.join(' '));
      rendimientoId = db.run(
        `INSERT INTO rendimientos (muestra_g, pilado_g, almendra_g, merma_g, merma_pct, defectos_g, factor, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.muestraInicialG, r.pesoPiladoG, r.almendraSanaG, r.mermaG, r.mermaPct, r.defectosG, r.factor, now],
      ).lastId;
    }

    const compraId = db.run(
      `INSERT INTO compras (fecha, proveedor_id, usuario_id, total_centimos, obs, anulada, creado_en)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [p.fecha, p.proveedor_id, p.usuario_id, totalC, p.obs ?? null, now],
    ).lastId;
    const codigo = formatearCodigo(PREFIJOS.ENTRADA, compraId);
    db.run('UPDATE compras SET codigo = ? WHERE id = ?', [codigo, compraId]);

    db.run(
      `INSERT INTO detalle_compras (compra_id, producto_id, estado_id, gramos, precio_centimos_kg, total_centimos, rendimiento_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [compraId, p.producto_id, p.estado_id, gramos, precioC, totalC, rendimientoId],
    );

    registrarMovimiento(db, {
      fecha: p.fecha,
      producto_id: p.producto_id,
      estado_id: p.estado_id,
      tipo: 'entrada',
      gramos,
      ref_tipo: 'compra',
      ref_id: compraId,
    });

    return { id: compraId, codigo, total_centimos: totalC };
  });
}

/** Anula una compra: revierte su entrada de inventario y la marca (no se borra). */
export function anularCompra(db: Db, id: number, motivo: string) {
  return db.transaction(() => {
    const compra = db.get<{ anulada: number }>('SELECT anulada FROM compras WHERE id = ?', [id]);
    if (!compra) throw new Error('La compra no existe.');
    if (compra.anulada) throw new Error('La compra ya está anulada.');

    const detalles = db.all<{ producto_id: number; estado_id: number | null; gramos: number }>(
      'SELECT producto_id, estado_id, gramos FROM detalle_compras WHERE compra_id = ?',
      [id],
    );
    const permitir = permitirStockNegativo(db);
    for (const d of detalles) {
      const actual = stockDe(db, d.producto_id, d.estado_id);
      if (actual - d.gramos < 0 && !permitir) {
        throw new Error('No se puede anular: el producto de esta compra ya fue vendido.');
      }
    }
    for (const d of detalles) {
      registrarMovimiento(db, {
        fecha: new Date().toISOString().slice(0, 10),
        producto_id: d.producto_id,
        estado_id: d.estado_id,
        tipo: 'salida',
        gramos: d.gramos,
        ref_tipo: 'compra_anulada',
        ref_id: id,
      });
    }
    db.run('UPDATE compras SET anulada = 1, anulada_motivo = ? WHERE id = ?', [motivo, id]);
    return { ok: true };
  });
}

export interface FiltroKardex {
  fecha_desde?: string;
  fecha_hasta?: string;
  producto_id?: number;
  proveedor_id?: number;
  comprador_id?: number;
  estado_id?: number;
  texto?: string;
  incluir_anuladas?: boolean;
}

export function kardexEntrada(db: Db, f: FiltroKardex = {}): FilaKardexEntrada[] {
  const cond: string[] = [];
  const params: Params = [];
  if (!f.incluir_anuladas) cond.push('c.anulada = 0');
  if (f.fecha_desde) (cond.push('c.fecha >= ?'), params.push(f.fecha_desde));
  if (f.fecha_hasta) (cond.push('c.fecha <= ?'), params.push(f.fecha_hasta));
  if (f.producto_id) (cond.push('d.producto_id = ?'), params.push(f.producto_id));
  if (f.proveedor_id) (cond.push('c.proveedor_id = ?'), params.push(f.proveedor_id));
  if (f.estado_id) (cond.push('d.estado_id = ?'), params.push(f.estado_id));
  if (f.texto) {
    cond.push('(pr.nombre LIKE ? OR c.codigo LIKE ?)');
    params.push(`%${f.texto}%`, `%${f.texto}%`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return db.all<FilaKardexEntrada>(
    `SELECT c.id, c.codigo, c.fecha, pr.nombre AS proveedor_nombre, p.nombre AS producto_nombre,
            e.nombre AS estado_nombre, d.gramos, d.precio_centimos_kg, d.total_centimos,
            r.factor, c.anulada
     FROM detalle_compras d
     JOIN compras c ON c.id = d.compra_id
     JOIN proveedores pr ON pr.id = c.proveedor_id
     JOIN productos p ON p.id = d.producto_id
     LEFT JOIN estados_producto e ON e.id = d.estado_id
     LEFT JOIN rendimientos r ON r.id = d.rendimiento_id
     ${where}
     ORDER BY c.fecha DESC, c.id DESC`,
    params,
  );
}

/** Detalles de compra no asignados a ningún lote (para armar lotes). */
export function entradasDisponiblesParaLote(db: Db, producto_id: number, estado_id: number | null) {
  return db.all(
    `SELECT d.id, c.codigo, c.fecha, d.gramos, pr.nombre AS proveedor_nombre
     FROM detalle_compras d
     JOIN compras c ON c.id = d.compra_id
     JOIN proveedores pr ON pr.id = c.proveedor_id
     WHERE c.anulada = 0 AND d.producto_id = ? AND d.estado_id IS ?
       AND d.id NOT IN (SELECT detalle_compra_id FROM lote_detalle WHERE detalle_compra_id IS NOT NULL)
     ORDER BY c.fecha ASC, d.id ASC`,
    [producto_id, estado_id],
  );
}
