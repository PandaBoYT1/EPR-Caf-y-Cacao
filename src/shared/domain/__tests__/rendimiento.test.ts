import { describe, it, expect } from 'vitest';
import { calcularRendimiento } from '../rendimiento';

describe('Rendimiento del café — sección 28 (caso oficial)', () => {
  const r = calcularRendimiento({
    muestraInicialG: 250,
    pesoPiladoG: 205,
    almendraSanaG: 193,
  });

  it('la merma es 45 g', () => {
    expect(r.mermaG).toBe(45);
  });

  it('la merma porcentual es 18 %', () => {
    expect(r.mermaPct).toBe(18);
  });

  it('el factor es ≈ 90.67', () => {
    expect(r.factor).toBe(90.67);
  });

  it('el factor a mostrar es "90.6"', () => {
    expect(r.factorMostrar).toBe('90.6');
  });

  it('los defectos son 12 g (205 − 193)', () => {
    expect(r.defectosG).toBe(12);
  });

  it('el cálculo es válido y la merma está dentro del rango', () => {
    expect(r.valido).toBe(true);
    expect(r.advertencias).toContain('Merma dentro del rango de referencia.');
  });
});

describe('Rendimiento — otros valores (sección 28: pruebas adicionales)', () => {
  it('almendra igual a la muestra da factor 70', () => {
    const r = calcularRendimiento({ muestraInicialG: 250, pesoPiladoG: 250, almendraSanaG: 250 });
    expect(r.factor).toBe(70);
    expect(r.mermaG).toBe(0);
    expect(r.mermaPct).toBe(0);
  });

  it('funciona con muestra inicial distinta de 250', () => {
    const r = calcularRendimiento({ muestraInicialG: 300, pesoPiladoG: 240, almendraSanaG: 220 });
    // (70 × 300) / 220 = 95.4545… -> 95.45
    expect(r.factor).toBe(95.45);
    expect(r.mermaG).toBe(60);
    expect(r.mermaPct).toBe(20);
  });
});

describe('Rendimiento — validaciones (sección 9)', () => {
  it('rechaza almendra sana mayor que el pilado', () => {
    const r = calcularRendimiento({ muestraInicialG: 250, pesoPiladoG: 200, almendraSanaG: 210 });
    expect(r.valido).toBe(false);
    expect(r.errores.length).toBeGreaterThan(0);
  });

  it('rechaza pilado mayor que la muestra inicial', () => {
    const r = calcularRendimiento({ muestraInicialG: 250, pesoPiladoG: 260, almendraSanaG: 200 });
    expect(r.valido).toBe(false);
  });

  it('rechaza valores no positivos', () => {
    const r = calcularRendimiento({ muestraInicialG: 250, pesoPiladoG: 0, almendraSanaG: 0 });
    expect(r.valido).toBe(false);
  });

  it('advierte cuando la merma está por debajo del rango', () => {
    const r = calcularRendimiento({ muestraInicialG: 250, pesoPiladoG: 230, almendraSanaG: 220 });
    // merma 8 % < 18 %
    expect(r.valido).toBe(true);
    expect(r.advertencias.some((a) => a.includes('por debajo'))).toBe(true);
  });

  it('advierte cuando la merma está por encima del rango', () => {
    const r = calcularRendimiento({ muestraInicialG: 250, pesoPiladoG: 180, almendraSanaG: 170 });
    // merma 28 % > 20 %
    expect(r.advertencias.some((a) => a.includes('por encima'))).toBe(true);
  });
});
