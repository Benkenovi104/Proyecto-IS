// Transferir y aceptar una entrada (actividad 3.4).
import type { UsuarioAutenticado } from '../auth';
import { prisma } from '../db';
import { claveFuncion, conBloqueo } from '../lib/bloqueo';
import { conflicto, HttpError, noEncontrado, prohibido, solicitudInvalida } from '../lib/http';
import { enviarCorreo } from '../services/mailing';
import { ubicacionTexto } from './compras';
import { enListaNegra, entradasDelTitular } from './ocupacion';
import { generarCodigoEntrada, revocarCodigo } from './qr';
import { MAX_ENTRADAS_POR_FUNCION } from './reglas';

export async function iniciarTransferencia(
  usuario: UsuarioAutenticado,
  entradaId: number,
  destino: { dni?: string; email?: string },
) {
  const entrada = await prisma.entrada.findUnique({
    where: { id: entradaId },
    include: {
      compra: true,
      sector: true,
      butaca: true,
      funcion: { include: { evento: true } },
      transferencias: { where: { estado: 'PENDIENTE' } },
    },
  });
  if (!entrada) throw noEncontrado('La entrada no existe');
  if (entrada.titularId !== usuario.id) throw prohibido('Solo el titular actual puede transferir la entrada');
  if (entrada.estado !== 'VIGENTE' || entrada.compra.estado !== 'PAGADA' || !entrada.codigoQR) {
    throw conflicto('La entrada no está vigente', 'ENTRADA_NO_VIGENTE');
  }
  if (entrada.transferencias.length) throw conflicto('Esta entrada ya tiene una transferencia pendiente', 'TRANSFERENCIA_PENDIENTE');
  if (entrada.funcion.fechaHora <= new Date()) throw conflicto('La función ya comenzó', 'FUNCION_INICIADA');

  const dni = destino.dni?.replace(/\D/g, '') || undefined;
  const email = destino.email?.trim().toLowerCase() || undefined;
  if (!dni && !email) throw solicitudInvalida('Indicá el DNI o el email del destinatario');
  const destinatario = await prisma.usuario.findFirst({
    where: { rol: 'COMPRADOR', activo: true, OR: [...(dni ? [{ dni }] : []), ...(email ? [{ email }] : [])] },
  });
  if (!destinatario) {
    throw noEncontrado('El destinatario debe estar registrado en TicketFr: no encontramos ese DNI o email', 'DESTINATARIO_NO_REGISTRADO');
  }
  if (destinatario.id === usuario.id) throw solicitudInvalida('No podés transferirte una entrada a vos mismo');
  if (await enListaNegra(prisma, destinatario.dni)) {
    throw prohibido('El destinatario no puede recibir entradas (derecho de admisión)');
  }
  if ((await entradasDelTitular(prisma, destinatario.id, entrada.funcionId)) >= MAX_ENTRADAS_POR_FUNCION) {
    throw conflicto(`El destinatario ya tiene el máximo de ${MAX_ENTRADAS_POR_FUNCION} entradas para esta función`, 'TOPE_ENTRADAS');
  }

  return prisma.$transaction(async (tx) => {
    const transferencia = await tx.transferenciaEntrada.create({
      data: { entradaId, cedenteId: usuario.id, destinatarioId: destinatario.id },
    });
    await enviarCorreo(
      tx,
      destinatario.email,
      'Te transfirieron una entrada',
      `${usuario.nombre} quiere transferirte una entrada para ${entrada.funcion.evento.nombre} ` +
        `(${entrada.sector.nombre} · ${ubicacionTexto(entrada)}). Aceptala o rechazala desde "Mis Compras".`,
    );
    return transferencia;
  });
}

async function transferenciaPendiente(id: number) {
  const t = await prisma.transferenciaEntrada.findUnique({ where: { id }, include: { entrada: true } });
  if (!t) throw noEncontrado('La transferencia no existe');
  if (t.estado !== 'PENDIENTE') throw conflicto('La transferencia ya fue respondida', 'TRANSFERENCIA_RESPONDIDA');
  return t;
}

export async function aceptarTransferencia(usuario: UsuarioAutenticado, transferenciaId: number) {
  const t = await transferenciaPendiente(transferenciaId);
  if (t.destinatarioId !== usuario.id) throw prohibido('Esta transferencia no está dirigida a vos');

  const error = await conBloqueo(claveFuncion(t.entrada.funcionId), () =>
    prisma.$transaction(async (tx) => {
      const entrada = await tx.entrada.findUniqueOrThrow({
        where: { id: t.entradaId },
        include: { compra: true, butaca: true, sector: true, funcion: { include: { evento: true } } },
      });
      const cedente = await tx.usuario.findUniqueOrThrow({ where: { id: t.cedenteId } });

      const cancelar = async (mensaje: string) => {
        await tx.transferenciaEntrada.update({ where: { id: t.id }, data: { estado: 'CANCELADA', fechaRespuesta: new Date() } });
        await enviarCorreo(tx, cedente.email, 'Transferencia cancelada', `La transferencia de tu entrada no se pudo completar: ${mensaje}`);
        return mensaje;
      };

      // ¿La entrada sigue vigente? (pudo haberse usado o reembolsado mientras estaba pendiente)
      if (entrada.estado !== 'VIGENTE' || entrada.titularId !== t.cedenteId || entrada.compra.estado !== 'PAGADA') {
        return cancelar('la entrada ya no está vigente');
      }
      if (await enListaNegra(tx, usuario.dni)) return cancelar('el destinatario tiene restringido el derecho de admisión');
      if ((await entradasDelTitular(tx, usuario.id, entrada.funcionId)) >= MAX_ENTRADAS_POR_FUNCION) {
        return cancelar(`el destinatario ya tiene ${MAX_ENTRADAS_POR_FUNCION} entradas para la función`);
      }

      // Entrada.regenerarQR(): anular el QR anterior y emitir uno nuevo para el nuevo titular
      await revocarCodigo(tx, entrada.codigoQR, 'ENTRADA', 'TRANSFERENCIA', entrada.id);
      const nuevoCodigo = await generarCodigoEntrada(tx, entrada.butaca);
      await tx.entrada.update({ where: { id: entrada.id }, data: { codigoQR: nuevoCodigo, titularId: usuario.id } });
      await tx.transferenciaEntrada.update({ where: { id: t.id }, data: { estado: 'ACEPTADA', fechaRespuesta: new Date() } });

      await enviarCorreo(
        tx,
        usuario.email,
        `Tu entrada para ${entrada.funcion.evento.nombre}`,
        `Aceptaste la entrada que te envió ${cedente.nombre} (${entrada.sector.nombre} · ${ubicacionTexto(entrada)}). Tu nuevo QR ya está en "Mis Compras".`,
      );
      await enviarCorreo(
        tx,
        cedente.email,
        'Transferencia aceptada',
        `${usuario.nombre} aceptó la entrada para ${entrada.funcion.evento.nombre}. Tu código QR anterior quedó anulado.`,
      );
      return null;
    }),
  );
  if (error) throw new HttpError(409, `No se pudo aceptar: ${error}`, 'TRANSFERENCIA_CANCELADA');
}

export async function rechazarTransferencia(usuario: UsuarioAutenticado, transferenciaId: number) {
  const t = await transferenciaPendiente(transferenciaId);
  if (t.destinatarioId !== usuario.id) throw prohibido('Esta transferencia no está dirigida a vos');
  await prisma.$transaction(async (tx) => {
    await tx.transferenciaEntrada.update({ where: { id: t.id }, data: { estado: 'RECHAZADA', fechaRespuesta: new Date() } });
    const cedente = await tx.usuario.findUniqueOrThrow({ where: { id: t.cedenteId } });
    await enviarCorreo(tx, cedente.email, 'Transferencia rechazada', `${usuario.nombre} rechazó la entrada que le transferiste. Seguís siendo el titular.`);
  });
}

export async function cancelarTransferencia(usuario: UsuarioAutenticado, transferenciaId: number) {
  const t = await transferenciaPendiente(transferenciaId);
  if (t.cedenteId !== usuario.id) throw prohibido('Solo quien inició la transferencia puede cancelarla');
  await prisma.transferenciaEntrada.update({ where: { id: t.id }, data: { estado: 'CANCELADA', fechaRespuesta: new Date() } });
}
