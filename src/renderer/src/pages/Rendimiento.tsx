import { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui';
import { RendimientoCalc, type ValoresRendimiento } from '../components/RendimientoCalc';
import { call } from '../lib/api';

export default function Rendimiento() {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [v, setV] = useState<ValoresRendimiento>({ muestra: '250', pilado: '', almendra: '' });

  useEffect(() => {
    call<Record<string, string>>('config:get').then((c) => {
      setCfg(c);
      setV((prev) => ({ ...prev, muestra: c.muestra_defecto_g || '250' }));
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="Rendimiento del café"
        subtitle="Calculadora rápida del factor. Solo ingresas los tres pesos."
      />
      <div className="card">
        <RendimientoCalc
          valores={v}
          onChange={setV}
          mermaMin={Number(cfg.merma_min ?? 18)}
          mermaMax={Number(cfg.merma_max ?? 20)}
        />
      </div>
      <p className="text-gray-400 text-sm mt-4">
        Fórmula usada: FACTOR = (70 × muestra inicial) ÷ almendra sana. Esta calculadora es para consulta;
        el factor también se guarda automáticamente al registrar una compra de café.
      </p>
    </div>
  );
}
