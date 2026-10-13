import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => process.cwd() },
}));

import { initMemoryDb, type Db } from '../db/db';
import { registrarCompra } from '../services/compras';
import { registrarVenta, anularVenta, precioPromedioVenta } from '../services/ventas';
import { crearLote, fusionarDuplicados, listarLotes } from '../services/lotes';
import { stockDe } from '../services/inventario';
import { listarProductos, listarEstados } from '../services/catalogos';
import { crearProveedor, crearComprador } from '../services/personas';
import { kgAGramos } from '../../shared/domain/weight';

let db: Db;
let cafeId: number, secoId: number, provId: number, compId: number;
let det1: number, det2: number;

function detalleDe(compraCodigo: string): number {
  const c = db.get<{ id: number }>('SELECT id FROM compras WHERE codigo = ?', [compraCodigo])!;
  return db.get<{ id: number }>('SELECT id FROM detalle_compras WHERE compra_id = ?', [c.id])!.id;
}

beforeAll(async () => {
  db = await initMemoryDb();
  cafeId = listarProductos(db).find((p) => p.codigo === 'CAFE')!.id;
  secoId = listarEstados(db, cafeId).find((e) => e.codigo === 'SECO')!.id;
  provId = crearProveedor(db, { nombre: 'Proveedor 1' }).id;
  compId = crearComprador(db, { nombre: 'Cooperativa 1' }).id;
  const c1 = registrarCompra(db, { fecha: '2026-09-05', proveedor_id: provId, usuario_id: 1, producto_id: cafeId, estado_id: secoId, kg: 500, precio_soles: 8 });
  const c2 = registrarCompra(db, { fecha: '2026-09-06', proveedor_id: provId, usuario_id: 1, producto_id: cafeId, estado_id: secoId, kg: 300, precio_soles: 8 });
  det1 = detalleDe(c1.codigo);
  det2 = detalleDe(c2.codigo);
});

describe('Lotes: se agrupan por tipo + estado (no por proveedor)', () => {
  it('la segunda creación se AGREGA al lote abierto del mismo tipo/estado', () => {
    const l1 = crearLote(db, { producto_id: cafeId, estado_id: secoId, entradas: [det1] });
    expect(l1.agregado).toBe(false);
    expect(l1.gramos).toBe(kgAGramos(500));

    const l2 = crearLote(db, { producto_id: cafeId, estado_id: secoId, entradas: [det2] });
    expect(l2.agregado).toBe(true);
    expect(l2.id).toBe(l1.id); // mismo lote
    expect(l2.gramos).toBe(kgAGramos(800));

    const abiertos = listarLotes(db, true).filter((l) => l.estado_nombre === 'Seco');
    expect(abiertos.length).toBe(1); // un solo lote de café seco
  });

  it('fusionarDuplicados une lotes creados por separado', () => {
    // Forzar un segundo lote aparte con una tercera compra
    const c3 = registrarCompra(db, { fecha: '2026-09-06', proveedor_id: provId, usuario_id: 1, producto_id: cafeId, estado_id: secoId, kg: 100, precio_soles: 8 });
    crearLote(db, { producto_id: cafeId, estado_id: secoId, entradas: [detalleDe(c3.codigo)], forzar_nuevo: true });
    expect(listarLotes(db, true).filter((l) => l.estado_nombre === 'Seco').length).toBe(2);
    const r = fusionarDuplicados(db);
    expect(r.fusionados).toBeGreaterThanOrEqual(1);
    expect(listarLotes(db, true).filter((l) => l.estado_nombre === 'Seco').length).toBe(1);
  });
});

describe('Anular venta devuelve el stock', () => {
  it('el stock se restaura al anular una venta', () => {
    const antes = stockDe(db, cafeId, secoId); // 900 kg
    const v = registrarVenta(db, { fecha: '2026-09-07', comprador_id: compId, usuario_id: 1, producto_id: cafeId, estado_id: secoId, lote_id: null, kg: 200, precio_soles: 10 });
    expect(stockDe(db, cafeId, secoId)).toBe(antes - kgAGramos(200));

    const ventaId = db.get<{ id: number }>('SELECT id FROM ventas WHERE codigo = ?', [v.codigo])!.id;
    anularVenta(db, ventaId, 'prueba');
    expect(stockDe(db, cafeId, secoId)).toBe(antes); // vuelve al valor original
  });
});

describe('Referencia de precios', () => {
  it('el lote calcula el costo promedio de compra ponderado', () => {
    // 500 kg + 300 kg + 100 kg, todo a S/8 → S/8.00/kg = 800 céntimos/kg
    const lote = listarLotes(db, true).find((l) => l.estado_nombre === 'Seco')!;
    expect(lote.costo_prom_centimos_kg).toBe(800);
  });

  it('el precio promedio de venta ignora las ventas anuladas', () => {
    registrarVenta(db, { fecha: '2026-09-08', comprador_id: compId, usuario_id: 1, producto_id: cafeId, estado_id: secoId, lote_id: null, kg: 100, precio_soles: 12 });
    expect(precioPromedioVenta(db, cafeId, secoId)).toBe(1200); // solo la venta real (S/12/kg)
  });
});
