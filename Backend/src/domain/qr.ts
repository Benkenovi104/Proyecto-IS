import type { Tx } from '../db';
import { nuevoCodigoEntrada, nuevoCodigoPase, nuevoCodigoVoucher } from '../lib/codigos';

async function codigoUnico(tx: Tx, generar: () => string) {
  for (let intento = 0; intento < 25; intento++) {
    const codigo = generar();
    const [entrada, pase, voucher, revocado] = await Promise.all([
      tx.entrada.findUnique({ where: { codigoQR: codigo }, select: { id: true } }),
      tx.paseEstacionamiento.findUnique({ where: { codigoQR: codigo }, select: { id: true } }),
      tx.voucherConsumicion.findUnique({ where: { codigoQR: codigo }, select: { id: true } }),
      tx.codigoRevocado.findUnique({ where: { codigo }, select: { codigo: true } }),
    ]);
    if (!entrada && !pase && !voucher && !revocado) return codigo;
  }
  throw new Error('No se pudo generar un código QR único');
}

export const generarCodigoEntrada = (tx: Tx, butaca: { fila: string; numero: number } | null) =>
  codigoUnico(tx, () => nuevoCodigoEntrada(butaca ? `${butaca.fila}${butaca.numero}` : 'GEN'));
export const generarCodigoPase = (tx: Tx) => codigoUnico(tx, nuevoCodigoPase);
export const generarCodigoVoucher = (tx: Tx) => codigoUnico(tx, nuevoCodigoVoucher);

/** Entrada.anular() / regenerarQR(): el código viejo queda registrado para informar el motivo en la puerta. */
export async function revocarCodigo(
  tx: Tx,
  codigo: string | null,
  tipo: 'ENTRADA' | 'PASE' | 'VOUCHER',
  motivo: 'TRANSFERENCIA' | 'REEMBOLSO',
  referenciaId: number,
) {
  if (!codigo) return;
  await tx.codigoRevocado.upsert({
    where: { codigo },
    create: { codigo, tipo, motivo, referenciaId },
    update: { motivo, fecha: new Date() },
  });
}
