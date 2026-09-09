export { formatearSoles, centimosASoles, solesACentimos } from '@shared/domain/money';
export { formatearKg, gramosAKg, kgAGramos } from '@shared/domain/weight';

/** Fecha de hoy en formato YYYY-MM-DD (para inputs date). */
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Muestra una fecha ISO como DD/MM/AAAA. */
export function fechaCorta(iso: string): string {
  if (!iso) return '';
  const soloFecha = iso.slice(0, 10);
  const [y, m, d] = soloFecha.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
