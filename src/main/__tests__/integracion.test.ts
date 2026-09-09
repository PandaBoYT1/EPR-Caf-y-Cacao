import { describe, it, expect, beforeAll, vi } from 'vitest';

// Electron no existe en el entorno de pruebas: lo simulamos.
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => process.cwd() },
}));

import { initMemoryDb, type Db } from '../db/db';
import { registrarCompra, anularCompra, kardexEntrada } from '../services/compras';
import { registrarVenta } from '../services/ventas';
import { stockDe, getInventario } from '../services/inventario';
import { listarProductos, listarEstados } from '../services/catalogos';
import { crearProveedor } from '../services/personas';
import { crearComprador } from '../services/personas';
import { kgAGramos } from '../../shared/domain/weight';

let db: Db;
let cafeId: number;
let secoId: number;
let provId: number;
let compId: number;

beforeAll(async () => {
  db = await initMemoryDb();
  cafeId = listarProductos(db).find((p) => p.codigo === 'CAFE')!.id;
  secoId = listarEstados(db, cafeId).find((e) => e.codigo === 'SECO')!.id;
  provId = crearProveedor(db, { nombre: 'Juan Pérez', tipo: 'AGRICULTOR' }).id;
  compId = crearComprador(db, { nombre: 'Cooperativa El Valle', tipo: 'COOPERATIVA' }).id;
});

describe('Flujo completo de acopio', () => {
  it('registra una compra de café seco y calcula el rendimiento', () => {
    const r = registrarCompra(db, {
      fecha: '2026-09-05',
      proveedor_id: provId,
      usuario_id: 1,
      producto_id: cafeId,
      estado_id: secoId,
      kg: 500,
      precio_soles: 8.5,
      rendimiento: { muestraInicialG: 250, pesoPiladoG: 205, almendraSanaG: 193 },
    });
    expect(r.codigo).toBe('ENT-000001');
    expect(r.total_centimos).toBe(425000); // 500 × 8.50 = S/ 4,250.00

    const rend = db.get<{ factor: number; merma_g: number }>('SELECT factor, merma_g FROM rendimientos LIMIT 1');
    expect(rend?.factor).toBe(90.67);
    expect(rend?.merma_g).toBe(45);
  });

  it('el inventario sube a 500 kg', () => {
    expect(stockDe(db, cafeId, secoId)).toBe(kgAGramos(500));
  });

  it('una segunda compra deja el stock en 800 kg', () => {
    registrarCompra(db, {
      fecha: '2026-09-05', proveedor_id: provId, usuario_id: 1,
      producto_id: cafeId, estado_id: secoId, kg: 300, precio_soles: 8.6,
    });
    expect(stockDe(db, cafeId, secoId)).toBe(kgAGramos(800));
  });

  it('una venta de 250 kg deja el stock en 550 kg', () => {
    const v = registrarVenta(db, {
      fecha: '2026-09-05', comprador_id: compId, usuario_id: 1,
      producto_id: cafeId, estado_id: secoId, lote_id: null, kg: 250, precio_soles: 10.2,
    });
    expect(v.codigo).toBe('VEN-000001');
    expect(stockDe(db, cafeId, secoId)).toBe(kgAGramos(550));
  });

  it('rechaza vender más que el stock disponible (REGLA 6)', () => {
    expect(() =>
      registrarVenta(db, {
        fecha: '2026-09-05', comprador_id: compId, usuario_id: 1,
        producto_id: cafeId, estado_id: secoId, lote_id: null, kg: 10000, precio_soles: 10,
      }),
    ).toThrow(/stock/i);
  });

  it('el Kardex de entrada muestra las compras registradas', () => {
    const filas = kardexEntrada(db, {});
    expect(filas.length).toBe(2);
    expect(filas.some((f) => f.factor === 90.67)).toBe(true);
  });

  it('anular una compra revierte el inventario y la conserva en el historial', () => {
    const stockAntes = stockDe(db, cafeId, secoId);
    const c = registrarCompra(db, {
      fecha: '2026-09-05', proveedor_id: provId, usuario_id: 1,
      producto_id: cafeId, estado_id: secoId, kg: 100, precio_soles: 8,
    });
    compId; // noop
    const idCompra = db.get<{ id: number }>('SELECT id FROM compras WHERE codigo = ?', [c.codigo])!.id;
    expect(stockDe(db, cafeId, secoId)).toBe(stockAntes + kgAGramos(100));
    anularCompra(db, idCompra, 'prueba');
    expect(stockDe(db, cafeId, secoId)).toBe(stockAntes);
    const anulada = db.get<{ anulada: number }>('SELECT anulada FROM compras WHERE id = ?', [idCompra]);
    expect(anulada?.anulada).toBe(1); // sigue en el historial
  });

  it('el inventario general lista buckets de café (por estado) y cacao', () => {
    const inv = getInventario(db);
    expect(inv.some((b) => b.producto_nombre.includes('Café') && b.estado_nombre === 'Seco')).toBe(true);
    expect(inv.some((b) => b.producto_nombre.includes('Cacao'))).toBe(true);
  });
});
