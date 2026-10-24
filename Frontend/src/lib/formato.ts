import type { Categoria, Rol } from './tipos';

const ZONA = 'America/Argentina/Buenos_Aires';

export const pesos = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$ ${Math.round(n).toLocaleString('es-AR')}`;

export const numero = (n: number) => n.toLocaleString('es-AR');

export const porcentaje = (parte: number, total: number, decimales = 1) =>
  total > 0 ? `${((parte / total) * 100).toLocaleString('es-AR', { maximumFractionDigits: decimales })}%` : '0%';

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Sábado 21 de Noviembre, 2026" */
export function fechaLarga(iso: string) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('es-AR', { timeZone: ZONA, weekday: 'long' });
  const resto = d.toLocaleDateString('es-AR', { timeZone: ZONA, day: 'numeric', month: 'long' });
  const anio = d.toLocaleDateString('es-AR', { timeZone: ZONA, year: 'numeric' });
  const [num, , mes] = resto.split(' ');
  return `${capitalizar(dia)} ${num} de ${capitalizar(mes)}, ${anio}`;
}

/** "21:00" */
export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });

export const horaSegundos = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/** "21/11/2026" */
export const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });

/** "21/11 21:00" */
export const fechaHoraCorta = (iso: string) =>
  `${new Date(iso).toLocaleDateString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit' })} ${hora(iso)}`;

/** Valor para un <input type="datetime-local"> en hora de Buenos Aires. */
export function aInputFechaHora(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}
export const desdeInputFechaHora = (valor: string) => new Date(`${valor}:00-03:00`).toISOString();

export const dni = (valor: string | null | undefined) => (valor ? Number(valor).toLocaleString('es-AR') : '—');

export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMINISTRADOR: 'Administrador',
  ORGANIZADOR: 'Organizador',
  COMPRADOR: 'Comprador',
  CONTROLADOR: 'Controlador',
};

export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  RECITAL: 'Música / Recital',
  TEATRO: 'Teatro',
  DEPORTE: 'Deporte',
  OTRO: 'Otros espectáculos',
};

/** mm:ss restantes hasta una fecha (o null si ya pasó). */
export function cuentaRegresiva(hasta: string, ahora: number) {
  const ms = new Date(hasta).getTime() - ahora;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
