import { describe, it, expect } from 'vitest';
import { aplicarMovimiento, calcularSaldo } from '../inventory';
import { kgAGramos, gramosAKg } from '../weight';

describe('Inventario — secuencia de la sección 29', () => {
  it('500 → +300 = 800 → −250 = 550 (kg)', () => {
    const r = calcularSaldo(0, [
      { tipo: 'entrada', cantidadG: kgAGramos(500) },
      { tipo: 'entrada', cantidadG: kgAGramos(300) },
      { tipo: 'salida', cantidadG: kgAGramos(250) },
    ]);
    expect(r.ok).toBe(true);
    expect(gramosAKg(r.nuevoStockG)).toBe(550);
  });

  it('cada paso intermedio es correcto', () => {
    const e1 = aplicarMovimiento(0, 'entrada', kgAGramos(500));
    expect(gramosAKg(e1.nuevoStockG)).toBe(500);
    const e2 = aplicarMovimiento(e1.nuevoStockG, 'entrada', kgAGramos(300));
    expect(gramosAKg(e2.nuevoStockG)).toBe(800);
    const s1 = aplicarMovimiento(e2.nuevoStockG, 'salida', kgAGramos(250));
    expect(gramosAKg(s1.nuevoStockG)).toBe(550);
  });
});

describe('Inventario — REGLA 6: no vender más que el stock', () => {
  it('rechaza una salida mayor que el stock', () => {
    const r = aplicarMovimiento(kgAGramos(100), 'salida', kgAGramos(150));
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
    expect(gramosAKg(r.nuevoStockG)).toBe(100); // stock intacto
  });

  it('permite negativo solo si se habilita explícitamente', () => {
    const r = aplicarMovimiento(kgAGramos(100), 'salida', kgAGramos(150), { permitirNegativo: true });
    expect(r.ok).toBe(true);
    expect(gramosAKg(r.nuevoStockG)).toBe(-50);
  });

  it('rechaza cantidades no positivas', () => {
    expect(aplicarMovimiento(1000, 'entrada', 0).ok).toBe(false);
  });
});
