// Solicitar reembolso (actividad 3.3).
import type { UsuarioAutenticado } from '../auth';
import { prisma } from '../db';
import { claveFuncion, conBloqueo } from '../lib/bloqueo';
import { conflicto, noEncontrado, prohibido } from '../lib/http';
import { enviarCorreo } from '../services/mailing';
import { pasarela } from '../services/pasarela';
import { type CompraDetalle, incluirDetalleCompra, obtenerCompra } from './compras';
import { ENTRADAS_OCUPAN, type EstadoEntrada } from './enums';
import { revocarCodigo } from './qr';
import { HORAS_LIMITE_REEMBOLSO, limiteReembolso } from './reglas';

const fechaCorta = (d: Date) =>
  d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

/** Compra.esReembolsable() + cálculo del monto (entradas + adicionales). */
export function evaluarReembolso(compra: CompraDetalle, usuarioId: number, entradaIds?: number[]) {
  const ahora = new Date();
  const limite = limiteReembolso(compra.funcion.fechaHora);
  const devolvibles = compra.entradas.filter(
    (e) => e.estado === 'VIGENTE' && e.titularId === usuarioId && !!e.codigoQR && e.transferencias.length === 0,
  );
  const seleccion = entradaIds?.length ? devolvibles.filter((e) => entradaIds.includes(e.id)) : devolvibles;

  let motivo: string | null = null;
  if (compra.estado !== 'PAGADA') motivo = 'Solo se pueden devolver compras pagadas';
  else if (ahora >= limite) motivo = `El plazo de devolución venció el ${fechaCorta(limite)} (${HORAS_LIMITE_REEMBOLSO} h antes de la función)`;
  else if (!devolvibles.length) motivo = 'No tenés entradas vigentes para devolver en esta compra';
  else if (entradaIds?.length && seleccion.length !== entradaIds.length) {
    motivo = 'Alguna entrada seleccionada no se puede devolver (usada, transferida o con transferencia pendiente)';
  }

  // Los adicionales se devuelven junto con la última entrada vigente de la compra
  const quedanOtras = compra.entradas.some(
    (e) => ENTRADAS_OCUPAN.includes(e.estado as EstadoEntrada) && !seleccion.some((s) => s.id === e.id),
  );
  const incluyeAdicionales = !quedanOtras;
  const pases = incluyeAdicionales ? compra.pases.filter((p) => p.estado === 'VIGENTE') : [];
  const voucher = incluyeAdicionales && compra.voucher?.estado === 'VIGENTE' ? compra.voucher : null;

  const items = [
    ...seleccion.map((e) => ({
      tipo: 'ENTRADA' as const,
      concepto: `1x ${e.sector.nombre}${e.butaca ? ` (${e.butaca.fila}${e.butaca.numero})` : ''}`,
      monto: e.precio,
    })),
    ...pases.map((p) => ({ tipo: 'PASE' as const, concepto: `1x Pase Estacionamiento (${p.tarifa.playa.nombre})`, monto: p.precio })),
    ...(voucher?.items.map((i) => ({
      tipo: 'CONSUMICION' as const,
      concepto: `${i.cantidad}x ${i.producto.nombre}`,
      monto: i.cantidad * i.precioUnitario,
    })) ?? []),
  ];

  return {
    reembolsable: motivo === null,
    motivo,
    limite,
    incluyeAdicionales,
    entradasDevolvibles: devolvibles.map((e) => e.id),
    entradasSeleccionadas: seleccion.map((e) => e.id),
    items,
    total: items.reduce((a, i) => a + i.monto, 0),
  };
}

async function compraDelComprador(usuario: UsuarioAutenticado, compraId: number) {
  const compra = await prisma.compra.findUnique({ where: { id: compraId }, include: incluirDetalleCompra });
  if (!compra) throw noEncontrado('La compra no existe');
  if (compra.compradorId !== usuario.id) throw prohibido();
  return compra;
}

export async function previsualizarReembolso(usuario: UsuarioAutenticado, compraId: number, entradaIds?: number[]) {
  return evaluarReembolso(await compraDelComprador(usuario, compraId), usuario.id, entradaIds);
}

export async function solicitarReembolso(
  usuario: UsuarioAutenticado,
  compraId: number,
  datos: { entradaIds?: number[]; motivo: string },
) {
  const base = await compraDelComprador(usuario, compraId);
  await conBloqueo(claveFuncion(base.funcionId), () =>
    prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId }, include: incluirDetalleCompra });
      const ev = evaluarReembolso(compra, usuario.id, datos.entradaIds);
      if (!ev.reembolsable) throw conflicto(ev.motivo!, 'NO_REEMBOLSABLE');

      const reembolso = await tx.reembolso.create({
        data: { compraId, montoReintegrado: ev.total, motivo: datos.motivo, estado: 'PENDIENTE' },
      });

      // 1) Anular los QR de lo devuelto (antes de reintegrar el dinero)
      for (const entrada of compra.entradas.filter((e) => ev.entradasSeleccionadas.includes(e.id))) {
        await revocarCodigo(tx, entrada.codigoQR, 'ENTRADA', 'REEMBOLSO', entrada.id);
        await tx.entrada.update({ where: { id: entrada.id }, data: { estado: 'ANULADA', reembolsoId: reembolso.id } });
      }
      if (ev.incluyeAdicionales) {
        for (const pase of compra.pases.filter((p) => p.estado === 'VIGENTE')) {
          await revocarCodigo(tx, pase.codigoQR, 'PASE', 'REEMBOLSO', pase.id);
          await tx.paseEstacionamiento.update({ where: { id: pase.id }, data: { estado: 'ANULADA' } });
        }
        if (compra.voucher?.estado === 'VIGENTE') {
          await revocarCodigo(tx, compra.voucher.codigoQR, 'VOUCHER', 'REEMBOLSO', compra.voucher.id);
          for (const item of compra.voucher.items) {
            await tx.productoConsumicion.update({ where: { id: item.productoId }, data: { stockDisponible: { increment: item.cantidad } } });
          }
          await tx.voucherConsumicion.update({ where: { id: compra.voucher.id }, data: { estado: 'ANULADA' } });
        }
      }

      // 2) Solicitar el reintegro a la pasarela
      const reintegro = pasarela.reintegrar({ idTransaccionOriginal: compra.idTransaccionPago, monto: ev.total });
      if (reintegro.estado !== 'APROBADO') {
        // Queda PENDIENTE para reintento; las ubicaciones ya están liberadas porque los QR se anularon
        await enviarCorreo(tx, compra.comprador.email, 'Reembolso en proceso', `Tu reembolso de la compra ${compra.codigo} quedó pendiente; lo reintentaremos.`);
        return;
      }

      // 3) Liberar ubicaciones, cupo y stock (hecho arriba) y completar
      await tx.reembolso.update({
        where: { id: reembolso.id },
        data: { estado: 'COMPLETADO', idTransaccionReintegro: reintegro.idTransaccion },
      });
      const quedan = await tx.entrada.count({ where: { compraId, estado: { in: ENTRADAS_OCUPAN } } });
      if (quedan === 0) await tx.compra.update({ where: { id: compraId }, data: { estado: 'REEMBOLSADA' } });

      await enviarCorreo(
        tx,
        compra.comprador.email,
        'Comprobante de reembolso',
        `Reintegramos $ ${ev.total.toLocaleString('es-AR')} de la compra ${compra.codigo} (operación ${reintegro.idTransaccion}). ` +
          `Detalle: ${ev.items.map((i) => i.concepto).join(', ')}. Los códigos QR devueltos quedaron anulados.`,
      );
    }),
  );
  return obtenerCompra(compraId, usuario);
}
