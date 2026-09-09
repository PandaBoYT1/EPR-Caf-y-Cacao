import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import type { Comprador } from '@shared/types';
import { PageHeader, Field, Modal, Alerta, Select, Vacio } from '../components/ui';
import { formatearKg, formatearSoles, fechaCorta } from '../lib/format';

const TIPOS = [
  ['COOPERATIVA', 'Cooperativa'],
  ['MAYORISTA', 'Comerciante mayorista'],
  ['OTRO', 'Otro'],
] as const;

export default function Compradores() {
  const [lista, setLista] = useState<Comprador[]>([]);
  const [edit, setEdit] = useState<Partial<Comprador> | null>(null);
  const [hist, setHist] = useState<Comprador | null>(null);
  const [busca, setBusca] = useState('');

  function cargar() {
    call<Comprador[]>('compradores:listar', { soloActivos: false }).then(setLista);
  }
  useEffect(cargar, []);

  const filtrada = lista.filter((c) => c.nombre.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Compradores"
        subtitle="Cooperativas y mayoristas que compran los lotes."
        action={
          <button className="btn-primary" onClick={() => setEdit({ tipo: 'MAYORISTA', activo: 1 })}>
            ➕ Nuevo comprador
          </button>
        }
      />
      <input className="field mb-4 max-w-md" placeholder="🔎 Buscar por nombre" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div className="card overflow-x-auto p-0">
        {filtrada.length === 0 ? (
          <Vacio>No hay compradores.</Vacio>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((c) => (
                <tr key={c.id} className={`border-t ${c.activo ? '' : 'text-gray-400'}`}>
                  <td className="px-4 py-3 font-medium">{c.nombre}</td>
                  <td className="px-4 py-3">{TIPOS.find((t) => t[0] === c.tipo)?.[1] ?? c.tipo}</td>
                  <td className="px-4 py-3">{c.telefono ?? '—'}</td>
                  <td className="px-4 py-3">{c.contacto ?? '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button className="text-sky-600 hover:underline mr-4" onClick={() => setHist(c)}>
                      Historial
                    </button>
                    <button className="text-gray-600 hover:underline" onClick={() => setEdit(c)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {edit && <ModalEdit comp={edit} onClose={() => setEdit(null)} onGuardado={() => { setEdit(null); cargar(); }} />}
      {hist && <ModalHistorial comp={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

function ModalEdit({ comp, onClose, onGuardado }: { comp: Partial<Comprador>; onClose: () => void; onGuardado: () => void }) {
  const [c, setC] = useState<Partial<Comprador>>(comp);
  const [error, setError] = useState('');
  const editando = !!comp.id;

  async function guardar() {
    if (!c.nombre?.trim()) return setError('Ingresa el nombre.');
    try {
      if (editando) await call('compradores:actualizar', c);
      else await call('compradores:crear', c);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Modal open title={editando ? 'Editar comprador' : 'Nuevo comprador'} onClose={onClose}>
      <Field label="Nombre / razón social">
        <input className="field" value={c.nombre ?? ''} onChange={(e) => setC({ ...c, nombre: e.target.value })} autoFocus />
      </Field>
      <Field label="Tipo">
        <Select value={c.tipo ?? 'MAYORISTA'} onChange={(e) => setC({ ...c, tipo: e.target.value as Comprador['tipo'] })}>
          {TIPOS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Documento (opcional)">
          <input className="field" value={c.documento ?? ''} onChange={(e) => setC({ ...c, documento: e.target.value })} />
        </Field>
        <Field label="Teléfono (opcional)">
          <input className="field" value={c.telefono ?? ''} onChange={(e) => setC({ ...c, telefono: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dirección (opcional)">
          <input className="field" value={c.direccion ?? ''} onChange={(e) => setC({ ...c, direccion: e.target.value })} />
        </Field>
        <Field label="Contacto (opcional)">
          <input className="field" value={c.contacto ?? ''} onChange={(e) => setC({ ...c, contacto: e.target.value })} />
        </Field>
      </div>
      {editando && (
        <label className="flex items-center gap-2 mb-2">
          <input type="checkbox" className="w-5 h-5" checked={!!c.activo} onChange={(e) => setC({ ...c, activo: e.target.checked ? 1 : 0 })} />
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

function ModalHistorial({ comp, onClose }: { comp: Comprador; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    call('compradores:historial', { id: comp.id }).then(setData);
  }, [comp.id]);

  return (
    <Modal open title={`Historial · ${comp.nombre}`} onClose={onClose} wide>
      {!data ? (
        <p className="text-gray-400">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Ventas" valor={String(data.resumen.ventas)} />
            <Stat label="Total kg" valor={formatearKg(data.resumen.gramos)} />
            <Stat label="Total vendido" valor={formatearSoles(data.resumen.total)} />
          </div>
          <h3 className="font-bold text-gray-700 mb-2">Últimas ventas</h3>
          {data.ultimas.length === 0 ? (
            <p className="text-gray-400">Sin ventas registradas.</p>
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
