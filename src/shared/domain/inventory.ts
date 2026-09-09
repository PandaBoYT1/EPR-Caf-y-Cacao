/**
 * Inventario (secciones 11 y 29 de la especificación).
 *
 * ENTRADA -> aumenta stock
 * SALIDA  -> disminuye stock
 *
 * REGLA 6: no se permiten ventas superiores al stock disponible
 *          (salvo que se habilite explícitamente por configuración).
 * Todos los pesos en gramos enteros.
 */

export type TipoMovimiento = 'entrada' | 'salida';

export interface MovimientoOpciones {
  /** Si es true, permite que el stock quede negativo (opción administrativa). */
  permitirNegativo?: boolean;
}

export interface ResultadoMovimiento {
  /** Stock resultante en gramos (solo válido si `ok` es true). */
  nuevoStockG: number;
  ok: boolean;
  error?: string;
}

/**
 * Aplica un movimiento de inventario sobre el stock actual y devuelve el nuevo saldo.
 * No lanza excepción: devuelve `ok:false` con el motivo cuando la operación es inválida.
 */
export function aplicarMovimiento(
  stockActualG: number,
  tipo: TipoMovimiento,
  cantidadG: number,
  opciones: MovimientoOpciones = {},
): ResultadoMovimiento {
  if (!(cantidadG > 0)) {
    return { nuevoStockG: stockActualG, ok: false, error: 'La cantidad debe ser mayor que cero.' };
  }

  if (tipo === 'entrada') {
    return { nuevoStockG: stockActualG + cantidadG, ok: true };
  }

  // salida
  const nuevo = stockActualG - cantidadG;
  if (nuevo < 0 && !opciones.permitirNegativo) {
    return {
      nuevoStockG: stockActualG,
      ok: false,
      error: 'No hay stock suficiente para esta salida.',
    };
  }
  return { nuevoStockG: nuevo, ok: true };
}

/**
 * Recalcula el saldo final aplicando una lista ordenada de movimientos
 * desde un stock inicial. Útil para reconstruir el Kardex.
 */
export function calcularSaldo(
  stockInicialG: number,
  movimientos: Array<{ tipo: TipoMovimiento; cantidadG: number }>,
  opciones: MovimientoOpciones = {},
): ResultadoMovimiento {
  let stock = stockInicialG;
  for (const m of movimientos) {
    const r = aplicarMovimiento(stock, m.tipo, m.cantidadG, opciones);
    if (!r.ok) return r;
    stock = r.nuevoStockG;
  }
  return { nuevoStockG: stock, ok: true };
}
