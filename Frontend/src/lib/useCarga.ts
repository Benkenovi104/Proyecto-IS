import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { mensajeError } from './api';

/** Carga datos asincrónicos y permite recargarlos sin parpadeo (mantiene los datos previos). */
export function useCarga<T>(cargar: () => Promise<T>, deps: DependencyList) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const ultima = useRef(0);

  const ejecutar = useCallback(cargar, deps);

  const recargar = useCallback(async () => {
    const id = ++ultima.current;
    setCargando(true);
    try {
      const resultado = await ejecutar();
      if (id === ultima.current) {
        setDatos(resultado);
        setError(null);
      }
    } catch (e) {
      if (id === ultima.current) setError(mensajeError(e));
    } finally {
      if (id === ultima.current) setCargando(false);
    }
  }, [ejecutar]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { datos, setDatos, error, cargando, recargar };
}

/** Fuerza un re-render periódico (contadores y relojes). */
export function useAhora(intervaloMs = 1000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return ahora;
}
