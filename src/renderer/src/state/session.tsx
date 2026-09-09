import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Usuario } from '@shared/types';

interface SessionCtx {
  usuario: Usuario | null;
  setUsuario: (u: Usuario | null) => void;
  esAdmin: boolean;
}

const Ctx = createContext<SessionCtx>({ usuario: null, setUsuario: () => {}, esAdmin: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  return (
    <Ctx.Provider value={{ usuario, setUsuario, esAdmin: usuario?.rol === 'ADMINISTRADOR' }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionCtx {
  return useContext(Ctx);
}
