import { calcularRendimiento } from '@shared/domain/rendimiento';
import { Alerta } from './ui';

export interface ValoresRendimiento {
  muestra: string;
  pilado: string;
  almendra: string;
}

export function RendimientoCalc({
  valores,
  onChange,
  mermaMin = 18,
  mermaMax = 20,
}: {
  valores: ValoresRendimiento;
  onChange: (v: ValoresRendimiento) => void;
  mermaMin?: number;
  mermaMax?: number;
}) {
  const muestra = Number(valores.muestra) || 0;
  const pilado = Number(valores.pilado) || 0;
  const almendra = Number(valores.almendra) || 0;
  const listo = muestra > 0 && pilado > 0 && almendra > 0;

  const r = listo
    ? calcularRendimiento(
        { muestraInicialG: muestra, pesoPiladoG: pilado, almendraSanaG: almendra },
        { mermaRefMin: mermaMin, mermaRefMax: mermaMax },
      )
    : null;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <label className="label">Muestra inicial (g)</label>
        <input
          className="field mb-2"
          type="number"
          inputMode="numeric"
          value={valores.muestra}
          onChange={(e) => onChange({ ...valores, muestra: e.target.value })}
        />
        <div className="flex gap-2 mb-3">
          {['200', '250', '300'].map((g) => (
            <button
              key={g}
              type="button"
              className={`px-3 py-1 rounded-full text-sm border ${valores.muestra === g ? 'bg-amber-100 border-amber-300 text-cafe-dark' : 'border-gray-200 text-gray-500'}`}
              onClick={() => onChange({ ...valores, muestra: g })}
            >
              {g} g
            </button>
          ))}
        </div>
        <label className="label">Peso después del pilado (g)</label>
        <input
          className="field mb-3"
          type="number"
          inputMode="numeric"
          value={valores.pilado}
          onChange={(e) => onChange({ ...valores, pilado: e.target.value })}
        />
        <label className="label">Almendra sana (g) — sin los granos malos</label>
        <input
          className="field"
          type="number"
          inputMode="numeric"
          value={valores.almendra}
          onChange={(e) => onChange({ ...valores, almendra: e.target.value })}
        />
      </div>

      <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 flex flex-col justify-center">
        {!listo && <p className="text-amber-700/70 text-center">Ingresa los tres pesos para calcular el rendimiento.</p>}
        {r && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Resultado label="Merma" valor={`${r.mermaG} g`} />
              <Resultado label="Merma %" valor={`${r.mermaPct} %`} />
              <Resultado label="Defectos" valor={`${r.defectosG} g`} />
              <Resultado label="Almendra sana" valor={`${r.almendraSanaG} g`} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="text-center bg-white rounded-xl py-4 border border-amber-200">
                <div className="text-sm text-gray-500">RENDIMIENTO</div>
                <div className="text-5xl font-bold text-cafe">{r.rendimientoPct}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {r.almendraSanaG} ÷ {r.muestraInicialG / 100}
                </div>
              </div>
              <div className="text-center bg-white rounded-xl py-4 border border-amber-200">
                <div className="text-sm text-gray-500">FACTOR</div>
                <div className="text-5xl font-bold text-gray-600">{r.factorMostrar}</div>
                <div className="text-xs text-gray-400 mt-1">
                  (70 × {r.muestraInicialG}) ÷ {r.almendraSanaG}
                </div>
              </div>
            </div>
            {!r.valido && <Alerta tipo="error">{r.errores.join(' ')}</Alerta>}
            {r.valido &&
              r.advertencias.map((a, i) => (
                <div key={i} className="mt-1">
                  <Alerta tipo={a.includes('dentro') ? 'ok' : 'warn'}>{a}</Alerta>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

function Resultado({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-800">{valor}</div>
    </div>
  );
}
