import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call } from '../lib/api';
import type { Producto, EstadoProducto, Comprador, Lote } from '@shared/types';
import { PageHeader, Field, Modal, Alerta, Select } from '../components/ui';
import { calcularTotalCentimos, solesACentimos } from '@shared/domain/money';
import { kgAGramos, gramosAKg, formatearKg, formatearSoles, hoyISO } from '../lib/format';
import { useSession } from '../state/session';

export default function NuevaVenta() {
  const { usuario } = useSession();
  const navigate = useNavigate();
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [estados, setEstados] = useState<EstadoProducto[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);

  const [fecha, setFecha] = useState(hoyISO());
  const [compradorId, setCompradorId] = useState<number | null>(null);
  const [productoId, setProductoId] = useState<number | null>(null);
  const [estadoId, setEstadoId] = useState<number | null>(null);
  const [loteId, setLoteId] = useState<number | null>(null);
  const [kg, setKg] = useState('');
  const [precio, setPrecio] = useState('');
  const [obs, setObs] = useState('');
  const [stock, setStock] = useState(0);
  const [precioVentaProm, setPrecioVentaProm] = useState(0);

  const [modalComp, setModalComp] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [guardando, setGuardando] = useState(false);

  const producto = productos.find((p) => p.id === productoId);
  const esCafe = !!producto?.permite_estados;
  const loteSel = lotes.find((l) => l.id === loteId) ?? null;
  // Con el estado ya elegido, solo se ofrecen los lotes de ese estado.
  const lotesOfrecidos = esCafe && estadoId ? lotes.filter((l) => l.estado_id === estadoId) : lotes;

  function elegirLote(id: number | null) {
    setLoteId(id);
    if (id) {
      const l = lotes.find((x) => x.id === id);
      if (l && esCafe && l.estado_id) setEstadoId(l.estado_id);
    }
  }

  useEffect(() => {
    call<Comprador[]>('compradores:listar').then(setCompradores);
    call<Producto[]>('catalogos:productos').then((ps) => {
      setProductos(ps);
      const cafe = ps.find((p) => p.codigo === 'CAFE') ?? ps[0];
      if (cafe) setProductoId(cafe.id);
    });
  }, []);

  useEffect(() => {
    if (!producto) return;
    setEstadoId(null);
    setLoteId(null);
    if (producto.permite_estados) {
      call<EstadoProducto[]>('catalogos:estados', { producto_id: producto.id }).then(setEstados);
    } else {
      setEstados([]);
    }
    call<Lote[]>('lotes:listar', { soloDisponibles: true }).then((ls) => setLotes(ls.filter((l) => l.producto_id === producto.id)));
  }, [productoId]);

  useEffect(() => {
    if (!productoId) return;
    if (esCafe && !estadoId) {
      setStock(0);
      setPrecioVentaProm(0);
      return;
    }
    const estado = esCafe ? estadoId : null;
    call<number>('inventario:stock', { producto_id: productoId, estado_id: estado }).then(setStock);
    call<number>('ventas:precioPromedio', { producto_id: productoId, estado_id: estado }).then(setPrecioVentaProm);
  }, [productoId, estadoId, esCafe]);

  const totalC = useMemo(() => {
    const g = kgAGramos(Number(kg) || 0);
    const pc = solesACentimos(Number(precio) || 0);
    return calcularTotalCentimos(g, pc);
  }, [kg, precio]);

  const excede = Number(kg) > 0 && kgAGramos(Number(kg)) > stock;
  const excedeLote = !!loteSel && Number(kg) > 0 && kgAGramos(Number(kg)) > loteSel.gramos;

  async function guardar() {
    setError('');
    if (!compradorId) return setError('Selecciona un comprador.');
    if (!productoId) return setError('Selecciona un producto.');
    if (esCafe && !estadoId) return setError('Selecciona el estado del café.');
    if (!(Number(kg) > 0)) return setError('Ingresa la cantidad en kg.');
    if (!(Number(precio) > 0)) return setError('Ingresa el precio por kg.');
    if (excede) return setError('No hay stock suficiente para esta venta.');
    if (excedeLote) return setError('La cantidad supera lo disponible en el lote seleccionado.');

    setGuardando(true);
    try {
      const res = await call<{ codigo: string }>('ventas:registrar', {
        fecha,
        comprador_id: compradorId,
        usuario_id: usuario?.id,
        producto_id: productoId,
        estado_id: esCafe ? estadoId : null,
        lote_id: loteId,
        kg: Number(kg),
        precio_soles: Number(precio),
        obs,
      });
      setExito(`Venta registrada: ${res.codigo}`);
      setKg('');
      setPrecio('');
      setObs('');
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
        <p className="text-gray-500 mb-8">Se descontó del inventario y se actualizó el historial del comprador.</p>
        <div className="flex gap-3 justify-center">
          <button className="btn-primary" onClick={() => setExito('')}>
            Registrar otra venta
          </button>
          <button className="btn-neutral" onClick={() => navigate('/ventas')}>
            Ver Kardex de salidas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Nueva venta" subtitle="Registra una salida a un comprador." />

      <div className="space-y-5">
        <div className="card">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="1. Comprador">
                <Select value={compradorId ?? ''} onChange={(e) => setCompradorId(Number(e.target.value) || null)}>
                  <option value="">— Selecciona —</option>
                  {compradores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <button className="btn-neutral mb-4" onClick={() => setModalComp(true)}>
              ➕ Nuevo
            </button>
          </div>
          <Field label="Fecha">
            <input className="field" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        <div className="card">
          <span className="label">2. Producto</span>
          <div className="grid grid-cols-2 gap-4 mt-1">
            {productos.map((p) => (
              <button
                key={p.id}
                onClick={() => setProductoId(p.id)}
                className={`rounded-2xl p-5 text-lg font-bold border-2 transition ${
                  productoId === p.id ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {p.codigo === 'CAFE' ? '☕' : p.codigo === 'CACAO' ? '🍫' : '📦'} {p.nombre}
              </button>
            ))}
          </div>
        </div>

        {esCafe && (
          <div className="card">
            <span className="label">3. Estado del café</span>
            <div className="grid grid-cols-3 gap-4 mt-1">
              {estados.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setEstadoId(e.id);
                    if (loteSel && loteSel.estado_id !== e.id) setLoteId(null);
                  }}
                  className={`rounded-2xl p-4 font-bold border-2 transition ${
                    estadoId === e.id ? 'border-cafe bg-amber-50 text-cafe-dark' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {e.codigo === 'SECO' ? '☀️' : e.codigo === 'SEMISECO' ? '💧' : '💦'}
                  <div>{e.nombre}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card flex items-center justify-between">
          <span className="text-gray-600">Stock disponible:</span>
          {esCafe && !estadoId ? (
            <span className="text-lg font-semibold text-gray-400">Elige el estado</span>
          ) : (
            <span className={`text-xl font-bold ${excede ? 'text-red-600' : 'text-emerald-700'}`}>{formatearKg(stock)}</span>
          )}
        </div>

        {lotesOfrecidos.length > 0 && (
          <div className="card">
            <Field label="Lote (opcional — al elegirlo se completa el estado)">
              <Select value={loteId ?? ''} onChange={(e) => elegirLote(Number(e.target.value) || null)}>
                <option value="">Sin lote específico</option>
                {lotesOfrecidos.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} · {formatearKg(l.gramos)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {(loteSel || precioVentaProm > 0) && (esCafe ? !!estadoId : true) && (
          <div className="card bg-amber-50 border border-amber-100">
            <div className="font-semibold text-amber-800 mb-3">💡 Referencia de precios</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loteSel && (
                <div>
                  <div className="text-sm text-gray-500">Costo promedio del lote {loteSel.codigo}</div>
                  <div className="text-xl font-bold text-cafe">
                    {loteSel.costo_prom_centimos_kg ? `${formatearSoles(loteSel.costo_prom_centimos_kg)} / kg` : '—'}
                  </div>
                  <div className="text-xs text-gray-400">Vende por encima de este valor para ganar.</div>
                </div>
              )}
              <div>
                <div className="text-sm text-gray-500">Precio promedio de venta reciente</div>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-emerald-700">
                    {precioVentaProm ? `${formatearSoles(precioVentaProm)} / kg` : 'Sin ventas previas'}
                  </span>
                  {precioVentaProm > 0 && (
                    <button
                      type="button"
                      className="text-sm text-emerald-700 underline"
                      onClick={() => setPrecio((precioVentaProm / 100).toFixed(2))}
                    >
                      Usar
                    </button>
                  )}
                </div>
                <div className="text-xs text-gray-400">Así has vendido este producto antes.</div>
              </div>
            </div>
          </div>
        )}

        <div className="card grid md:grid-cols-2 gap-4">
          <Field label="Cantidad (kg)">
            <input className="field" type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="Ej. 2000" />
          </Field>
          <Field label="Precio por kg (S/)">
            <input className="field" type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej. 10.20" />
          </Field>
        </div>

        <div className="card">
          <Field label="Observaciones (opcional)">
            <input className="field" value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
        </div>

        {excede && <Alerta tipo="warn">La cantidad supera el stock disponible ({formatearKg(stock)}).</Alerta>}
        {excedeLote && !excede && (
          <Alerta tipo="warn">La cantidad supera lo que tiene el lote {loteSel?.codigo} ({formatearKg(loteSel?.gramos ?? 0)}).</Alerta>
        )}
        {error && <Alerta tipo="error">{error}</Alerta>}

        <div className="card bg-gray-50 flex items-center justify-between flex-wrap gap-4 sticky bottom-4 shadow-lg">
          <div>
            <div className="text-sm text-gray-500">Total de la venta</div>
            <div className="text-3xl font-bold text-emerald-700">{formatearSoles(totalC)}</div>
            <div className="text-xs text-gray-400">{kg || 0} kg × S/ {precio || 0}</div>
          </div>
          <button className="btn-primary text-lg px-8 py-4" onClick={guardar} disabled={guardando || excede || excedeLote}>
            {guardando ? 'Guardando…' : '✅ Confirmar venta'}
          </button>
        </div>
      </div>

      <ModalNuevoComprador
        open={modalComp}
        onClose={() => setModalComp(false)}
        onCreado={(c) => {
          setCompradores((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)));
          setCompradorId(c.id);
          setModalComp(false);
        }}
      />
    </div>
  );
}

function ModalNuevoComprador({ open, onClose, onCreado }: { open: boolean; onClose: () => void; onCreado: (c: Comprador) => void }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('MAYORISTA');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState('');

  async function crear() {
    if (!nombre.trim()) return setError('Ingresa el nombre.');
    try {
      const { id } = await call<{ id: number }>('compradores:crear', { nombre, tipo, telefono });
      onCreado({ id, nombre, tipo: tipo as Comprador['tipo'], documento: null, telefono, direccion: null, contacto: null, obs: null, activo: 1, creado_en: '' });
      setNombre('');
      setTelefono('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Modal open={open} title="Nuevo comprador" onClose={onClose}>
      <Field label="Nombre / razón social">
        <input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </Field>
      <Field label="Tipo">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="COOPERATIVA">Cooperativa</option>
          <option value="MAYORISTA">Comerciante mayorista</option>
          <option value="OTRO">Otro</option>
        </Select>
      </Field>
      <Field label="Teléfono (opcional)">
        <input className="field" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </Field>
      {error && <Alerta tipo="error">{error}</Alerta>}
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-neutral" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={crear}>
          Guardar comprador
        </button>
      </div>
    </Modal>
  );
}
