import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import type { InventarioBucket } from '@shared/types';
import { PageHeader, Alerta, Vacio } from '../components/ui';
import { formatearKg, formatearSoles, fechaCorta } from '../lib/format';

type Vista = 'comprasProv' | 'ventasComp' | 'inventario' | 'rendimiento';

export default function Reportes() {
  const [vista, setVista] = useState<Vista>('comprasProv');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [datos, setDatos] = useState<any[]>([]);
  const [inv, setInv] = useState<InventarioBucket[]>([]);
  const [msg, setMsg] = useState('');

  const filtro = { fecha_desde: desde || undefined, fecha_hasta: hasta || undefined };

  function cargar() {
    if (vista === 'inventario') {
      call<InventarioBucket[]>('inventario:get').then(setInv);
      return;
    }
    const canal = { comprasProv: 'reportes:comprasPorProveedor', ventasComp: 'reportes:ventasPorComprador', rendimiento: 'reportes:rendimientos' }[vista];
    call<any[]>(canal, filtro).then(setDatos);
  }

  useEffect(cargar, [vista, desde, hasta]);

  async function exportar() {
    setMsg('');
    try {
      const res = await call<{ canceled: boolean; path?: string }>('reportes:exportarExcel', filtro);
      if (!res.canceled) setMsg(`✅ Excel guardado en: ${res.path}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    }
  }

  async function respaldar() {
    setMsg('');
    try {
      const res = await call<{ carpeta: string; archivos: string[] }>('backup:ejecutar');
      setMsg(`✅ Respaldo creado en ${res.carpeta} (${res.archivos.join(', ')})`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    }
  }

  const tabs: [Vista, string][] = [
    ['comprasProv', 'Compras por proveedor'],
    ['ventasComp', 'Ventas por comprador'],
    ['inventario', 'Inventario actual'],
    ['rendimiento', 'Historial de rendimiento'],
  ];

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Consulta y exporta la información del negocio."
        action={
          <div className="flex gap-2">
            <button className="btn-neutral" onClick={respaldar}>
              ☁️ Respaldar ahora
            </button>
            <button className="btn-primary" onClick={exportar}>
              📊 Exportar a Excel
            </button>
          </div>
        }
      />

      {msg && (
        <div className="mb-4">
          <Alerta tipo={msg.startsWith('✅') ? 'ok' : 'error'}>{msg}</Alerta>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`px-4 py-2 rounded-xl font-medium transition ${vista === v ? 'bg-cafe text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {vista !== 'inventario' && (
        <div className="card mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <span className="label">Desde</span>
            <input className="field" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <span className="label">Hasta</span>
            <input className="field" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {(desde || hasta) && (
            <button className="btn-neutral" onClick={() => { setDesde(''); setHasta(''); }}>
              Limpiar
            </button>
          )}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        {vista === 'inventario' && <TablaInventario inv={inv} />}
        {vista === 'comprasProv' && <TablaPersonas datos={datos} etiqueta="Proveedor" />}
        {vista === 'ventasComp' && <TablaPersonas datos={datos} etiqueta="Comprador" />}
        {vista === 'rendimiento' && <TablaRendimiento datos={datos} />}
      </div>
    </div>
  );
}

function TablaInventario({ inv }: { inv: InventarioBucket[] }) {
  if (inv.length === 0) return <Vacio>Sin datos.</Vacio>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-left">
        <tr>
          <th className="px-4 py-3">Producto</th>
          <th className="px-4 py-3">Estado</th>
          <th className="px-4 py-3 text-right">Stock</th>
        </tr>
      </thead>
      <tbody>
        {inv.map((b, i) => (
          <tr key={i} className="border-t">
            <td className="px-4 py-3">{b.producto_nombre}</td>
            <td className="px-4 py-3">{b.estado_nombre ?? '—'}</td>
            <td className="px-4 py-3 text-right font-semibold">{formatearKg(b.gramos)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaPersonas({ datos, etiqueta }: { datos: any[]; etiqueta: string }) {
  if (datos.length === 0) return <Vacio>Sin datos para el periodo.</Vacio>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-left">
        <tr>
          <th className="px-4 py-3">{etiqueta}</th>
          <th className="px-4 py-3 text-right">Operaciones</th>
          <th className="px-4 py-3 text-right">Kg</th>
          <th className="px-4 py-3 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {datos.map((d, i) => (
          <tr key={i} className="border-t">
            <td className="px-4 py-3 font-medium">{d.proveedor ?? d.comprador}</td>
            <td className="px-4 py-3 text-right">{d.operaciones}</td>
            <td className="px-4 py-3 text-right">{formatearKg(d.gramos)}</td>
            <td className="px-4 py-3 text-right font-semibold">{formatearSoles(d.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaRendimiento({ datos }: { datos: any[] }) {
  if (datos.length === 0) return <Vacio>Sin registros de rendimiento.</Vacio>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-left">
        <tr>
          <th className="px-4 py-3">Código</th>
          <th className="px-4 py-3">Fecha</th>
          <th className="px-4 py-3">Proveedor</th>
          <th className="px-4 py-3 text-right">Merma</th>
          <th className="px-4 py-3 text-right">Merma %</th>
          <th className="px-4 py-3 text-right">Rendimiento</th>
          <th className="px-4 py-3 text-right">Factor</th>
        </tr>
      </thead>
      <tbody>
        {datos.map((d, i) => (
          <tr key={i} className="border-t">
            <td className="px-4 py-3 font-mono">{d.codigo}</td>
            <td className="px-4 py-3">{fechaCorta(d.fecha)}</td>
            <td className="px-4 py-3">{d.proveedor}</td>
            <td className="px-4 py-3 text-right">{d.merma_g} g</td>
            <td className="px-4 py-3 text-right">{d.merma_pct} %</td>
            <td className="px-4 py-3 text-right font-semibold">{d.rendimiento_pct ?? '—'}</td>
            <td className="px-4 py-3 text-right">{d.factor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
