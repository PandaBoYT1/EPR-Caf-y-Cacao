import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">{title}</h1>
        {subtitle && <p className="text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block mb-4">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-400 mt-1 block">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select {...props} className={`field ${props.className ?? ''}`}>
      {children}
    </select>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button className="text-gray-400 hover:text-gray-700 text-2xl leading-none" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Alerta({ tipo, children }: { tipo: 'ok' | 'error' | 'warn' | 'info'; children: ReactNode }) {
  const estilos = {
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
  }[tipo];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${estilos}`}>{children}</div>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="text-center text-gray-400 py-16 text-lg">{children}</div>;
}
