import type { Db } from '../db/db';
import type { Proveedor, Comprador } from '../../shared/types';

// -------------------- Proveedores --------------------

export function listarProveedores(db: Db, soloActivos = true): Proveedor[] {
  const where = soloActivos ? 'WHERE activo = 1' : '';
  return db.all<Proveedor>(`SELECT * FROM proveedores ${where} ORDER BY nombre`);
}

export function crearProveedor(db: Db, p: Partial<Proveedor> & { nombre: string }): { id: number } {
  return db.transaction(() => {
    const id = db.run(
      `INSERT INTO proveedores (nombre, tipo, documento, telefono, comunidad, obs, activo, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        p.nombre.trim(),
        p.tipo ?? 'AGRICULTOR',
        p.documento ?? null,
        p.telefono ?? null,
        p.comunidad ?? null,
        p.obs ?? null,
        new Date().toISOString(),
      ],
    ).lastId;
    return { id };
  });
}

export function actualizarProveedor(db: Db, id: number, p: Partial<Proveedor>): void {
  db.transaction(() => {
    db.run(
      `UPDATE proveedores SET nombre=?, tipo=?, documento=?, telefono=?, comunidad=?, obs=?, activo=? WHERE id=?`,
      [
        p.nombre,
        p.tipo,
        p.documento ?? null,
        p.telefono ?? null,
        p.comunidad ?? null,
        p.obs ?? null,
        p.activo ?? 1,
        id,
      ],
    );
  });
}

export function historialProveedor(db: Db, id: number) {
  const resumen = db.get<{ entregas: number; gramos: number; total: number }>(
    `SELECT COUNT(DISTINCT c.id) AS entregas,
            COALESCE(SUM(d.gramos), 0) AS gramos,
            COALESCE(SUM(d.total_centimos), 0) AS total
     FROM compras c JOIN detalle_compras d ON d.compra_id = c.id
     WHERE c.proveedor_id = ? AND c.anulada = 0`,
    [id],
  );
  const ultimas = db.all(
    `SELECT c.codigo, c.fecha, p.nombre AS producto, d.gramos, d.total_centimos
     FROM compras c JOIN detalle_compras d ON d.compra_id = c.id
     JOIN productos p ON p.id = d.producto_id
     WHERE c.proveedor_id = ? AND c.anulada = 0
     ORDER BY c.fecha DESC, c.id DESC LIMIT 10`,
    [id],
  );
  const precioProm =
    resumen && resumen.gramos > 0 ? Math.round((resumen.total / resumen.gramos) * 1000) : 0;
  return { resumen: { ...resumen, precio_prom_centimos_kg: precioProm }, ultimas };
}

// -------------------- Compradores --------------------

export function listarCompradores(db: Db, soloActivos = true): Comprador[] {
  const where = soloActivos ? 'WHERE activo = 1' : '';
  return db.all<Comprador>(`SELECT * FROM compradores ${where} ORDER BY nombre`);
}

export function crearComprador(db: Db, p: Partial<Comprador> & { nombre: string }): { id: number } {
  return db.transaction(() => {
    const id = db.run(
      `INSERT INTO compradores (nombre, tipo, documento, telefono, direccion, contacto, obs, activo, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        p.nombre.trim(),
        p.tipo ?? 'MAYORISTA',
        p.documento ?? null,
        p.telefono ?? null,
        p.direccion ?? null,
        p.contacto ?? null,
        p.obs ?? null,
        new Date().toISOString(),
      ],
    ).lastId;
    return { id };
  });
}

export function actualizarComprador(db: Db, id: number, p: Partial<Comprador>): void {
  db.transaction(() => {
    db.run(
      `UPDATE compradores SET nombre=?, tipo=?, documento=?, telefono=?, direccion=?, contacto=?, obs=?, activo=? WHERE id=?`,
      [
        p.nombre,
        p.tipo,
        p.documento ?? null,
        p.telefono ?? null,
        p.direccion ?? null,
        p.contacto ?? null,
        p.obs ?? null,
        p.activo ?? 1,
        id,
      ],
    );
  });
}

export function historialComprador(db: Db, id: number) {
  const resumen = db.get<{ ventas: number; gramos: number; total: number }>(
    `SELECT COUNT(DISTINCT v.id) AS ventas,
            COALESCE(SUM(d.gramos), 0) AS gramos,
            COALESCE(SUM(d.total_centimos), 0) AS total
     FROM ventas v JOIN detalle_ventas d ON d.venta_id = v.id
     WHERE v.comprador_id = ? AND v.anulada = 0`,
    [id],
  );
  const ultimas = db.all(
    `SELECT v.codigo, v.fecha, p.nombre AS producto, d.gramos, d.total_centimos
     FROM ventas v JOIN detalle_ventas d ON d.venta_id = v.id
     JOIN productos p ON p.id = d.producto_id
     WHERE v.comprador_id = ? AND v.anulada = 0
     ORDER BY v.fecha DESC, v.id DESC LIMIT 10`,
    [id],
  );
  return { resumen, ultimas };
}
