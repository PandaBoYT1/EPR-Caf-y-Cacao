import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type { Db } from './db/db';
import * as auth from './services/auth';
import * as catalogos from './services/catalogos';
import * as personas from './services/personas';
import * as compras from './services/compras';
import * as ventas from './services/ventas';
import * as lotes from './services/lotes';
import * as inventario from './services/inventario';
import * as dashboard from './services/dashboard';
import * as reportes from './services/reportes';

type Handler = (db: Db, payload: any, win: BrowserWindow | null) => any;

const handlers: Record<string, Handler> = {
  // Autenticación / usuarios
  'auth:login': (db, p) => auth.login(db, p.usuario, p.password),
  'usuarios:listar': (db) => auth.listarUsuarios(db),
  'usuarios:crear': (db, p) => auth.crearUsuario(db, p),
  'usuarios:password': (db, p) => auth.cambiarPassword(db, p.usuario_id, p.password),
  'usuarios:activar': (db, p) => auth.activarUsuario(db, p.usuario_id, p.activo),

  // Catálogos / configuración
  'catalogos:productos': (db) => catalogos.listarProductos(db),
  'catalogos:estados': (db, p) => catalogos.listarEstados(db, p.producto_id),
  'config:get': (db) => catalogos.getConfig(db),
  'config:set': (db, p) => catalogos.setConfig(db, p.clave, p.valor),

  // Proveedores
  'proveedores:listar': (db, p) => personas.listarProveedores(db, p?.soloActivos ?? true),
  'proveedores:crear': (db, p) => personas.crearProveedor(db, p),
  'proveedores:actualizar': (db, p) => personas.actualizarProveedor(db, p.id, p),
  'proveedores:historial': (db, p) => personas.historialProveedor(db, p.id),

  // Compradores
  'compradores:listar': (db, p) => personas.listarCompradores(db, p?.soloActivos ?? true),
  'compradores:crear': (db, p) => personas.crearComprador(db, p),
  'compradores:actualizar': (db, p) => personas.actualizarComprador(db, p.id, p),
  'compradores:historial': (db, p) => personas.historialComprador(db, p.id),

  // Compras / Kardex entrada
  'compras:registrar': (db, p) => compras.registrarCompra(db, p),
  'compras:anular': (db, p) => compras.anularCompra(db, p.id, p.motivo),
  'compras:kardex': (db, p) => compras.kardexEntrada(db, p ?? {}),
  'compras:entradasParaLote': (db, p) => compras.entradasDisponiblesParaLote(db, p.producto_id, p.estado_id),

  // Ventas / Kardex salida
  'ventas:registrar': (db, p) => ventas.registrarVenta(db, p),
  'ventas:anular': (db, p) => ventas.anularVenta(db, p.id, p.motivo),
  'ventas:kardex': (db, p) => ventas.kardexSalida(db, p ?? {}),
  'ventas:precioPromedio': (db, p) => ventas.precioPromedioVenta(db, p.producto_id, p.estado_id),

  // Lotes
  'lotes:crear': (db, p) => lotes.crearLote(db, p),
  'lotes:listar': (db, p) => lotes.listarLotes(db, p?.soloDisponibles ?? false),
  'lotes:detalle': (db, p) => lotes.detalleLote(db, p.id),
  'lotes:abierto': (db, p) => lotes.loteAbiertoDe(db, p.producto_id, p.estado_id) ?? null,
  'lotes:fusionar': (db, p) => lotes.fusionarLotes(db, p.destino_id, p.origen_ids),
  'lotes:fusionarDuplicados': (db) => lotes.fusionarDuplicados(db),

  // Inventario
  'inventario:get': (db) => inventario.getInventario(db),
  'inventario:stock': (db, p) => inventario.stockDe(db, p.producto_id, p.estado_id),

  // Dashboard
  'dashboard:resumen': (db) => dashboard.resumen(db),

  // Reportes
  'reportes:comprasPorProveedor': (db, p) => reportes.comprasPorProveedor(db, p ?? {}),
  'reportes:ventasPorComprador': (db, p) => reportes.ventasPorComprador(db, p ?? {}),
  'reportes:rendimientos': (db, p) => reportes.historialRendimiento(db, p ?? {}),

  // Exportar Excel (abre diálogo para elegir dónde guardar)
  'reportes:exportarExcel': async (db, p, win) => {
    const buf = await reportes.construirLibro(db, p ?? {});
    const sello = new Date().toISOString().slice(0, 10);
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: `reporte-acopio-${sello}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    writeFileSync(res.filePath, buf);
    return { canceled: false, path: res.filePath };
  },

  // Respaldo a carpeta (Drive)
  'backup:elegirCarpeta': async (db, _p, win) => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    catalogos.setConfig(db, 'carpeta_respaldo', res.filePaths[0]);
    return { canceled: false, path: res.filePaths[0] };
  },
  'backup:ejecutar': (db) => reportes.respaldar(db),
};

/** Registra todos los canales IPC. Cada respuesta es { ok, data } o { ok:false, error }. */
export function registrarIpc(db: Db): void {
  for (const [canal, fn] of Object.entries(handlers)) {
    ipcMain.handle(canal, async (event, payload) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        const data = await fn(db, payload, win);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });
  }
}
