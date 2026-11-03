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

function firmaCoincide(codigo: string, firma: string) {
  const esperada = Buffer.from(firmar(codigo));
  const recibida = Buffer.from(firma.toLowerCase());
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

const QR_FIRMADO = /^TFR1:([A-Z0-9-]+):([0-9a-f]{16})$/i;
/** Código tipeado + HASH impreso debajo del QR: `#ENT-12345-A5 8f9a-11ce-b04d-e921`. */
const CODIGO_CON_HASH = /^#?([A-Z0-9-]+)\s+([0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4})$/i;

/**
 * Interpreta lo que llega del lector: un QR completo (`TFR1:CODIGO:FIRMA`), un código tipeado
 * con su HASH, o una consulta sin firma (`#ENT-12345-A5`, `PAT-AB123CD`, `DNI-38452190`).
 * `firmaValida` es null cuando no vino firma: el control decide si la exige.
 */
export function leerCodigo(entrada: string): { codigo: string; firmaValida: boolean | null } {
  const limpio = entrada.trim();
  const firmado = QR_FIRMADO.exec(limpio) ?? CODIGO_CON_HASH.exec(limpio);
  if (firmado) {
    const codigo = firmado[1].toUpperCase();
    return { codigo, firmaValida: firmaCoincide(codigo, firmado[2].replace(/-/g, '')) };
  }
  return { codigo: limpio.toUpperCase().replace(/^#/, '').replace(/\s+/g, ''), firmaValida: null };
}
