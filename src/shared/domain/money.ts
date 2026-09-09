/**
 * Dinero — REGLA 2: precisión sin errores de redondeo.
 *
 * Todo valor monetario se maneja internamente como CÉNTIMOS ENTEROS.
 *   S/ 1.00  -> 100 céntimos
 *   S/ 8.50  -> 850 céntimos
 * Nunca se usan números decimales (float) para almacenar dinero.
 */

/** Céntimos: entero. S/ 1.00 = 100. */
export type Centimos = number;

/** Convierte soles (con decimales) a céntimos enteros. */
export function solesACentimos(soles: number): Centimos {
  return Math.round(soles * 100);
}

/** Convierte céntimos enteros a soles (número con decimales). */
export function centimosASoles(centimos: Centimos): number {
  return centimos / 100;
}

/**
 * Calcula el total de una operación con precisión entera.
 *
 * total = cantidad(kg) × precio(por kg)
 *
 * Trabajamos en unidades base: gramos y céntimos/kg.
 *   total_centimos = gramos × precio_centimos_kg / 1000
 *
 * Ejemplo: 250 kg (250 000 g) × S/ 8.50 (850 c/kg)
 *   = 250000 × 850 / 1000 = 212 500 céntimos = S/ 2 125.00
 */
export function calcularTotalCentimos(
  gramos: number,
  precioCentimosPorKg: Centimos,
): Centimos {
  return Math.round((gramos * precioCentimosPorKg) / 1000);
}

/** Formatea céntimos como texto de soles: 212500 -> "S/ 2,125.00". */
export function formatearSoles(centimos: Centimos): string {
  const soles = centimosASoles(centimos);
  const formato = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(soles);
  return `S/ ${formato}`;
}
