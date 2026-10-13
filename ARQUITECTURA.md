# Café & Cacao — Sistema de Acopio y Comercialización

Aplicación de escritorio **local para Windows** (un solo instalador, sin dependencias externas)
para digitalizar el Kardex manual de un negocio de **acopio y comercialización de café y cacao**.

---

## 1. Decisiones de arquitectura y por qué

| Área | Elección | Justificación |
|------|----------|---------------|
| Empaquetado | **Electron + electron-builder** | Genera **un único instalador `.exe`**. El usuario final instala ese archivo y nada más. |
| Interfaz | **React + TypeScript + Vite + Tailwind CSS** | Componentes grandes/accesibles, responsive PC-tablet, tipado seguro para cálculos de dinero. |
| Base de datos | **SQLite** (archivo local `datos.db`) | Sin servidor que instalar; transaccional (integridad de inventario); fácil de respaldar (copiar un archivo). |
| Acceso a datos | **Drizzle ORM** | Tipado en TypeScript, migraciones versionadas, SQL claro. |
| Exportar Excel | **ExcelJS** | `.xlsx` con formato, sin dependencias nativas. |
| Contraseñas | **scrypt** (módulo `crypto` nativo de Node) | Sin librerías extra; hash seguro. |
| Respaldo Drive | **Carpeta configurable** | Se apunta a la carpeta de *Google Drive para escritorio* y sincroniza solo. |

### Reglas de precisión (REGLA 2 y 3 de la especificación)
- **Dinero** → se guarda en **céntimos enteros** (S/ 1.00 = 100). Nunca `float`.
- **Peso** → se guarda en **gramos enteros** (250 kg = 250 000 g). Se muestra en kg.
- Todo cálculo redondea **una sola vez, al final**.

---

## 2. Modelo de datos (normalizado)

```
usuarios (id, nombre, usuario, hash, rol, activo)
roles: ADMINISTRADOR | TRABAJADOR
proveedores (id, nombre, tipo, documento?, telefono?, comunidad?, obs?, activo)
compradores (id, nombre, tipo, documento?, telefono?, direccion?, contacto?, obs?, activo)
productos (id, codigo, nombre, activo)                 -- café, cacao, extensible
estados_producto (id, producto_id, codigo, nombre)     -- seco, semiseco, húmedo
compras (id, codigo ENT-000001, fecha, proveedor_id, usuario_id, obs, anulada)
detalle_compras (id, compra_id, producto_id, estado_id?, gramos, precio_centimos_kg, total_centimos, rendimiento_id?)
rendimientos (id, muestra_g, pilado_g, almendra_g, merma_g, merma_pct, defectos_g, rendimiento_pct, factor)
lotes (id, codigo CAF-0001, producto_id, estado_id?, gramos, estado_lote, fusionado_en?, obs)
lote_detalle (id, lote_id, compra_detalle_id, gramos)
ventas (id, codigo VEN-000001, fecha, comprador_id, usuario_id, obs, anulada)
detalle_ventas (id, venta_id, producto_id, lote_id?, gramos, precio_centimos_kg, total_centimos)
venta_lotes (id, detalle_venta_id, lote_id, gramos)    -- de qué lote(s) salió cada venta
movimientos_inventario (id, fecha, producto_id, estado_id?, tipo, gramos, ref_tipo, ref_id, saldo_g)
configuraciones (clave, valor)                          -- merma_min, merma_max, carpeta_respaldo, etc.
```

Preparado para agregar después (sin reescribir): gastos, pagos, cuentas por cobrar/pagar,
rentabilidad por lote, múltiples almacenes/sucursales, trazabilidad completa.

---

## 3. Reglas de negocio centrales

**Rendimiento del café** (sección 7): el usuario ingresa solo 3 pesos; el sistema calcula todo.
```
merma_g      = muestra − pilado                 (cáscara; 200 g → 160 g = 40 g = 20 %)
merma_%      = merma_g / muestra × 100
defectos     = pilado − almendra_sana           (granos malos)
RENDIMIENTO  = almendra_sana / (muestra / 100)  (200 g → ÷2, 300 g → ÷3; 140 g / 2 = 70)
FACTOR       = (70 × muestra) / almendra_sana
```
Advertencia (no bloquea) si la merma sale del rango de referencia **18–20 %** (configurable).

**Inventario**: entrada suma, salida resta. No se permite stock negativo (salvo config admin).

**Lotes y stock**: los lotes de un producto+estado nunca suman más que su stock.
- Venta con lote → sale de ese lote. Venta sin lote → sale primero del stock suelto (compras sin
  lote) y luego de los lotes abiertos más antiguos. Cada descuento queda en `venta_lotes`.
- Anular venta → el producto vuelve al inventario y a los lotes de los que salió (si el lote se
  fusionó, al lote destino).
- Anular compra → se retira de su lote; si el lote queda sin entradas ni saldo pasa a ANULADO.
  No se permite si su producto ya se vendió (anular primero la venta).
- Estados de lote: DISPONIBLE, PARCIAL, VENDIDO, CERRADO (fusionado), ANULADO.

**Historial**: las operaciones se **anulan**, nunca se borran (REGLA 1 y 8).

---

## 4. Hoja de ruta (fases con verificación)

- [x] **Fase 0** — Arquitectura + núcleo de reglas (rendimiento, inventario, dinero) **con pruebas**
- [x] **Fase 1** — Estructura Electron + ventana + base de datos + migraciones + semilla
- [x] **Fase 2** — Login y usuarios (ADMIN / TRABAJADOR)
- [x] **Fase 3** — Proveedores y compradores
- [x] **Fase 4** — Compras + Kardex de entrada + cálculo de rendimiento en pantalla
- [x] **Fase 5** — Inventario
- [x] **Fase 6** — Lotes
- [x] **Fase 7** — Ventas + Kardex de salida
- [x] **Fase 8** — Dashboard
- [x] **Fase 9** — Reportes + exportación a Excel + respaldo a carpeta/Drive
- [~] **Fase 10** — Pruebas integrales (30 pruebas ✓, arranque verificado). Empaquetado del instalador: `npm run dist` (pendiente de ejecutar por ti)

> Cada fase se verifica antes de pasar a la siguiente. Ninguna regla de negocio no
> especificada se inventa: se marca y se ofrece como opción configurable (REGLA 10).
