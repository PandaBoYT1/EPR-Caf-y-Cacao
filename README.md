# Acopio Café y Cacao

Aplicación de escritorio **local para Windows** para digitalizar el Kardex de un negocio de
acopio y comercialización de café y cacao. Un solo instalador, sin dependencias externas.

## Cómo ejecutar en modo desarrollo

```bash
npm install
npm run dev
```

Se abre la ventana de la aplicación. Acceso inicial:

- **Usuario:** `admin`
- **Contraseña:** `admin123`  (cámbiala en *Configuración → Usuarios*)

## Cómo crear el instalador `.exe`

```bash
npm run dist
```

El instalador queda en la carpeta `release/`. El usuario final solo ejecuta ese `.exe`
(no necesita instalar Node, ni base de datos, ni nada más).

## Cómo correr las pruebas

```bash
npm test
```

Verifica las reglas de negocio (rendimiento, inventario, dinero) y el flujo completo
compra → inventario → venta con base de datos real. **30 pruebas.**

## Dónde se guardan los datos

Toda la información vive en un único archivo `datos.db` (SQLite) dentro de la carpeta de
datos de la app (`%APPDATA%/cafe-cacao-acopio`). Para respaldar a **Google Drive**:

1. Instala *Google Drive para escritorio*.
2. En la app: **Configuración → Respaldo → Elegir carpeta** y selecciona una carpeta
   dentro de tu Google Drive.
3. Cuando quieras, ve a **Reportes → Respaldar ahora**: copia `datos.db` + un Excel
   con fecha; Drive los sube solos a la nube.

## Estructura del proyecto

```
src/
  shared/domain/     Reglas de negocio puras (rendimiento, inventario, dinero) + pruebas
  main/              Proceso principal Electron
    db/              Base de datos SQLite (sql.js) + esquema + semilla
    services/        Lógica: compras, ventas, inventario, lotes, reportes…
    ipc.ts           Canales de comunicación con la interfaz
  preload/           Puente seguro
  renderer/          Interfaz React + Tailwind (pantallas)
```

## Tecnologías y por qué

Ver [ARQUITECTURA.md](ARQUITECTURA.md).
