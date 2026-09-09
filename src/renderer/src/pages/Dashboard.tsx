import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call } from '../lib/api';
import type { DashboardResumen, PeriodoResumen } from '@shared/types';
import { formatearKg, formatearSoles } from '../lib/format';

type Periodo = 'hoy' | 'semana' | 'mes';

export default function Dashboard() {
  const [r, setR] = useState<DashboardResumen | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const navigate = useNavigate();

  useEffect(() => {
    call<DashboardResumen>('dashboard:resumen').then(setR).catch(() => {});
  }, []);

  const p: PeriodoResumen | null = r ? r[periodo] : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">¿Qué deseas hacer?</h1>

      {/* Cuatro acciones grandes */}
      <div className="grid grid-cols-2 gap-5 max-w-3xl">
        <Accion color="#5fa04a" icon="🛒" label="COMPRAR" onClick={() => navigate('/compras/nueva')} />
        <Accion color="#7b4a24" icon="💰" label="VENDER" onClick={() => navigate('/ventas/nueva')} />
        <Accion color="#2f79c0" icon="📦" label="VER INVENTARIO" onClick={() => navigate('/inventario')} />
        <Accion color="#ef9328" icon="🌱" label="RENDIMIENTO" onClick={() => navigate('/rendimiento')} />
      </div>

      {/* Stock */}
      <div className="mt-10 border-t border-gray-200 pt-6 max-w-3xl">
        <h2 className="text-lg font-bold text-gray-700 mb-5">Resumen rápido</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <Stat label="☕ Café en stock" valor={r ? formatearKg(r.cafe_total_g) : '—'} />
          <Stat label="🍫 Cacao en stock" valor={r ? formatearKg(r.cacao_total_g) : '—'} />
          <Stat label="🗂️ Lotes disponibles" valor={r ? String(r.lotes_disponibles) : '—'} />
        </div>
      </div>

      {/* Movimiento del negocio por periodo */}
      <div className="mt-10 border-t border-gray-200 pt-6 max-w-3xl">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h2 className="text-lg font-bold text-gray-700">Movimiento del negocio</h2>
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {(['hoy', 'semana', 'mes'] as Periodo[]).map((op) => (
              <button
                key={op}
                onClick={() => setPeriodo(op)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition ${
                  periodo === op ? 'bg-white text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {op === 'hoy' ? 'Hoy' : op === 'semana' ? 'Esta semana' : 'Este mes'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PanelMovimiento
            titulo="📥 Compras"
            color="#5fa04a"
            soles={p ? formatearSoles(p.compras_centimos) : '—'}
            kg={p ? formatearKg(p.compras_g) : '—'}
            ops={p?.compras_n ?? 0}
          />
          <PanelMovimiento
            titulo="📤 Ventas"
            color="#2f79c0"
            soles={p ? formatearSoles(p.ventas_centimos) : '—'}
            kg={p ? formatearKg(p.ventas_g) : '—'}
            ops={p?.ventas_n ?? 0}
          />
        </div>
      </div>
    </div>
  );
}

function Accion({ color, icon, label, onClick }: { color: string; icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ backgroundColor: color }}
      className="text-white rounded-2xl flex flex-col items-center justify-center gap-3 shadow-md hover:brightness-105 active:scale-[.98] transition aspect-[4/3] min-h-[150px]"
    >
      <span className="text-5xl">{icon}</span>
      <span className="font-extrabold text-xl tracking-wide">{label}</span>
    </button>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{valor}</div>
    </div>
  );
}

function PanelMovimiento({ titulo, color, soles, kg, ops }: { titulo: string; color: string; soles: string; kg: string; ops: number }) {
  return (
    <div className="card border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-700">{titulo}</span>
        <span className="text-xs text-gray-400">{ops} operación(es)</span>
      </div>
      <div className="text-3xl font-bold mt-2" style={{ color }}>
        {soles}
      </div>
      <div className="text-gray-500 mt-1">{kg}</div>
    </div>
  );
}
