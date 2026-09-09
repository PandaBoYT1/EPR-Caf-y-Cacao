/**
 * Códigos únicos de operación (REGLA 7).
 *   ENT-000001  compras / entradas
 *   VEN-000001  ventas / salidas
 *   CAF-0001    lotes de café
 *   CAC-0001    lotes de cacao
 */

export const PREFIJOS = {
  ENTRADA: 'ENT',
  VENTA: 'VEN',
  LOTE_CAFE: 'CAF',
  LOTE_CACAO: 'CAC',
} as const;

/** Construye un código: formatearCodigo('ENT', 23) -> "ENT-000023". */
export function formatearCodigo(prefijo: string, numero: number, ancho = 6): string {
  return `${prefijo}-${String(numero).padStart(ancho, '0')}`;
}
