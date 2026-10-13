import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { app } from 'electron';
import { SCHEMA_SQL, SCHEMA_VERSION, MIGRACION_V2_SQL } from './schema';
import { repararLotesConComprasAnuladas } from '../services/lotes';
import { hashPassword } from '../security';

export type Row = Record<string, SqlValue>;
export type Params = SqlValue[];

/** Envoltorio sobre sql.js con API tipo query/run y persistencia a archivo. */
export class Db {
  constructor(
    private sqlDb: Database,
    private filePath: string,
  ) {}

  all<T = Row>(sql: string, params: Params = []): T[] {
    const stmt = this.sqlDb.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Row>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  run(sql: string, params: Params = []): { lastId: number; changes: number } {
    this.sqlDb.run(sql, params);
    const changes = this.sqlDb.getRowsModified();
    const row = this.get<{ id: number }>('SELECT last_insert_rowid() AS id');
    return { lastId: row?.id ?? 0, changes };
  }

  exec(sql: string): void {
    this.sqlDb.run(sql);
  }

  /** Ejecuta `fn` dentro de una transacción y persiste el archivo al confirmar. */
  transaction<T>(fn: () => T): T {
    this.sqlDb.run('BEGIN');
    try {
      const result = fn();
      this.sqlDb.run('COMMIT');
      this.save();
      return result;
    } catch (err) {
      this.sqlDb.run('ROLLBACK');
      throw err;
    }
  }

  /** Escribe la base de datos completa a disco de forma atómica. */
  save(): void {
    const data = Buffer.from(this.sqlDb.export());
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, this.filePath);
  }

  get path(): string {
    return this.filePath;
  }
}

function wasmPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'sql-wasm.wasm')
    : join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

/** Inicializa (o abre) la base de datos, aplica migraciones y semilla. */
export async function initDb(customPath?: string): Promise<Db> {
  const SQL = await initSqlJs({ locateFile: () => wasmPath() });
  const filePath = customPath ?? join(app.getPath('userData'), 'datos.db');
  const sqlDb = existsSync(filePath)
    ? new SQL.Database(readFileSync(filePath))
    : new SQL.Database();
  const db = new Db(sqlDb, filePath);
  migrate(db);
  seed(db);
  return db;
}

/** Inicializa una base de datos en memoria (para pruebas). */
export async function initMemoryDb(): Promise<Db> {
  const SQL = await initSqlJs({ locateFile: () => wasmPathForTests() });
  const db = new Db(new SQL.Database(), ':memory:');
  // save() no escribe cuando la ruta es :memory:
  db.save = () => {};
  migrate(db);
  seed(db);
  return db;
}

function wasmPathForTests(): string {
  return join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

function migrate(db: Db): void {
  const row = db.get<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    db.exec(SCHEMA_SQL);
  }
  if (version < 2) {
    db.transaction(() => {
      db.exec(MIGRACION_V2_SQL);
      // Corrige lotes que conservaban compras ya anuladas (versiones anteriores).
      repararLotesConComprasAnuladas(db);
    });
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  db.save();
}

/** Inserta datos base solo si la tabla está vacía (idempotente). */
function seed(db: Db): void {
  const now = new Date().toISOString();

  // Configuración por defecto
  const cfgDefaults: Record<string, string> = {
    merma_min: '18',
    merma_max: '20',
    muestra_defecto_g: '250',
    permitir_stock_negativo: '0',
    carpeta_respaldo: '',
    moneda: 'PEN',
  };
  for (const [clave, valor] of Object.entries(cfgDefaults)) {
    const exists = db.get('SELECT clave FROM configuraciones WHERE clave = ?', [clave]);
    if (!exists) db.run('INSERT INTO configuraciones (clave, valor) VALUES (?, ?)', [clave, valor]);
  }

  // Productos + estados
  const prodCount = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM productos');
  if ((prodCount?.n ?? 0) === 0) {
    const cafe = db.run(
      'INSERT INTO productos (codigo, nombre, permite_estados, permite_rendimiento, activo) VALUES (?, ?, 1, 1, 1)',
      ['CAFE', 'Café'],
    ).lastId;
    db.run('INSERT INTO productos (codigo, nombre, permite_estados, permite_rendimiento, activo) VALUES (?, ?, 0, 0, 1)', [
      'CACAO',
      'Cacao',
    ]);
    const estados = [
      ['SECO', 'Seco', 1],
      ['SEMISECO', 'Semiseco', 2],
      ['HUMEDO', 'Húmedo', 3],
    ] as const;
    for (const [codigo, nombre, orden] of estados) {
      db.run('INSERT INTO estados_producto (producto_id, codigo, nombre, orden) VALUES (?, ?, ?, ?)', [
        cafe,
        codigo,
        nombre,
        orden,
      ]);
    }
  }

  // Usuario administrador por defecto
  const userCount = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM usuarios');
  if ((userCount?.n ?? 0) === 0) {
    const { hash, salt } = hashPassword('admin123');
    db.run(
      'INSERT INTO usuarios (nombre, usuario, hash, salt, rol, activo, creado_en) VALUES (?, ?, ?, ?, ?, 1, ?)',
      ['Administrador', 'admin', hash, salt, 'ADMINISTRADOR', now],
    );
  }

  db.save();
}
