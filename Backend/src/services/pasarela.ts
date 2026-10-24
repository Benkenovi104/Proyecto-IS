// Pasarela de pagos «externo» (simulada).
// El checkout puede pedir explícitamente un resultado para demostrar los tres caminos
// del diagrama de actividades 3.1: aprobado, rechazado y sin respuesta (webhook tardío).
import { env } from '../env';
import { nuevoIdTransaccion } from '../lib/codigos';

export type ResultadoSimulado = 'APROBADO' | 'RECHAZADO' | 'SIN_RESPUESTA';

export type RespuestaCobro =
  | { estado: 'APROBADO'; idTransaccion: string }
  | { estado: 'RECHAZADO'; motivo: string }
  | { estado: 'SIN_RESPUESTA'; idTransaccion: string };

export const pasarela = {
  cobrar({ monto, simular = 'APROBADO' }: { referencia: string; monto: number; simular?: ResultadoSimulado }): RespuestaCobro {
    if (monto <= 0) return { estado: 'RECHAZADO', motivo: 'Monto inválido' };
    if (simular === 'RECHAZADO') return { estado: 'RECHAZADO', motivo: 'La entidad emisora rechazó la operación (fondos insuficientes)' };
    const idTransaccion = nuevoIdTransaccion('PAY');
    if (simular === 'SIN_RESPUESTA') return { estado: 'SIN_RESPUESTA', idTransaccion };
    return { estado: 'APROBADO', idTransaccion };
  },

  /** Simula el webhook que la pasarela envía cuando finalmente procesa un cobro pendiente. */
  alConfirmarCobro(idTransaccion: string, callback: (idTransaccion: string) => Promise<void>) {
    setTimeout(() => {
      callback(idTransaccion).catch((err) => console.error('[pasarela] error procesando webhook', err));
    }, env.pasarelaWebhookSegundos * 1000);
  },

  reintegrar({ monto }: { idTransaccionOriginal: string | null; monto: number }) {
    if (monto < 0) return { estado: 'RECHAZADO' as const, motivo: 'Monto inválido' };
    return { estado: 'APROBADO' as const, idTransaccion: nuevoIdTransaccion('REF') };
  },
};
