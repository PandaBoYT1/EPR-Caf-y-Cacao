/**
 * Peso — REGLA 3: los pesos se manejan correctamente en gramos y kilogramos.
 *
 * Internamente todo peso se guarda como GRAMOS ENTEROS.
 *   250 kg -> 250 000 g
 * Se muestra al usuario en kg.
 */

/** Gramos: entero. */
export type Gramos = number;

/** Convierte kilogramos a gramos enteros. */
export function kgAGramos(kg: number): Gramos {
  return Math.round(kg * 1000);
}

/** Convierte gramos a kilogramos (número con decimales). */
export function gramosAKg(gramos: Gramos): number {
  return gramos / 1000;
}

/**
 * Formatea gramos como texto en kg: 4850000 -> "4,850 kg".
 * Muestra hasta 3 decimales solo si existen (ej. 250.5 kg).
 */
export function formatearKg(gramos: Gramos): string {
  const kg = gramosAKg(gramos);
  const formato = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(kg);
  return `${formato} kg`;
}
