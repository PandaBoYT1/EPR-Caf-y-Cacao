/** Tipos de datos compartidos entre el proceso principal (Electron) y la interfaz. */

export type Rol = 'ADMINISTRADOR' | 'TRABAJADOR';

export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  rol: Rol;
  activo: number;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  permite_estados: number;
  permite_rendimiento: number;
  activo: number;
}

export interface EstadoProducto {
  id: number;
  producto_id: number;
  codigo: string;
  nombre: string;
  orden: number;
}

export type TipoProveedor = 'AGRICULTOR' | 'PRODUCTOR' | 'COMERCIANTE' | 'OTRO';

export interface Proveedor {
  id: number;
  nombre: string;
  tipo: TipoProveedor;
  documento: string | null;
  telefono: string | null;
  comunidad: string | null;
  obs: string | null;
  activo: number;
  creado_en: string;
}

export type TipoComprador = 'COOPERATIVA' | 'MAYORISTA' | 'OTRO';

export interface Comprador {
  id: number;
  nombre: string;
  tipo: TipoComprador;
  documento: string | null;
  telefono: string | null;
  direccion: string | null;
  contacto: string | null;
  obs: string | null;
  activo: number;
  creado_en: string;
}

export interface Rendimiento {
  id: number;
  muestra_g: number;
  pilado_g: number;
  almendra_g: number;
  merma_g: number;
  merma_pct: number;
  defectos_g: number;
  rendimiento_pct: number | null;
  factor: number;
}

export type EstadoLote = 'DISPONIBLE' | 'PARCIAL' | 'VENDIDO' | 'CERRADO' | 'ANULADO';

export interface Lote {
  id: number;
  codigo: string;
  producto_id: number;
  estado_id: number | null;
  gramos: number;
  estado_lote: EstadoLote;
  /** Lote destino si este lote se cerró por fusión. */
  fusionado_en: number | null;
  obs: string | null;
  creado_en: string;
  producto_nombre?: string;
  estado_nombre?: string | null;
  /** Precio promedio de compra del lote (céntimos por kg, ponderado). */
  costo_prom_centimos_kg?: number;
}

/** Fila del Kardex de entrada (compra + su detalle). */
export interface FilaKardexEntrada {
  id: number;
  codigo: string;
  fecha: string;
  proveedor_nombre: string;
  producto_nombre: string;
  estado_nombre: string | null;
  gramos: number;
  precio_centimos_kg: number;
  total_centimos: number;
  rendimiento_pct: number | null;
  factor: number | null;
  anulada: number;
}

/** Fila del Kardex de salida (venta + su detalle). */
export interface FilaKardexSalida {
  id: number;
  codigo: string;
  fecha: string;
  comprador_nombre: string;
  producto_nombre: string;
  estado_nombre: string | null;
  lote_codigo: string | null;
  gramos: number;
  precio_centimos_kg: number;
  total_centimos: number;
  anulada: number;
}

export interface InventarioBucket {
  producto_id: number;
  producto_nombre: string;
  estado_id: number | null;
  estado_nombre: string | null;
  gramos: number;
}

export interface PeriodoResumen {
  compras_centimos: number;
  ventas_centimos: number;
  compras_g: number;
  ventas_g: number;
  compras_n: number;
  ventas_n: number;
}

export interface DashboardResumen {
  cafe_total_g: number;
  cacao_total_g: number;
  cafe_por_estado: InventarioBucket[];
  lotes_disponibles: number;
  hoy: PeriodoResumen;
  semana: PeriodoResumen;
  mes: PeriodoResumen;
}

// -------- Payloads de creación --------

export interface NuevaCompra {
  fecha: string;
  proveedor_id: number;
  usuario_id: number;
  producto_id: number;
  estado_id: number | null;
  kg: number;
  precio_soles: number;
  rendimiento?: { muestraInicialG: number; pesoPiladoG: number; almendraSanaG: number } | null;
  obs?: string;
}

export interface NuevaVenta {
  fecha: string;
  comprador_id: number;
  usuario_id: number;
  producto_id: number;
  estado_id: number | null;
  lote_id: number | null;
  kg: number;
  precio_soles: number;
  obs?: string;
}

export interface NuevoLote {
  producto_id: number;
  estado_id: number | null;
  obs?: string;
  entradas: number[]; // ids de detalle_compras
  /** Si se indica, las entradas se agregan a este lote existente. */
  lote_id?: number | null;
  /** Forzar la creación de un lote nuevo aunque exista uno abierto. */
  forzar_nuevo?: boolean;
}
