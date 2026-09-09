import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import type { Proveedor } from '@shared/types';
import { PageHeader, Field, Modal, Alerta, Select, Vacio } from '../components/ui';
import { formatearKg, formatearSoles, fechaCorta } from '../lib/format';

const TIPOS = [
  ['AGRICULTOR', 'Agricultor'],
  ['PRODUCTOR', 'Productor'],
  ['COMERCIANTE', 'Comerciante'],
  ['OTRO', 'Otro'],
] as const;

export default function Proveedores() {
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [edit, setEdit] = useState<Partial<Proveedor> | null>(null);
  const [hist, setHist] = useState<Proveedor | null>(null);
  const [busca, setBusca] = useState('');

  function cargar() {
    call<Proveedor[]>('proveedores:listar', { soloActivos: false }).then(setLista);
  }
  useEffect(cargar, []);

  const filtrada = lista.filter((p) => p.nombre.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Quienes traen café o cacao al acopio."
        action={
          <button className="btn-primary" onClick={() => setEdit({ tipo: 'AGRICULTOR', activo: 1 })}>
            ➕ Nuevo proveedor
          </button>
        }
      />
      <input className="field mb-4 max-w-md" placeholder="🔎 Buscar por nombre" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div className="card overflow-x-auto p-0">
        {filtrada.length === 0 ? (
          <Vacio>No hay proveedores.</Vacio>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Comunidad</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((p) => (
                <tr key={p.id} className={`border-t ${p.activo ? '' : 'text-gray-400'}`}>
                  <td className="px-4 py-3 font-medium">{p.nombre}</td>
                  <td className="px-4 py-3">{TIPOS.find((t) => t[0] === p.tipo)?.[1] ?? p.tipo}</td>
                  <td className="px-4 py-3">{p.telefono ?? '—'}</td>
                  <td className="px-4 py-3">{p.comunidad ?? '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button className="text-sky-600 hover:underline mr-4" onClick={() => setHist(p)}>
                      Historial
                    </button>
                    <button className="text-gray-600 hover:underline" onClick={() => setEdit(p)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {edit && <ModalEdit prov={edit} onClose={() => setEdit(null)} onGuardado={() => { setEdit(null); cargar(); }} />}
      {hist && <ModalHistorial prov={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

function ModalEdit({ prov, onClose, onGuardado }: { prov: Partial<Proveedor>; onClose: () => void; onGuardado: () => void }) {
  const [p, setP] = useState<Partial<Proveedor>>(prov);
  const [error, setError] = useState('');
  const editando = !!prov.id;

  async function guardar() {
    if (!p.nombre?.trim()) return setError('Ingresa el nombre.');
    try {
      if (editando) await call('proveedores:actualizar', p);
      else await call('proveedores:crear', p);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Modal open title={editando ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose}>
      <Field label="Nombre completo">
        <input className="field" value={p.nombre ?? ''} onChange={(e) => setP({ ...p, nombre: e.target.value })} autoFocus />
      </Field>
      <Field label="Tipo">
        <Select value={p.tipo ?? 'AGRICULTOR'} onChange={(e) => setP({ ...p, tipo: e.target.value as Proveedor['tipo'] })}>
          {TIPOS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Documento (opcional)">
          <input className="field" value={p.documento ?? ''} onChange={(e) => setP({ ...p, documento: e.target.value })} />
        </Field>
        <Field label="Teléfono (opcional)">
          <input className="field" value={p.telefono ?? ''} onChange={(e) => setP({ ...p, telefono: e.target.value })} />
        </Field>
      </div>
      <Field label="Comunidad / localidad (opcional)">
        <input className="field" value={p.comunidad ?? ''} onChange={(e) => setP({ ...p, comunidad: e.target.value })} />
      </Field>
      {editando && (
        <label className="flex items-center gap-2 mb-2">
          <input type="checkbox" className="w-5 h-5" checked={!!p.activo} onChange={(e) => setP({ ...p, activo: e.target.checked ? 1 : 0 })} />
          <span>Activo</span>
        </label>
      )}
      {error && <Alerta tipo="error">{error}</Alerta>}
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-neutral" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={guardar}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}

function ModalHistorial({ prov, onClose }: { prov: Proveedor; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    call('proveedores:historial', { id: prov.id }).then(setData);
  }, [prov.id]);

  return (
    <Modal open title={`Historial · ${prov.nombre}`} onClose={onClose} wide>
      {!data ? (
        <p className="text-gray-400">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Entregas" valor={String(data.resumen.entregas)} />
            <Stat label="Total kg" valor={formatearKg(data.resumen.gramos)} />
            <Stat label="Total comprado" valor={formatearSoles(data.resumen.total)} />
          </div>
          <h3 className="font-bold text-gray-700 mb-2">Últimas entregas</h3>
          {data.ultimas.length === 0 ? (
            <p className="text-gray-400">Sin entregas registradas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-left">
                <tr>
                  <th className="py-2">Código</th>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th className="text-right">Cantidad</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimas.map((u: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 font-mono">{u.codigo}</td>
                    <td>{fechaCorta(u.fecha)}</td>
                    <td>{u.producto}</td>
                    <td className="text-right">{formatearKg(u.gramos)}</td>
                    <td className="text-right">{formatearSoles(u.total_centimos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-800">{valor}</div>
    </div>
  );
}
