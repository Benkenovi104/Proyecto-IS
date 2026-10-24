import { env } from '../env';

// Reglas de negocio del caso (sección 1.4 y supuestos adoptados).
export const MAX_ENTRADAS_POR_FUNCION = 6;
export const HORAS_LIMITE_REEMBOLSO = 48;
export const RESERVA_MINUTOS = env.reservaMinutos;
export const EXTENSION_PENDIENTE_MINUTOS = env.extensionPendienteMinutos;
/** Margen para considerar que dos funciones se superponen en la misma sala. */
export const HORAS_OCUPACION_SALA = 4;

const PATENTE_MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
const PATENTE_ANTERIOR = /^[A-Z]{3}\d{3}$/;

export function normalizarPatente(valor: string) {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function patenteValida(valor: string) {
  const p = normalizarPatente(valor);
  return PATENTE_MERCOSUR.test(p) || PATENTE_ANTERIOR.test(p);
}

/** "AB123CD" → "AB 123 CD", "ABC123" → "ABC 123" */
export function formatearPatente(valor: string) {
  const p = normalizarPatente(valor);
  if (PATENTE_MERCOSUR.test(p)) return `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;
  if (PATENTE_ANTERIOR.test(p)) return `${p.slice(0, 3)} ${p.slice(3)}`;
  return p;
}

export function limiteReembolso(fechaFuncion: Date) {
  return new Date(fechaFuncion.getTime() - HORAS_LIMITE_REEMBOLSO * 3600_000);
}

/** Letras de fila: A..Z, AA, AB, ... */
export function letraFila(indice: number): string {
  let n = indice;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
