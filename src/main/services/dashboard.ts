import type { Db } from '../db/db';
import type { DashboardResumen, PeriodoResumen } from '../../shared/types';
import { getInventario } from './inventario';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha local YYYY-MM-DD (no UTC, para coincidir con las fechas capturadas). */
function fechaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lunes de la semana actual. */
function inicioSemana(): string {
  const d = new Date();
  const desplazamiento = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - desplazamiento);
  return fechaLocal(d);
}

function inicioMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** Agrega compras y ventas (no anuladas) desde una fecha dada (inclusive). */
function agregarPeriodo(db: Db, desde: string): PeriodoResumen {
  const c = db.get<{ n: number; t: number }>(
    'SELECT COUNT(*) AS n, COALESCE(SUM(total_centimos), 0) AS t FROM compras WHERE anulada = 0 AND fecha >= ?',
    [desde],
  );
  const cg = db.get<{ g: number }>(
    `SELECT COALESCE(SUM(d.gramos), 0) AS g FROM detalle_compras d
     JOIN compras c ON c.id = d.compra_id WHERE c.anulada = 0 AND c.fecha >= ?`,
    [desde],
  );
  const v = db.get<{ n: number; t: number }>(
    'SELECT COUNT(*) AS n, COALESCE(SUM(total_centimos), 0) AS t FROM ventas WHERE anulada = 0 AND fecha >= ?',
    [desde],
  );
  const vg = db.get<{ g: number }>(
    `SELECT COALESCE(SUM(d.gramos), 0) AS g FROM detalle_ventas d
     JOIN ventas v ON v.id = d.venta_id WHERE v.anulada = 0 AND v.fecha >= ?`,
    [desde],
  );
  return {
    compras_centimos: c?.t ?? 0,
    compras_n: c?.n ?? 0,
    compras_g: cg?.g ?? 0,
    ventas_centimos: v?.t ?? 0,
    ventas_n: v?.n ?? 0,
    ventas_g: vg?.g ?? 0,
  };
}

export function resumen(db: Db): DashboardResumen {
  const inv = getInventario(db);
  const cafe = inv.filter((b) => b.producto_nombre.toLowerCase().includes('caf'));
  const cacao = inv.filter((b) => b.producto_nombre.toLowerCase().includes('cacao'));

  const lotesDisp = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM lotes WHERE estado_lote IN ('DISPONIBLE','PARCIAL')",
  );

  return {
    cafe_total_g: cafe.reduce((s, b) => s + b.gramos, 0),
    cacao_total_g: cacao.reduce((s, b) => s + b.gramos, 0),
    cafe_por_estado: cafe,
    lotes_disponibles: lotesDisp?.n ?? 0,
    hoy: agregarPeriodo(db, fechaLocal()),
    semana: agregarPeriodo(db, inicioSemana()),
    mes: agregarPeriodo(db, inicioMes()),
  };
}
