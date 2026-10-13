import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => process.cwd() },
}));

import { initMemoryDb, type Db } from '../db/db';
import { registrarCompra, anularCompra, kardexEntrada } from '../services/compras';
import { registrarVenta, anularVenta, kardexSalida } from '../services/ventas';
import { crearLote, fusionarLotes, detalleLote, repararLotesConComprasAnuladas } from '../services/lotes';
import { stockDe } from '../services/inventario';
import { resumen } from '../services/dashboard';
import { listarProductos, listarEstados } from '../services/catalogos';
import { crearProveedor, crearComprador } from '../services/personas';
import { kgAGramos } from '../../shared/domain/weight';

let db: Db;
let cafe: number, seco: number, humedo: number, prov: number, comp: number;

const lote = (id: number) => db.get<{ gramos: number; estado_lote: string }>('SELECT gramos, estado_lote FROM lotes WHERE id = ?', [id])!;
const detalleDe = (compraId: number) => db.get<{ id: number }>('SELECT id FROM detalle_compras WHERE compra_id = ?', [compraId])!.id;
const stock = () => stockDe(db, cafe, seco);

function comprar(kg: number, estado = seco) {
  return registrarCompra(db, { fecha: '2026-10-01', proveedor_id: prov, usuario_id: 1, producto_id: cafe, estado_id: estado, kg, precio_soles: 8 });
}
function vender(kg: number, lote_id: number | null = null) {
  return registrarVenta(db, { fecha: '2026-10-02', comprador_id: comp, usuario_id: 1, producto_id: cafe, estado_id: seco, lote_id, kg, precio_soles: 10 });
}
function agrupar(...compras: number[]) {
  return crearLote(db, { producto_id: cafe, estado_id: seco, entradas: compras.map(detalleDe) });
}
/** Regla: los lotes nunca suman más que el stock de su producto+estado. */
function lotesNoSuperanStock() {
  const g = db.get<{ g: number }>('SELECT COALESCE(SUM(gramos), 0) AS g FROM lotes WHERE producto_id = ? AND estado_id IS ?', [cafe, seco])!.g;
  expect(g).toBeLessThanOrEqual(stock());
}

beforeEach(async () => {
  db = await initMemoryDb();
  cafe = listarProductos(db).find((p) => p.codigo === 'CAFE')!.id;
  seco = listarEstados(db, cafe).find((e) => e.codigo === 'SECO')!.id;
  humedo = listarEstados(db, cafe).find((e) => e.codigo === 'HUMEDO')!.id;
  prov = crearProveedor(db, { nombre: 'Proveedor' }).id;
  comp = crearComprador(db, { nombre: 'Comprador' }).id;
});

describe('Anular compra', () => {
  it('saca la compra de su lote: el lote queda ANULADO y el stock en 0', () => {
    const c = comprar(100);
    const l = agrupar(c.id);
    expect(resumen(db).lotes_disponibles).toBe(1);

    anularCompra(db, c.id, 'error de digitación');

    expect(stock()).toBe(0);
    expect(lote(l.id)).toEqual({ gramos: 0, estado_lote: 'ANULADO' });
    expect(resumen(db).lotes_disponibles).toBe(0);
    expect(detalleLote(db, l.id).entradas).toHaveLength(0);
  });

  it('si el lote tiene otras compras, solo descuenta la anulada', () => {
    const c1 = comprar(100);
    const c2 = comprar(50);
    const l = agrupar(c1.id, c2.id);

    anularCompra(db, c1.id, 'x');

    expect(lote(l.id)).toEqual({ gramos: kgAGramos(50), estado_lote: 'DISPONIBLE' });
    expect(stock()).toBe(kgAGramos(50));
    expect(detalleLote(db, l.id).entradas).toHaveLength(1);
  });

  it('no permite anular si parte de la compra ya se vendió desde su lote', () => {
    const c = comprar(100);
    const l = agrupar(c.id);
    vender(30, l.id);
    expect(() => anularCompra(db, c.id, 'x')).toThrow(/vendió desde el lote/);
    expect(lote(l.id).gramos).toBe(kgAGramos(70)); // nada cambió
    expect(stock()).toBe(kgAGramos(70));
  });

  it('no permite anular una compra sin lote cuyo producto ya se vendió', () => {
    const enLote = comprar(100);
    agrupar(enLote.id);
    const suelta = comprar(100);
    vender(100); // sale primero del stock suelto (la compra sin lote)
    expect(() => anularCompra(db, suelta.id, 'x')).toThrow(/ya fue vendido/);
    lotesNoSuperanStock();
  });

  it('la compra anulada no puede agregarse a un lote', () => {
    const c = comprar(100);
    anularCompra(db, c.id, 'x');
    expect(() => agrupar(c.id)).toThrow(/anulada/);
  });
});

describe('Anular venta', () => {
  it('venta desde un lote: al anular, vuelven el stock y el saldo del lote', () => {
    const c = comprar(100);
    const l = agrupar(c.id);
    const v = vender(100, l.id);
    expect(lote(l.id)).toEqual({ gramos: 0, estado_lote: 'VENDIDO' });
    expect(stock()).toBe(0);

    anularVenta(db, v.id, 'x');

    expect(lote(l.id)).toEqual({ gramos: kgAGramos(100), estado_lote: 'DISPONIBLE' });
    expect(stock()).toBe(kgAGramos(100));
  });

  it('venta parcial deja el lote PARCIAL y al anularla vuelve a DISPONIBLE', () => {
    const l = agrupar(comprar(100).id);
    const v = vender(40, l.id);
    expect(lote(l.id)).toEqual({ gramos: kgAGramos(60), estado_lote: 'PARCIAL' });
    anularVenta(db, v.id, 'x');
    expect(lote(l.id)).toEqual({ gramos: kgAGramos(100), estado_lote: 'DISPONIBLE' });
  });

  it('venta sin lote: si todo el café está en lotes, descuenta del lote más antiguo', () => {
    const l = agrupar(comprar(100).id);
    const v = vender(60);
    expect(lote(l.id).gramos).toBe(kgAGramos(40));
    expect(kardexSalida(db).find((f) => f.id === v.id)!.lote_codigo).toBe('CAF-0001');
    lotesNoSuperanStock();

    anularVenta(db, v.id, 'x');
    expect(lote(l.id)).toEqual({ gramos: kgAGramos(100), estado_lote: 'DISPONIBLE' });
    expect(stock()).toBe(kgAGramos(100));
  });

  it('venta sin lote: primero sale del stock suelto y no toca los lotes', () => {
    const l = agrupar(comprar(100).id);
    comprar(50); // sin lote
    vender(50);
    expect(lote(l.id).gramos).toBe(kgAGramos(100));
    vender(20); // ya no hay suelto: sale del lote
    expect(lote(l.id).gramos).toBe(kgAGramos(80));
    lotesNoSuperanStock();
  });

  it('si el lote se fusionó después de la venta, al anular regresa al lote destino', () => {
    const l1 = agrupar(comprar(100).id);
    const l2 = crearLote(db, { producto_id: cafe, estado_id: seco, entradas: [detalleDe(comprar(50).id)], forzar_nuevo: true });
    const v = vender(100, l1.id);
    fusionarLotes(db, l2.id, [l1.id]);
    expect(lote(l1.id).estado_lote).toBe('CERRADO');

    anularVenta(db, v.id, 'x');

    expect(lote(l1.id)).toEqual({ gramos: 0, estado_lote: 'CERRADO' }); // no se reabre
    expect(lote(l2.id)).toEqual({ gramos: kgAGramos(150), estado_lote: 'DISPONIBLE' });
    expect(stock()).toBe(kgAGramos(150));
  });

  it('rechaza vender desde un lote más de lo que tiene o de otro estado', () => {
    const l = agrupar(comprar(100).id);
    comprar(100); // stock suficiente, pero el lote solo tiene 100
    expect(() => vender(150, l.id)).toThrow(/supera lo disponible en el lote/);
    comprar(10, humedo);
    expect(() =>
      registrarVenta(db, { fecha: '2026-10-02', comprador_id: comp, usuario_id: 1, producto_id: cafe, estado_id: humedo, lote_id: l.id, kg: 5, precio_soles: 10 }),
    ).toThrow(/no corresponde/);
  });
});

describe('Crear lote con producto ya vendido', () => {
  it('el lote solo recibe lo que queda en stock', () => {
    const c = comprar(100);
    vender(30); // vendido sin lote
    const l = agrupar(c.id);
    expect(lote(l.id)).toEqual({ gramos: kgAGramos(70), estado_lote: 'PARCIAL' });
    lotesNoSuperanStock();
  });
});

describe('Reparación de datos anteriores', () => {
  it('quita de los lotes las compras que ya estaban anuladas', () => {
    const c = comprar(100);
    const l = agrupar(c.id);
    // Simula una anulación hecha con la versión anterior (no tocaba el lote).
    db.run('UPDATE compras SET anulada = 1 WHERE id = ?', [c.id]);
    repararLotesConComprasAnuladas(db);
    expect(lote(l.id)).toEqual({ gramos: 0, estado_lote: 'ANULADO' });
  });
});

describe('Rendimiento guardado con la compra', () => {
  it('guarda y muestra el rendimiento (almendra / (muestra / 100))', () => {
    registrarCompra(db, {
      fecha: '2026-10-01', proveedor_id: prov, usuario_id: 1, producto_id: cafe, estado_id: seco, kg: 10, precio_soles: 8,
      rendimiento: { muestraInicialG: 200, pesoPiladoG: 160, almendraSanaG: 140 },
    });
    const fila = kardexEntrada(db)[0]!;
    expect(fila.rendimiento_pct).toBe(70);
  });
});
