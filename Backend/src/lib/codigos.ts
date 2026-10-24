import crypto from 'node:crypto';
import { env } from '../env';

const DIGITOS = '0123456789';
const ALFANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function aleatorio(alfabeto: string, largo: number) {
  const bytes = crypto.randomBytes(largo);
  let s = '';
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return s;
}

export const nuevoCodigoCompra = () => `TFR-${aleatorio(DIGITOS, 5)}`;
export const nuevoCodigoEntrada = (sufijo: string) => `ENT-${aleatorio(DIGITOS, 5)}-${sufijo}`;
export const nuevoCodigoPase = () => `PRK-${aleatorio(DIGITOS, 5)}-${aleatorio(ALFANUM, 1)}`;
export const nuevoCodigoVoucher = () => `VCH-${aleatorio(DIGITOS, 4)}-${aleatorio(ALFANUM, 1)}`;
export const nuevoPin = () => aleatorio(DIGITOS, 4);
export const nuevoIdTransaccion = (prefijo: string) => `${prefijo}-${Date.now().toString(36).toUpperCase()}${aleatorio(ALFANUM, 4)}`;

/** Firma HMAC del código: evita que se fabriquen QR válidos a mano. */
export function firmar(codigo: string) {
  return crypto.createHmac('sha256', env.qrSecret).update(codigo).digest('hex').slice(0, 16);
}

/** Contenido que se codifica dentro del QR. */
export const contenidoQR = (codigo: string) => `TFR1:${codigo}:${firmar(codigo)}`;

/** "8f9a11ceb04de921" → "8f9a-11ce-b04d-e921" (como se muestra debajo del QR). */
export const hashVisible = (codigo: string) => firmar(codigo).match(/.{4}/g)!.join('-');

/**
 * Interpreta lo que llega del lector: un QR completo (`TFR1:CODIGO:FIRMA`) o un código
 * tipeado a mano en modo contingencia (`#ENT-12345-A5`, `PAT-AB123CD`, `DNI-38452190`).
 */
export function leerCodigo(entrada: string): { codigo: string; firmaValida: boolean | null } {
  const limpio = entrada.trim();
  const qr = /^TFR1:([A-Z0-9-]+):([0-9a-f]{16})$/i.exec(limpio);
  if (qr) {
    const codigo = qr[1].toUpperCase();
    return { codigo, firmaValida: firmar(codigo) === qr[2].toLowerCase() };
  }
  return { codigo: limpio.toUpperCase().replace(/^#/, '').replace(/\s+/g, ''), firmaValida: null };
}
