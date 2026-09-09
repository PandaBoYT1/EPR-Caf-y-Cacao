/** Esquema de la base de datos (migración v1). Ver ARQUITECTURA.md. */

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS configuraciones (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'TRABAJADOR',
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  permite_estados INTEGER NOT NULL DEFAULT 0,
  permite_rendimiento INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS estados_producto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'AGRICULTOR',
  documento TEXT,
  telefono TEXT,
  comunidad TEXT,
  obs TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'MAYORISTA',
  documento TEXT,
  telefono TEXT,
  direccion TEXT,
  contacto TEXT,
  obs TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rendimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  muestra_g INTEGER NOT NULL,
  pilado_g INTEGER NOT NULL,
  almendra_g INTEGER NOT NULL,
  merma_g INTEGER NOT NULL,
  merma_pct REAL NOT NULL,
  defectos_g INTEGER NOT NULL,
  factor REAL NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  fecha TEXT NOT NULL,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  total_centimos INTEGER NOT NULL DEFAULT 0,
  obs TEXT,
  anulada INTEGER NOT NULL DEFAULT 0,
  anulada_motivo TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS detalle_compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  estado_id INTEGER REFERENCES estados_producto(id),
  gramos INTEGER NOT NULL,
  precio_centimos_kg INTEGER NOT NULL,
  total_centimos INTEGER NOT NULL,
  rendimiento_id INTEGER REFERENCES rendimientos(id)
);

CREATE TABLE IF NOT EXISTS lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  estado_id INTEGER REFERENCES estados_producto(id),
  gramos INTEGER NOT NULL DEFAULT 0,
  estado_lote TEXT NOT NULL DEFAULT 'DISPONIBLE',
  obs TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lote_detalle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  detalle_compra_id INTEGER REFERENCES detalle_compras(id),
  gramos INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  fecha TEXT NOT NULL,
  comprador_id INTEGER NOT NULL REFERENCES compradores(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  total_centimos INTEGER NOT NULL DEFAULT 0,
  obs TEXT,
  anulada INTEGER NOT NULL DEFAULT 0,
  anulada_motivo TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS detalle_ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  estado_id INTEGER REFERENCES estados_producto(id),
  lote_id INTEGER REFERENCES lotes(id),
  gramos INTEGER NOT NULL,
  precio_centimos_kg INTEGER NOT NULL,
  total_centimos INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  estado_id INTEGER REFERENCES estados_producto(id),
  tipo TEXT NOT NULL,
  gramos INTEGER NOT NULL,
  saldo_g INTEGER NOT NULL,
  ref_tipo TEXT,
  ref_id INTEGER,
  creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mov_prod ON movimientos_inventario(producto_id, estado_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
`;
