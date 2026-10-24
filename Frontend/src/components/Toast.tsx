import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { cx, Icono } from './ui';

type TipoToast = 'exito' | 'error' | 'info';
interface Toast {
  id: number;
  tipo: TipoToast;
  mensaje: string;
}

const ContextoToast = createContext<(mensaje: string, tipo?: TipoToast) => void>(() => {});

export function ProveedorToast({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mostrar = useCallback((mensaje: string, tipo: TipoToast = 'exito') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tipo, mensaje }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'error' ? 6000 : 3500);
  }, []);

  return (
    <ContextoToast.Provider value={mostrar}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[70] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-entrar items-start gap-3 rounded-xl border border-nv-line-strong bg-nv-raised px-4 py-3 shadow-z2"
          >
            <Icono
              nombre={t.tipo === 'error' ? 'cancel' : t.tipo === 'info' ? 'info' : 'check_circle'}
              relleno
              className={cx('text-[22px]', t.tipo === 'error' ? 'text-red-400' : t.tipo === 'info' ? 'text-primary' : 'text-tertiary')}
            />
            <p className="text-body-md font-medium text-on-surface">{t.mensaje}</p>
          </div>
        ))}
      </div>
    </ContextoToast.Provider>
  );
}

export const useToast = () => useContext(ContextoToast);
