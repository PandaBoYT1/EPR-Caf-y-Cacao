import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import type { Lote, Producto, EstadoProducto, EstadoLote } from '@shared/types';
import { PageHeader, Field, Modal, Alerta, Select, Vacio } from '../components/ui';
import { formatearKg, formatearSoles, fechaCorta } from '../lib/format';

const ETIQUETA_ESTADO: Record<EstadoLote, { texto: string; clase: string }> = {
  DISPONIBLE: { texto: 'Disponible', clase: 'bg-emerald-100 text-emerald-700' },
  PARCIAL: { texto: 'Parcial', clase: 'bg-amber-100 text-amber-700' },
  VENDIDO: { texto: 'Vendido', clase: 'bg-gray-200 text-gray-600' },
  CERRADO: { texto: 'Fusionado', clase: 'bg-gray-200 text-gray-600' },
  ANULADO: { texto: 'Anulado', clase: 'bg-red-100 text-red-700' },
};

const esActivo = (l: Lote) => l.estado_lote === 'DISPONIBLE' || l.estado_lote === 'PARCIAL';

export default function Lotes() {
  const [lista, setLista] = useState<Lote[]>([]);
  const [crear, setCrear] = useState(false);
  const [detalle, setDetalle] = useState<Lote | null>(null);
  const [msg, setMsg] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);

  function cargar() {
    call<Lote[]>('lotes:listar').then(setLista);
  }
  useEffect(cargar, []);

  // ¿Hay más de un lote abierto del mismo producto+estado? (duplicados fusionables)
  const abiertos = lista.filter(esActivo);
  const visibles = verInactivos ? lista : abiertos;
  const inactivos = lista.length - abiertos.length;
  const grupos = new Map<string, number>();
  for (const l of abiertos) {
    const k = `${l.producto_id}:${l.estado_id ?? 'n'}`;
    grupos.set(k, (grupos.get(k) ?? 0) + 1);
  }
  const hayDuplicados = [...grupos.values()].some((n) => n > 1);

  async function fusionar() {
    const r = await call<{ fusionados: number }>('lotes:fusionarDuplicados');
    setMsg(`✅ Se fusionaron ${r.fusionados} lote(s) duplicado(s) en uno solo por tipo y estado.`);
    cargar();
  }

  return (
    <div>
      <PageHeader
        title="Lotes"
        subtitle="Se agrupan por tipo y estado (café seco, café húmedo, cacao…), no por proveedor."
        action={
          <div className="flex gap-2">
            {hayDuplicados && (
              <button className="btn-neutral" onClick={fusionar}>
                🔗 Fusionar duplicados
              </button>
            )}
            <button className="btn-primary" onClick={() => setCrear(true)}>
              ➕ Nuevo lote
            </button>
          </div>
        }
      />

      {msg && (
        <div className="mb-4">
          <Alerta tipo="ok">{msg}</Alerta>
        </div>
      )}

      {inactivos > 0 && (
        <label className="flex items-center gap-2 mb-4 text-sm text-gray-600">
          <input type="checkbox" className="w-5 h-5" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar lotes vendidos, fusionados y anulados ({inactivos})
        </label>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {visibles.length === 0 && (
          <div className="col-span-3">
            <Vacio>{lista.length === 0 ? 'No hay lotes creados todavía.' : 'No hay lotes con producto disponible.'}</Vacio>
          </div>
        )}
        {visibles.map((l) => {
          const et = ETIQUETA_ESTADO[l.estado_lote] ?? ETIQUETA_ESTADO.DISPONIBLE;
          return (
            <button
              key={l.id}
              className={`card text-left hover:shadow-md transition ${esActivo(l) ? '' : 'opacity-60'}`}
              onClick={() => setDetalle(l)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-lg">{l.codigo}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${et.clase}`}>{et.texto}</span>
              </div>
              <div className="text-gray-500 text-sm">{l.producto_nombre}{l.estado_nombre ? ` · ${l.estado_nombre}` : ''}</div>
              <div className="text-2xl font-bold text-cafe mt-2">{formatearKg(l.gramos)}</div>
              {!!l.costo_prom_centimos_kg && (
                <div className="text-xs text-gray-400 mt-1">Costo prom.: {formatearSoles(l.costo_prom_centimos_kg)}/kg</div>
              )}
            </button>
          );
        })}
      </div>

      {crear && <ModalCrear onClose={() => setCrear(false)} onCreado={() => { setCrear(false); cargar(); }} />}
      {detalle && <ModalDetalle lote={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function ModalCrear({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [estados, setEstados] = useState<EstadoProducto[]>([]);
  const [productoId, setProductoId] = useState<number | null>(null);
  const [estadoId, setEstadoId] = useState<number | null>(null);
  const [entradas, setEntradas] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [obs, setObs] = useState('');
  const [error, setError] = useState('');
  const [loteAbierto, setLoteAbierto] = useState<Lote | null>(null);
  const [forzarNuevo, setForzarNuevo] = useState(false);

  const producto = productos.find((p) => p.id === productoId);
  const esCafe = !!producto?.permite_estados;

  useEffect(() => {
    call<Producto[]>('catalogos:productos').then((ps) => {
      setProductos(ps);
      const cafe = ps.find((p) => p.codigo === 'CAFE') ?? ps[0];
      if (cafe) setProductoId(cafe.id);
    });
  }, []);

  useEffect(() => {
    setSel(new Set());
    setEstadoId(null);
    if (producto?.permite_estados) call<EstadoProducto[]>('catalogos:estados', { producto_id: producto.id }).then(setEstados);
    else setEstados([]);
  }, [productoId]);

  useEffect(() => {
    if (!productoId) return;
    if (esCafe && !estadoId) {
      setEntradas([]);
      setLoteAbierto(null);
      return;
    }
    const estado = esCafe ? estadoId : null;
    call<any[]>('compras:entradasParaLote', { producto_id: productoId, estado_id: estado }).then(setEntradas);
    call<Lote | null>('lotes:abierto', { producto_id: productoId, estado_id: estado }).then(setLoteAbierto);
  }, [productoId, estadoId, esCafe]);

  const totalSel = entradas.filter((e) => sel.has(e.id)).reduce((s, e) => s + e.gramos, 0);

  function toggle(id: number) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  async function guardar() {
    if (!productoId) return setError('Selecciona un producto.');
    if (esCafe && !estadoId) return setError('Selecciona el estado.');
    if (sel.size === 0) return setError('Selecciona al menos una entrada.');
    try {
      await call('lotes:crear', {
        producto_id: productoId,
        estado_id: esCafe ? estadoId : null,
        entradas: [...sel],
        obs,
        forzar_nuevo: forzarNuevo,
      });
      onCreado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  const agrupara = loteAbierto && !forzarNuevo;

  return (
    <Modal open title="Nuevo lote" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Producto">
          <Select value={productoId ?? ''} onChange={(e) => setProductoId(Number(e.target.value) || null)}>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
        {esCafe && (
          <Field label="Estado">
            <Select value={estadoId ?? ''} onChange={(e) => setEstadoId(Number(e.target.value) || null)}>
              <option value="">— Selecciona —</option>
              {estados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {agrupara && (
        <div className="mb-2">
          <Alerta tipo="info">
            Se agregará al lote <b>{loteAbierto!.codigo}</b> ({formatearKg(loteAbierto!.gramos)}). Así se mantiene un
            solo lote por tipo y estado.
          </Alerta>
        </div>
      )}
      {loteAbierto && (
        <label className="flex items-center gap-2 mb-3 text-sm text-gray-600">
          <input type="checkbox" className="w-5 h-5" checked={forzarNuevo} onChange={(e) => setForzarNuevo(e.target.checked)} />
          Crear un lote nuevo aparte (no agrupar con {loteAbierto.codigo})
        </label>
      )}

      <span className="label">Entradas disponibles (no asignadas a otro lote)</span>
      <div className="border rounded-xl max-h-64 overflow-auto mb-3">
        {entradas.length === 0 ? (
          <p className="text-gray-400 p-4 text-center">
            {esCafe && !estadoId ? 'Elige un estado para ver las entradas.' : 'No hay entradas disponibles.'}
          </p>
        ) : (
          entradas.map((e) => (
            <label key={e.id} className="flex items-center gap-3 px-4 py-2 border-t first:border-t-0 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" className="w-5 h-5" checked={sel.has(e.id)} onChange={() => toggle(e.id)} />
              <span className="font-mono text-sm w-24">{e.codigo}</span>
              <span className="text-sm text-gray-500 w-24">{fechaCorta(e.fecha)}</span>
              <span className="text-sm flex-1">{e.proveedor_nombre}</span>
              <span className="font-semibold">{formatearKg(e.gramos)}</span>
            </label>
          ))
        )}
      </div>

      <Field label="Observaciones (opcional)">
        <input className="field" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Field>

      {error && <Alerta tipo="error">{error}</Alerta>}
      <div className="flex items-center justify-between mt-4">
        <div className="text-gray-600">
          Total del lote: <b className="text-cafe text-lg">{formatearKg(totalSel)}</b>
        </div>
        <div className="flex gap-3">
          <button className="btn-neutral" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={guardar}>
            {agrupara ? `Agregar a ${loteAbierto!.codigo}` : 'Crear lote'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ModalDetalle({ lote, onClose }: { lote: Lote; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    call('lotes:detalle', { id: lote.id }).then(setData);
  }, [lote.id]);

  return (
    <Modal open title={`Lote ${lote.codigo}`} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-500">Cantidad · {lote.producto_nombre}{lote.estado_nombre ? ` · ${lote.estado_nombre}` : ''}</div>
          <div className="text-2xl font-bold text-cafe">{formatearKg(data?.lote?.gramos ?? lote.gramos)}</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4">
          <div className="text-xs text-emerald-700">Costo promedio de compra</div>
          <div className="text-2xl font-bold text-emerald-700">
            {data?.lote?.costo_prom_centimos_kg ? `${formatearSoles(data.lote.costo_prom_centimos_kg)} / kg` : '—'}
          </div>
        </div>
      </div>

      <h3 className="font-bold text-gray-700 mb-2">Entradas asociadas</h3>
      {!data ? (
        <p className="text-gray-400">Cargando…</p>
      ) : data.entradas.length === 0 ? (
        <p className="text-gray-400">Sin entradas asociadas.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-left">
            <tr>
              <th className="py-2">Código</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th className="text-right">Cantidad</th>
              <th className="text-right">Precio/kg</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.entradas.map((e: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="py-2 font-mono">{e.codigo}</td>
                <td>{fechaCorta(e.fecha)}</td>
                <td>{e.proveedor_nombre}</td>
                <td className="text-right">{formatearKg(e.gramos)}</td>
                <td className="text-right">{formatearSoles(e.precio_centimos_kg)}</td>
                <td className="text-right font-semibold">{formatearSoles(e.total_centimos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
