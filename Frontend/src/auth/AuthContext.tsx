import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, eventoSesionVencida, guardarSesion, sesionGuardada } from '../lib/api';
import type { Rol, Sesion, Usuario } from '../lib/tipos';

export const RUTA_INICIO: Record<Rol, string> = {
  ADMINISTRADOR: '/admin/salas',
  ORGANIZADOR: '/organizador',
  COMPRADOR: '/cartelera',
  CONTROLADOR: '/control',
};

interface ContextoAuth {
  usuario: Usuario | null;
  listo: boolean;
  demoHabilitado: boolean;
  iniciarSesion: (email: string, password: string) => Promise<Usuario>;
  registrar: (datos: { nombre: string; dni: string; email: string; password: string }) => Promise<Usuario>;
  ingresarDemo: (rol: Rol) => Promise<Usuario>;
  cerrarSesion: () => void;
}

const Contexto = createContext<ContextoAuth | null>(null);

export function ProveedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => sesionGuardada<Sesion>()?.usuario ?? null);
  const [listo, setListo] = useState(false);
  const [demoHabilitado, setDemoHabilitado] = useState(false);

  const aplicar = useCallback((sesion: Sesion | null) => {
    guardarSesion(sesion);
    setUsuario(sesion?.usuario ?? null);
    return sesion?.usuario ?? null;
  }, []);

  useEffect(() => {
    api.get<{ habilitado: boolean }>('/auth/demo').then((r) => setDemoHabilitado(r.habilitado), () => setDemoHabilitado(false));
    const sesion = sesionGuardada<Sesion>();
    if (!sesion) {
      setListo(true);
      return;
    }
    api
      .get<Usuario>('/auth/me')
      .then((u) => aplicar({ ...sesion, usuario: u }))
      .catch(() => aplicar(null))
      .finally(() => setListo(true));
  }, [aplicar]);

  useEffect(() => {
    const alVencer = () => aplicar(null);
    eventoSesionVencida.addEventListener('vencida', alVencer);
    return () => eventoSesionVencida.removeEventListener('vencida', alVencer);
  }, [aplicar]);

  const valor: ContextoAuth = {
    usuario,
    listo,
    demoHabilitado,
    iniciarSesion: async (email, password) => aplicar(await api.post<Sesion>('/auth/login', { email, password }))!,
    registrar: async (datos) => aplicar(await api.post<Sesion>('/auth/registro', datos))!,
    ingresarDemo: async (rol) => aplicar(await api.post<Sesion>('/auth/demo', { rol }))!,
    cerrarSesion: () => aplicar(null),
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth fuera de ProveedorAuth');
  return ctx;
}
