import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call } from '../lib/api';
import type { FilaKardexEntrada, Producto } from '@shared/types';
import { PageHeader, Select, Vacio, Modal, Field, Alerta } from '../components/ui';
import { formatearKg, formatearSoles, fechaCorta, hoyISO } from '../lib/format';
import { useSession } from '../state/session';

export default function Compras() {
  const navigate = useNavigate();
  const { esAdmin } = useSession();
  const [filas, setFilas] = useState<FilaKardexEntrada[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [texto, setTexto] = useState('');
  const [productoId, setProductoId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [anular, setAnular] = useState<FilaKardexEntrada | null>(null);

  function cargar() {
    call<FilaKardexEntrada[]>('compras:kardex', {
      texto: texto || undefined,
      producto_id: productoId ? Number(productoId) : undefined,
      fecha_desde: desde || undefined,
      fecha_hasta: hasta || undefined,
      incluir_anuladas: true,
    }).then(setFilas);
  }

  useEffect(() => {
    call<Producto[]>('catalogos:productos').then(setProductos);
  }, []);
  useEffect(() => {
    cargar();
  }, [texto, productoId, desde, hasta]);

  return (
    <div>
      <PageHeader
        title="Compras · Kardex de entrada"
        subtitle="Todo lo que ingresa al acopio."
        action={
          <button className="btn-primary" onClick={() => navigate('/compras/nueva')}>
            ➕ Nueva compra
          </button>
        }
      />

      <div className="card mb-4 grid md:grid-cols-4 gap-3">
        <input className="field" placeholder="🔎 Buscar proveedor o código" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          <option value="">Todos los productos</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
        <input className="field" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} title="Desde" />
        <input className="field" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} title="Hasta" />
      </div>

      <div className="card overflow-x-auto p-0">
        {filas.length === 0 ? (
          <Vacio>No hay compras registradas todavía.</Vacio>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <Th>Código</Th>
                <Th>Fecha</Th>
                <Th>Proveedor</Th>
                <Th>Producto</Th>
                <Th>Estado</Th>
                <Th className="text-right">Cantidad</Th>
                <Th className="text-right">Precio/kg</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Factor</Th>
                {esAdmin && <Th></Th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={`border-t ${f.anulada ? 'text-gray-400 line-through' : ''}`}>
                  <Td className="font-mono">{f.codigo}</Td>
                  <Td>{fechaCorta(f.fecha)}</Td>
                  <Td>{f.proveedor_nombre}</Td>
                  <Td>{f.producto_nombre}</Td>
                  <Td>{f.estado_nombre ?? '—'}</Td>
                  <Td className="text-right">{formatearKg(f.gramos)}</Td>
                  <Td className="text-right">{formatearSoles(f.precio_centimos_kg)}</Td>
                  <Td className="text-right font-semibold">{formatearSoles(f.total_centimos)}</Td>
                  <Td className="text-right">{f.factor ?? '—'}</Td>
                  {esAdmin && (
                    <Td className="text-right">
                      {!f.anulada && (
                        <button className="text-red-600 hover:underline" onClick={() => setAnular(f)}>
                          Anular
                        </button>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ModalAnular
        fila={anular}
        onClose={() => setAnular(null)}
        onHecho={() => {
          setAnular(null);
          cargar();
        }}
      />
    </div>
  );
}

function ModalAnular({ fila, onClose, onHecho }: { fila: FilaKardexEntrada | null; onClose: () => void; onHecho: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setMotivo('');
    setError('');
  }, [fila]);

  async function anular() {
    if (!fila) return;
    try {
      await call('compras:anular', { id: fila.id, motivo });
      onHecho();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Modal open={!!fila} title={`Anular compra ${fila?.codigo ?? ''}`} onClose={onClose}>
      <Alerta tipo="warn">La compra no se borra: queda en el historial como anulada y se revierte del inventario.</Alerta>
      <div className="mt-4">
        <Field label="Motivo de la anulación">
          <input className="field" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Field>
      </div>
      {error && <Alerta tipo="error">{error}</Alerta>}
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-neutral" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-danger" onClick={anular}>
          Anular compra
        </button>
      </div>
    </Modal>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-semibold ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
