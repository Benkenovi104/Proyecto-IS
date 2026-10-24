// Cliente HTTP de la API. En desarrollo Vite redirige /api al backend (vite.config.ts).

const CLAVE_SESION = 'ticketfr.sesion';

export class ErrorApi extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function tokenGuardado(): string | null {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null')?.token ?? null;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion: unknown) {
  try {
    if (sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    // Navegación privada sin almacenamiento: la sesión dura lo que la pestaña
  }
}

export function sesionGuardada<T>(): T | null {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null');
  } catch {
    return null;
  }
}

/** Se dispara cuando el backend responde 401 (token vencido o usuario desactivado). */
export const eventoSesionVencida = new EventTarget();

async function solicitud<T>(metodo: string, ruta: string, body?: unknown): Promise<T> {
  const token = tokenGuardado();
  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor', 'SIN_CONEXION');
  }
  if (res.status === 204) return undefined as T;
  const tipo = res.headers.get('content-type') ?? '';
  const datos = tipo.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && token) eventoSesionVencida.dispatchEvent(new Event('vencida'));
    const err = typeof datos === 'object' && datos ? datos : { error: String(datos) };
    throw new ErrorApi(res.status, err.error ?? `Error ${res.status}`, err.code, err.details);
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => solicitud<T>('GET', ruta),
  post: <T>(ruta: string, body: unknown = {}) => solicitud<T>('POST', ruta, body),
  put: <T>(ruta: string, body: unknown) => solicitud<T>('PUT', ruta, body),
  patch: <T>(ruta: string, body: unknown) => solicitud<T>('PATCH', ruta, body),
  delete: <T = void>(ruta: string) => solicitud<T>('DELETE', ruta),
};

/** Descarga un archivo autenticado (p. ej. el CSV de reportes). */
export async function descargar(ruta: string, nombreArchivo: string) {
  const token = tokenGuardado();
  const res = await fetch(`/api${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ErrorApi(res.status, 'No se pudo descargar el archivo');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo });
  a.click();
  URL.revokeObjectURL(url);
}

export const mensajeError = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error inesperado');
