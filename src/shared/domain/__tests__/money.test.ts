import { describe, it, expect } from 'vitest';
import {
  solesACentimos,
  centimosASoles,
  calcularTotalCentimos,
  formatearSoles,
} from '../money';
import { kgAGramos } from '../weight';
import { formatearCodigo } from '../codes';

describe('Dinero — precisión (REGLA 2)', () => {
  it('250 kg × S/ 8.50 = S/ 2,125.00 (ejemplo sección 3)', () => {
    const total = calcularTotalCentimos(kgAGramos(250), solesACentimos(8.5));
    expect(total).toBe(212500);
    expect(centimosASoles(total)).toBe(2125);
    expect(formatearSoles(total)).toBe('S/ 2,125.00');
  });

  it('2000 kg × S/ 10.20 = S/ 20,400.00 (ejemplo sección 14)', () => {
    const total = calcularTotalCentimos(kgAGramos(2000), solesACentimos(10.2));
    expect(total).toBe(2040000);
    expect(formatearSoles(total)).toBe('S/ 20,400.00');
  });

  it('no acumula error de coma flotante en precios con decimales', () => {
    // 0.1 + 0.2 problemático en float; con céntimos es exacto
    const total = calcularTotalCentimos(kgAGramos(3), solesACentimos(0.1));
    expect(total).toBe(30); // S/ 0.30
  });
});

describe('Códigos únicos (REGLA 7)', () => {
  it('formatea con ceros a la izquierda', () => {
    expect(formatearCodigo('ENT', 1)).toBe('ENT-000001');
    expect(formatearCodigo('ENT', 23)).toBe('ENT-000023');
    expect(formatearCodigo('CAF', 1, 4)).toBe('CAF-0001');
  });
});
