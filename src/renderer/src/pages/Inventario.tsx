import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import type { InventarioBucket } from '@shared/types';
import { PageHeader } from '../components/ui';
import { formatearKg } from '../lib/format';

export default function Inventario() {
  const [buckets, setBuckets] = useState<InventarioBucket[]>([]);

  useEffect(() => {
    call<InventarioBucket[]>('inventario:get').then(setBuckets);
  }, []);

  const porProducto = new Map<string, InventarioBucket[]>();
  for (const b of buckets) {
    const lista = porProducto.get(b.producto_nombre) ?? [];
    lista.push(b);
    porProducto.set(b.producto_nombre, lista);
  }

  return (
    <div>
      <PageHeader title="Inventario" subtitle="Stock disponible en el acopio." />
      <div className="grid md:grid-cols-2 gap-6">
        {[...porProducto.entries()].map(([nombre, lista]) => {
          const total = lista.reduce((s, b) => s + b.gramos, 0);
          const icono = nombre.toLowerCase().includes('cacao') ? '🍫' : '☕';
          return (
            <div key={nombre} className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">
                  {icono} {nombre}
                </h2>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Total</div>
                  <div className="text-2xl font-bold text-emerald-700">{formatearKg(total)}</div>
                </div>
              </div>
              {lista.some((b) => b.estado_nombre) ? (
                <div className="space-y-2">
                  {lista.map((b) => (
                    <div key={b.estado_id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <span className="font-medium text-gray-600">{b.estado_nombre}</span>
                      <span className="font-bold text-gray-800">{formatearKg(b.gramos)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400">Sin clasificación por estado.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
