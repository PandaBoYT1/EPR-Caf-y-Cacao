import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useSession } from './state/session';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Compras from './pages/Compras';
import NuevaCompra from './pages/NuevaCompra';
import Ventas from './pages/Ventas';
import NuevaVenta from './pages/NuevaVenta';
import Inventario from './pages/Inventario';
import Proveedores from './pages/Proveedores';
import Compradores from './pages/Compradores';
import Lotes from './pages/Lotes';
import Rendimiento from './pages/Rendimiento';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';

interface Item {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
}

const principal: Item[] = [
  { to: '/', icon: '🏠', label: 'Inicio', end: true },
  { to: '/compras', icon: '🛒', label: 'Compras' },
  { to: '/ventas', icon: '💰', label: 'Ventas' },
  { to: '/inventario', icon: '📦', label: 'Inventario' },
];

const mas: Item[] = [
  { to: '/lotes', icon: '🗂️', label: 'Lotes' },
  { to: '/proveedores', icon: '👨‍🌾', label: 'Proveedores' },
  { to: '/compradores', icon: '🤝', label: 'Compradores' },
  { to: '/rendimiento', icon: '🌱', label: 'Rendimiento' },
  { to: '/reportes', icon: '📊', label: 'Reportes' },
  { to: '/configuracion', icon: '⚙️', label: 'Configuración', adminOnly: true },
];

function NavItem({ item }: { item: Item }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center rounded-2xl mx-2 py-3 transition ${
          isActive ? 'bg-green-50 text-green-700' : 'text-gray-500 hover:bg-gray-100'
        }`
      }
    >
      <span className="text-2xl leading-none">{item.icon}</span>
      <span className="text-[11px] font-semibold mt-1 text-center leading-tight">{item.label}</span>
    </NavLink>
  );
}

function Sidebar() {
  const { usuario, setUsuario, esAdmin } = useSession();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const items = mas.filter((m) => !m.adminOnly || esAdmin);

  return (
    <aside className="w-24 shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-2 py-4 text-center border-b border-gray-100">
        <div className="text-2xl">☕</div>
        <div className="text-[10px] font-bold text-gray-400 leading-tight mt-1">ACOPIO</div>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto space-y-1">
        {principal.map((it) => (
          <NavItem key={it.to} item={it} />
        ))}

        <button
          onClick={() => setAbierto((v) => !v)}
          className={`w-[calc(100%-1rem)] flex flex-col items-center justify-center rounded-2xl mx-2 py-3 transition ${
            abierto ? 'bg-gray-100 text-gray-700' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <span className="text-2xl leading-none">{abierto ? '✕' : '•••'}</span>
          <span className="text-[11px] font-semibold mt-1">Más</span>
        </button>

        {abierto && (
          <div className="pt-1 border-t border-gray-100 mt-1 space-y-1">
            {items.map((it) => (
              <NavItem key={it.to} item={it} />
            ))}
          </div>
        )}
      </nav>

      <div className="px-2 py-3 border-t border-gray-100 text-center">
        <div
          className="w-10 h-10 rounded-full bg-green-100 text-green-700 font-bold flex items-center justify-center mx-auto mb-1"
          title={usuario?.nombre}
        >
          {usuario?.nombre?.charAt(0).toUpperCase()}
        </div>
        <button
          className="text-[11px] text-gray-400 hover:text-gray-700"
          onClick={() => {
            setUsuario(null);
            navigate('/');
          }}
        >
          Salir
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  const { usuario } = useSession();
  if (!usuario) return <Login />;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/compras/nueva" element={<NuevaCompra />} />
            <Route path="/ventas" element={<Ventas />} />
            <Route path="/ventas/nueva" element={<NuevaVenta />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/lotes" element={<Lotes />} />
            <Route path="/proveedores" element={<Proveedores />} />
            <Route path="/compradores" element={<Compradores />} />
            <Route path="/rendimiento" element={<Rendimiento />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/configuracion" element={<Configuracion />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
