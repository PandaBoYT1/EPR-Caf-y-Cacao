import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call } from '../lib/api';
import type { Producto, EstadoProducto, Proveedor } from '@shared/types';
import { PageHeader, Field, Modal, Alerta, Select } from '../components/ui';
import { RendimientoCalc, type ValoresRendimiento } from '../components/RendimientoCalc';
import { calcularTotalCentimos, solesACentimos } from '@shared/domain/money';
import { kgAGramos, formatearSoles, hoyISO } from '../lib/format';
import { useSession } from '../state/session';

export default function NuevaCompra() {
  const { usuario } = useSession();
  const navigate = useNavigate();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [estados, setEstados] = useState<EstadoProducto[]>([]);
  const [cfg, setCfg] = useState<Record<string, string>>({});

  const [fecha, setFecha] = useState(hoyISO());
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [productoId, setProductoId] = useState<number | null>(null);
  const [estadoId, setEstadoId] = useState<number | null>(null);
  const [kg, setKg] = useState('');
  const [precio, setPrecio] = useState('');
  const [obs, setObs] = useState('');
  const [conRend, setConRend] = useState(false);
  const [rend, setRend] = useState<ValoresRendimiento>({ muestra: '250', pilado: '', almendra: '' });

  const [modalProv, setModalProv] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [guardando, setGuardando] = useState(false);

  const producto = productos.find((p) => p.id === productoId);
  const esCafe = !!producto?.permite_estados;

  useEffect(() => {
    call<Proveedor[]>('proveedores:listar').then(setProveedores);
    call<Producto[]>('catalogos:productos').then((ps) => {
      setProductos(ps);
      const cafe = ps.find((p) => p.codigo === 'CAFE') ?? ps[0];
      if (cafe) setProductoId(cafe.id);
    });
    call<Record<string, string>>('config:get').then((c) => {
      setCfg(c);
      setRend((r) => ({ ...r, muestra: c.muestra_defecto_g || '250' }));
    });
  }, []);

  useEffect(() => {
    if (producto?.permite_estados) {
      call<EstadoProducto[]>('catalogos:estados', { producto_id: producto.id }).then(setEstados);
    } else {
      setEstados([]);
      setEstadoId(null);
    }
  }, [productoId]);

  const totalC = useMemo(() => {
    const g = kgAGramos(Number(kg) || 0);
    const pc = solesACentimos(Number(precio) || 0);
    return calcularTotalCentimos(g, pc);
  }, [kg, precio]);

  async function guardar() {
    setError('');
    if (!proveedorId) return setError('Selecciona un proveedor.');
    if (!productoId) return setError('Selecciona un producto.');
    if (esCafe && !estadoId) return setError('Selecciona el estado del café.');
    if (!(Number(kg) > 0)) return setError('Ingresa la cantidad en kg.');
    if (!(Number(precio) > 0)) return setError('Ingresa el precio por kg.');

    setGuardando(true);
    try {
      const res = await call<{ codigo: string }>('compras:registrar', {
        fecha,
        proveedor_id: proveedorId,
        usuario_id: usuario?.id,
        producto_id: productoId,
        estado_id: esCafe ? estadoId : null,
        kg: Number(kg),
        precio_soles: Number(precio),
        rendimiento:
          esCafe && conRend
            ? {
                muestraInicialG: Number(rend.muestra),
                pesoPiladoG: Number(rend.pilado),
                almendraSanaG: Number(rend.almendra),
              }
            : null,
        obs,
      });
      setExito(`Compra registrada: ${res.codigo}`);
      setKg('');
      setPrecio('');
      setObs('');
      setConRend(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuardando(false);
    }
  }

  if (exito) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{exito}</h1>
        <p className="text-gray-500 mb-8">Se actualizó el inventario y el historial del proveedor.</p>
        <div className="flex gap-3 justify-center">
          <button className="btn-primary" onClick={() => setExito('')}>
            Registrar otra compra
          </button>
          <button className="btn-neutral" onClick={() => navigate('/compras')}>
            Ver Kardex de entradas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Nueva compra" subtitle="Registra el producto que trae un proveedor." />

      <div className="space-y-5">
        {/* Proveedor */}
        <div className="card">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="1. Proveedor">
                <Select value={proveedorId ?? ''} onChange={(e) => setProveedorId(Number(e.target.value) || null)}>
                  <option value="">— Selecciona —</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <button className="btn-neutral mb-4" onClick={() => setModalProv(true)}>
              ➕ Nuevo
            </button>
          </div>
          <Field label="Fecha">
            <input className="field" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        {/* Producto */}
        <div className="card">
          <span className="label">2. Producto</span>
          <div className="grid grid-cols-2 gap-4 mt-1">
            {productos.map((p) => (
              <button
                key={p.id}
                onClick={() => setProductoId(p.id)}
                className={`rounded-2xl p-5 text-lg font-bold border-2 transition ${
                  productoId === p.id
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {p.codigo === 'CAFE' ? '☕' : p.codigo === 'CACAO' ? '🍫' : '📦'} {p.nombre}
              </button>
            ))}
          </div>
        </div>

        {/* Estado (solo café) */}
        {esCafe && (
          <div className="card">
            <span className="label">3. Estado del café</span>
            <div className="grid grid-cols-3 gap-4 mt-1">
              {estados.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEstadoId(e.id)}
                  className={`rounded-2xl p-4 font-bold border-2 transition ${
                    estadoId === e.id
                      ? 'border-cafe bg-amber-50 text-cafe-dark'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {e.codigo === 'SECO' ? '☀️' : e.codigo === 'SEMISECO' ? '💧' : '💦'}
                  <div>{e.nombre}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cantidad y precio */}
        <div className="card grid md:grid-cols-2 gap-4">
          <Field label={`${esCafe ? '4' : '3'}. Cantidad (kg)`}>
            <input className="field" type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="Ej. 250" />
          </Field>
          <Field label={`${esCafe ? '5' : '4'}. Precio por kg (S/)`}>
            <input className="field" type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej. 8.50" />
          </Field>
        </div>

        {/* Rendimiento (solo café, opcional) */}
        {esCafe && (
          <div className="card">
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input type="checkbox" className="w-5 h-5" checked={conRend} onChange={(e) => setConRend(e.target.checked)} />
              <span className="font-semibold text-gray-700">Registrar rendimiento (factor) del café</span>
            </label>
            {conRend && (
              <div className="mt-3">
                <RendimientoCalc
                  valores={rend}
                  onChange={setRend}
                  mermaMin={Number(cfg.merma_min ?? 18)}
                  mermaMax={Number(cfg.merma_max ?? 20)}
                />
              </div>
            )}
          </div>
        )}

        {/* Observaciones */}
        <div className="card">
          <Field label="Observaciones (opcional)">
            <input className="field" value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
        </div>

        {error && <Alerta tipo="error">{error}</Alerta>}

        {/* Resumen + confirmar */}
        <div className="card bg-gray-50 flex items-center justify-between flex-wrap gap-4 sticky bottom-4 shadow-lg">
          <div>
            <div className="text-sm text-gray-500">Total a pagar</div>
            <div className="text-3xl font-bold text-emerald-700">{formatearSoles(totalC)}</div>
            <div className="text-xs text-gray-400">{kg || 0} kg × S/ {precio || 0}</div>
          </div>
          <button className="btn-primary text-lg px-8 py-4" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : '✅ Confirmar compra'}
          </button>
        </div>
      </div>

      <ModalNuevoProveedor
        open={modalProv}
        onClose={() => setModalProv(false)}
        onCreado={(p) => {
          setProveedores((prev) => [...prev, p].sort((a, b) => a.nombre.localeCompare(b.nombre)));
          setProveedorId(p.id);
          setModalProv(false);
        }}
      />
    </div>
  );
}

function ModalNuevoProveedor({ open, onClose, onCreado }: { open: boolean; onClose: () => void; onCreado: (p: Proveedor) => void }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('AGRICULTOR');
  const [telefono, setTelefono] = useState('');
  const [comunidad, setComunidad] = useState('');
  const [error, setError] = useState('');

  async function crear() {
    if (!nombre.trim()) return setError('Ingresa el nombre.');
    try {
      const { id } = await call<{ id: number }>('proveedores:crear', { nombre, tipo, telefono, comunidad });
      onCreado({ id, nombre, tipo: tipo as Proveedor['tipo'], documento: null, telefono, comunidad, obs: null, activo: 1, creado_en: '' });
      setNombre('');
      setTelefono('');
      setComunidad('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Modal open={open} title="Nuevo proveedor" onClose={onClose}>
      <Field label="Nombre completo">
        <input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </Field>
      <Field label="Tipo">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="AGRICULTOR">Agricultor</option>
          <option value="PRODUCTOR">Productor</option>
          <option value="COMERCIANTE">Comerciante</option>
          <option value="OTRO">Otro</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono (opcional)">
          <input className="field" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </Field>
        <Field label="Comunidad (opcional)">
          <input className="field" value={comunidad} onChange={(e) => setComunidad(e.target.value)} />
        </Field>
      </div>
      {error && <Alerta tipo="error">{error}</Alerta>}
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-neutral" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={crear}>
          Guardar proveedor
        </button>
      </div>
    </Modal>
  );
}
