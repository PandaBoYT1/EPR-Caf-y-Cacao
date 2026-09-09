import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import ExcelJS from 'exceljs';
import type { Db } from '../db/db';
import { getInventario } from './inventario';
import { kardexEntrada, type FiltroKardex } from './compras';
import { kardexSalida } from './ventas';
import { getConfig } from './catalogos';
import { gramosAKg, formatearKg } from '../../shared/domain/weight';
import { centimosASoles, formatearSoles } from '../../shared/domain/money';

const kg = (g: number) => gramosAKg(g);
const soles = (c: number) => centimosASoles(c);

// -------- Paleta y formatos --------
const COLORES = {
  cafe: 'FF6F4E37',
  verde: 'FF2E7D32',
  azul: 'FF1565C0',
  naranja: 'FFEF7C1A',
  gris: 'FF455A64',
};
const FMT_SOLES = '"S/ "#,##0.00';
const FMT_KG = '#,##0.###" kg"';
const FMT_FACTOR = '0.00';

interface Col {
  header: string;
  key: string;
  width: number;
  fmt?: string;
  align?: 'left' | 'right' | 'center';
}

function lighten(argb: string, amt: number): string {
  const r = parseInt(argb.slice(2, 4), 16);
  const g = parseInt(argb.slice(4, 6), 16);
  const b = parseInt(argb.slice(6, 8), 16);
  const mix = (x: number) => Math.round(x + (255 - x) * amt);
  return 'FF' + [mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function bordes(argb: string): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb } };
  return { top: s, left: s, bottom: s, right: s };
}

/** Crea una hoja con título de color, encabezados con fondo, bordes y filas alternadas. */
function hojaTabla(wb: ExcelJS.Workbook, nombre: string, titulo: string, headerArgb: string, columnas: Col[], filas: any[]) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 2 }] });
  const n = columnas.length;

  // Fila 1: título
  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerArgb } };
  ws.getRow(1).height = 26;

  // Fila 2: encabezados
  const head = ws.getRow(2);
  columnas.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FF333333' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lighten(headerArgb, 0.72) } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = bordes('FFB0B0B0');
    ws.getColumn(i + 1).width = c.width;
    if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt;
  });
  head.height = 20;

  // Datos
  filas.forEach((f, idx) => {
    const row = ws.addRow(columnas.map((c) => f[c.key] ?? ''));
    row.eachCell((cell, col) => {
      const c = columnas[col - 1]!;
      cell.border = bordes('FFE0E0E0');
      cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle' };
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
    });
  });

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: n } };
  return ws;
}

function hojaResumen(wb: ExcelJS.Workbook, db: Db, f: FiltroKardex) {
  const ws = wb.addWorksheet('Resumen');
  for (let c = 1; c <= 8; c++) ws.getColumn(c).width = 15;

  ws.mergeCells('A1:H1');
  const t = ws.getCell('A1');
  t.value = 'REPORTE DE ACOPIO · CAFÉ Y CACAO';
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORES.cafe } };
  ws.getRow(1).height = 32;

  ws.mergeCells('A2:H2');
  const sub = ws.getCell('A2');
  const rango = f.fecha_desde || f.fecha_hasta ? ` · Periodo: ${f.fecha_desde ?? '…'} a ${f.fecha_hasta ?? '…'}` : ' · Todo el historial';
  sub.value = `Generado: ${new Date().toLocaleString('es-PE')}${rango}`;
  sub.font = { italic: true, color: { argb: 'FF757575' } };
  sub.alignment = { horizontal: 'center' };

  const inv = getInventario(db);
  const cafeStock = inv.filter((b) => b.producto_nombre.toLowerCase().includes('caf')).reduce((s, b) => s + b.gramos, 0);
  const cacaoStock = inv.filter((b) => b.producto_nombre.toLowerCase().includes('cacao')).reduce((s, b) => s + b.gramos, 0);
  const comprasTot = (comprasPorProveedor(db, f) as any[]).reduce((s, r) => s + r.total, 0);
  const ventasTot = (ventasPorComprador(db, f) as any[]).reduce((s, r) => s + r.total, 0);

  const kpis = [
    { label: 'Café en stock', val: formatearKg(cafeStock), color: COLORES.verde },
    { label: 'Cacao en stock', val: formatearKg(cacaoStock), color: COLORES.cafe },
    { label: 'Compras', val: formatearSoles(comprasTot), color: COLORES.azul },
    { label: 'Ventas', val: formatearSoles(ventasTot), color: COLORES.naranja },
  ];
  kpis.forEach((k, i) => {
    const c0 = 1 + i * 2;
    ws.mergeCells(4, c0, 6, c0 + 1);
    const cell = ws.getCell(4, c0);
    cell.value = {
      richText: [
        { font: { color: { argb: 'FFFFFFFF' }, size: 11 }, text: `${k.label}\n` },
        { font: { color: { argb: 'FFFFFFFF' }, size: 20, bold: true }, text: k.val },
      ],
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.color } };
    cell.border = bordes('FFFFFFFF');
  });
  [4, 5, 6].forEach((r) => (ws.getRow(r).height = 24));

  // Inventario detallado por estado
  ws.mergeCells('A8:H8');
  const it = ws.getCell('A8');
  it.value = 'Inventario por producto y estado';
  it.font = { bold: true, size: 12, color: { argb: 'FF333333' } };
  let fila = 9;
  ws.getCell(`A${fila}`).value = 'Producto';
  ws.getCell(`B${fila}`).value = 'Estado';
  ws.getCell(`C${fila}`).value = 'Stock (kg)';
  ['A', 'B', 'C'].forEach((c) => {
    const cell = ws.getCell(`${c}${fila}`);
    cell.font = { bold: true, color: { argb: 'FF333333' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lighten(COLORES.cafe, 0.72) } };
    cell.border = bordes('FFB0B0B0');
  });
  inv.forEach((b, i) => {
    fila++;
    ws.getCell(`A${fila}`).value = b.producto_nombre;
    ws.getCell(`B${fila}`).value = b.estado_nombre ?? '—';
    const v = ws.getCell(`C${fila}`);
    v.value = kg(b.gramos);
    v.numFmt = FMT_KG;
    ['A', 'B', 'C'].forEach((c) => {
      const cell = ws.getCell(`${c}${fila}`);
      cell.border = bordes('FFE0E0E0');
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
    });
  });
}

// -------- Consultas de reportes --------

export function comprasPorProveedor(db: Db, f: FiltroKardex = {}) {
  return db.all(
    `SELECT pr.nombre AS proveedor, COUNT(DISTINCT c.id) AS operaciones,
            COALESCE(SUM(d.gramos), 0) AS gramos, COALESCE(SUM(d.total_centimos), 0) AS total
     FROM compras c JOIN detalle_compras d ON d.compra_id = c.id
     JOIN proveedores pr ON pr.id = c.proveedor_id
     WHERE c.anulada = 0
       ${f.fecha_desde ? 'AND c.fecha >= ?' : ''} ${f.fecha_hasta ? 'AND c.fecha <= ?' : ''}
     GROUP BY pr.id ORDER BY total DESC`,
    [f.fecha_desde, f.fecha_hasta].filter(Boolean) as string[],
  );
}

export function ventasPorComprador(db: Db, f: FiltroKardex = {}) {
  return db.all(
    `SELECT co.nombre AS comprador, COUNT(DISTINCT v.id) AS operaciones,
            COALESCE(SUM(d.gramos), 0) AS gramos, COALESCE(SUM(d.total_centimos), 0) AS total
     FROM ventas v JOIN detalle_ventas d ON d.venta_id = v.id
     JOIN compradores co ON co.id = v.comprador_id
     WHERE v.anulada = 0
       ${f.fecha_desde ? 'AND v.fecha >= ?' : ''} ${f.fecha_hasta ? 'AND v.fecha <= ?' : ''}
     GROUP BY co.id ORDER BY total DESC`,
    [f.fecha_desde, f.fecha_hasta].filter(Boolean) as string[],
  );
}

export function historialRendimiento(db: Db, f: FiltroKardex = {}) {
  return db.all(
    `SELECT c.codigo, c.fecha, pr.nombre AS proveedor,
            r.muestra_g, r.pilado_g, r.almendra_g, r.merma_g, r.merma_pct, r.factor
     FROM rendimientos r
     JOIN detalle_compras d ON d.rendimiento_id = r.id
     JOIN compras c ON c.id = d.compra_id
     JOIN proveedores pr ON pr.id = c.proveedor_id
     WHERE c.anulada = 0
       ${f.fecha_desde ? 'AND c.fecha >= ?' : ''} ${f.fecha_hasta ? 'AND c.fecha <= ?' : ''}
     ORDER BY c.fecha DESC, c.id DESC`,
    [f.fecha_desde, f.fecha_hasta].filter(Boolean) as string[],
  );
}

/** Construye un libro de Excel con formato profesional y varias hojas. */
export async function construirLibro(db: Db, f: FiltroKardex = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Acopio Café y Cacao';
  wb.created = new Date();

  hojaResumen(wb, db, f);

  hojaTabla(
    wb,
    'Compras por proveedor',
    'COMPRAS POR PROVEEDOR',
    COLORES.verde,
    [
      { header: 'Proveedor', key: 'proveedor', width: 28 },
      { header: 'Operaciones', key: 'operaciones', width: 14, align: 'center' },
      { header: 'Cantidad', key: 'gramos', width: 16, fmt: FMT_KG, align: 'right' },
      { header: 'Total', key: 'total', width: 16, fmt: FMT_SOLES, align: 'right' },
    ],
    (comprasPorProveedor(db, f) as any[]).map((r) => ({ ...r, gramos: kg(r.gramos), total: soles(r.total) })),
  );

  hojaTabla(
    wb,
    'Ventas por comprador',
    'VENTAS POR COMPRADOR',
    COLORES.azul,
    [
      { header: 'Comprador', key: 'comprador', width: 28 },
      { header: 'Operaciones', key: 'operaciones', width: 14, align: 'center' },
      { header: 'Cantidad', key: 'gramos', width: 16, fmt: FMT_KG, align: 'right' },
      { header: 'Total', key: 'total', width: 16, fmt: FMT_SOLES, align: 'right' },
    ],
    (ventasPorComprador(db, f) as any[]).map((r) => ({ ...r, gramos: kg(r.gramos), total: soles(r.total) })),
  );

  hojaTabla(
    wb,
    'Kardex Entradas',
    'KARDEX DE ENTRADAS (COMPRAS)',
    COLORES.verde,
    [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Fecha', key: 'fecha', width: 12, align: 'center' },
      { header: 'Proveedor', key: 'proveedor_nombre', width: 26 },
      { header: 'Producto', key: 'producto_nombre', width: 12 },
      { header: 'Estado', key: 'estado_nombre', width: 12 },
      { header: 'Cantidad', key: 'gramos', width: 14, fmt: FMT_KG, align: 'right' },
      { header: 'Precio/kg', key: 'precio', width: 14, fmt: FMT_SOLES, align: 'right' },
      { header: 'Total', key: 'total', width: 16, fmt: FMT_SOLES, align: 'right' },
      { header: 'Factor', key: 'factor', width: 10, fmt: FMT_FACTOR, align: 'right' },
      { header: 'Anulada', key: 'anulada', width: 10, align: 'center' },
    ],
    kardexEntrada(db, { ...f, incluir_anuladas: true }).map((r) => ({
      codigo: r.codigo, fecha: r.fecha, proveedor_nombre: r.proveedor_nombre, producto_nombre: r.producto_nombre,
      estado_nombre: r.estado_nombre ?? '—', gramos: kg(r.gramos), precio: soles(r.precio_centimos_kg),
      total: soles(r.total_centimos), factor: r.factor ?? '', anulada: r.anulada ? 'SÍ' : '',
    })),
  );

  hojaTabla(
    wb,
    'Kardex Salidas',
    'KARDEX DE SALIDAS (VENTAS)',
    COLORES.azul,
    [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Fecha', key: 'fecha', width: 12, align: 'center' },
      { header: 'Comprador', key: 'comprador_nombre', width: 26 },
      { header: 'Producto', key: 'producto_nombre', width: 12 },
      { header: 'Estado', key: 'estado_nombre', width: 12 },
      { header: 'Lote', key: 'lote_codigo', width: 12 },
      { header: 'Cantidad', key: 'gramos', width: 14, fmt: FMT_KG, align: 'right' },
      { header: 'Precio/kg', key: 'precio', width: 14, fmt: FMT_SOLES, align: 'right' },
      { header: 'Total', key: 'total', width: 16, fmt: FMT_SOLES, align: 'right' },
      { header: 'Anulada', key: 'anulada', width: 10, align: 'center' },
    ],
    kardexSalida(db, { ...f, incluir_anuladas: true }).map((r) => ({
      codigo: r.codigo, fecha: r.fecha, comprador_nombre: r.comprador_nombre, producto_nombre: r.producto_nombre,
      estado_nombre: r.estado_nombre ?? '—', lote_codigo: r.lote_codigo ?? '—', gramos: kg(r.gramos),
      precio: soles(r.precio_centimos_kg), total: soles(r.total_centimos), anulada: r.anulada ? 'SÍ' : '',
    })),
  );

  hojaTabla(
    wb,
    'Rendimientos',
    'HISTORIAL DE RENDIMIENTO DEL CAFÉ',
    COLORES.naranja,
    [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Fecha', key: 'fecha', width: 12, align: 'center' },
      { header: 'Proveedor', key: 'proveedor', width: 26 },
      { header: 'Muestra (g)', key: 'muestra_g', width: 12, align: 'right' },
      { header: 'Pilado (g)', key: 'pilado_g', width: 12, align: 'right' },
      { header: 'Almendra (g)', key: 'almendra_g', width: 12, align: 'right' },
      { header: 'Merma (g)', key: 'merma_g', width: 12, align: 'right' },
      { header: 'Merma %', key: 'merma_pct', width: 12, fmt: FMT_FACTOR, align: 'right' },
      { header: 'Factor', key: 'factor', width: 10, fmt: FMT_FACTOR, align: 'right' },
    ],
    historialRendimiento(db, f) as any[],
  );

  return (await wb.xlsx.writeBuffer()) as Buffer;
}

/** Copia el archivo de datos y un Excel a la carpeta de respaldo (ej. Google Drive). */
export async function respaldar(db: Db): Promise<{ carpeta: string; archivos: string[] }> {
  db.save();
  const carpeta = getConfig(db).carpeta_respaldo;
  if (!carpeta) throw new Error('No hay carpeta de respaldo configurada. Ve a Configuración y elige una.');
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });

  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destDb = join(carpeta, `datos-${sello}.db`);
  copyFileSync(db.path, destDb);

  const buf = await construirLibro(db, {});
  const destXlsx = join(carpeta, `reporte-${sello}.xlsx`);
  writeFileSync(destXlsx, buf);

  return { carpeta, archivos: [basename(destDb), basename(destXlsx)] };
}
