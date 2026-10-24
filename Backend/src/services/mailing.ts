// Servicio de mailing «externo» (simulado).
// Los correos se guardan en la tabla Notificacion dentro de la misma transacción que
// originó el evento (patrón outbox) y se pueden ver desde la app en "Mis notificaciones".
import type { Tx } from '../db';
import { prisma } from '../db';

export async function enviarCorreo(db: Tx | typeof prisma, para: string, asunto: string, cuerpo: string) {
  await db.notificacion.create({ data: { para, asunto, cuerpo } });
  console.log(`[mailing] → ${para}: ${asunto}`);
}
