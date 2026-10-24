// Comprar entradas (actividad 3.1) y vencimiento de la reserva (actividad 3.2).
import type { Prisma } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth';
import { prisma, type Tx } from '../db';
import { claveFuncion, conBloqueo } from '../lib/bloqueo';
import { contenidoQR, hashVisible, nuevoCodigoCompra, nuevoPin } from '../lib/codigos';
import { conflicto, HttpError, noEncontrado, prohibido, solicitudInvalida } from '../lib/http';
import { enviarCorreo } from '../services/mailing';
import { pasarela, type ResultadoSimulado } from '../services/pasarela';
import { ENTRADAS_OCUPAN, type EstadoEntrada } from './enums';
import { enListaNegra, entradasDelTitular, ocupacionFuncion, pasesActivos } from './ocupacion';
import { precioVigente } from './precios';
import { generarCodigoEntrada, generarCodigoPase, generarCodigoVoucher } from './qr';
import {
  EXTENSION_PENDIENTE_MINUTOS,
  MAX_ENTRADAS_POR_FUNCION,
  RESERVA_MINUTOS,
  formatearPatente,
  normalizarPatente,
  patenteValida,
} from './reglas';

// ─── Lectura y serialización ─────────────────────────────────────────────────

const usuarioBasico = { select: { id: true, nombre: true, email: true, dni: true } } as const;

export const incluirEntrada = {
  sector: true,
  butaca: true,
  titular: usuarioBasico,
  transferencias: { where: { estado: 'PENDIENTE' }, include: { destinatario: usuarioBasico } },
} satisfies Prisma.EntradaInclude;

export const incluirDetalleCompra = {
  comprador: usuarioBasico,
  funcion: { include: { evento: true, sala: true } },
  entradas: { include: incluirEntrada, orderBy: { id: 'asc' } },
  pases: { include: { tarifa: { include: { playa: true } } }, orderBy: { id: 'asc' } },
  voucher: { include: { items: { include: { producto: true } } } },
  reembolsos: { include: { entradas: { select: { id: true } } }, orderBy: { id: 'asc' } },
} satisfies Prisma.CompraInclude;

export type CompraDetalle = Prisma.CompraGetPayload<{ include: typeof incluirDetalleCompra }>;
type EntradaDetalle = Prisma.EntradaGetPayload<{ include: typeof incluirEntrada }>;

const vigente = (estado: string) => estado !== 'ANULADA';
const suma = (valores: number[]) => valores.reduce((a, b) => a + b, 0);

export function ubicacionTexto(e: { sector: { nombre: string }; butaca: { fila: string; numero: number } | null }) {
  return e.butaca ? `Fila ${e.butaca.fila}, Butaca ${e.butaca.fila}${e.butaca.numero}` : 'Sin numerar (cupo general)';
}

export function serializarEntrada(e: EntradaDetalle, viewerId: number) {
  const esTitular = e.titularId === viewerId;
  const mostrarQR = esTitular && !!e.codigoQR && e.estado !== 'ANULADA';
  const pendiente = e.transferencias[0];
  return {
    id: e.id,
    precio: e.precio,
    estado: e.estado as EstadoEntrada,
    usadaEn: e.usadaEn,
    reembolsada: e.reembolsoId !== null,
    sector: {
      id: e.sector.id,
      codigo: e.sector.codigo,
      nombre: e.sector.nombre,
      color: e.sector.color,
      numerado: e.sector.numerado,
      puertaAcceso: e.sector.puertaAcceso,
    },
    butaca: e.butaca ? { id: e.butaca.id, fila: e.butaca.fila, numero: e.butaca.numero } : null,
    ubicacion: ubicacionTexto(e),
    titular: { id: e.titular.id, nombre: e.titular.nombre, dni: e.titular.dni },
    esTitular,
    codigo: esTitular ? e.codigoQR : null,
    qr: mostrarQR ? contenidoQR(e.codigoQR!) : null,
    hash: mostrarQR ? hashVisible(e.codigoQR!) : null,
    transferenciaPendiente: pendiente
      ? { id: pendiente.id, fechaHora: pendiente.fechaHora, destinatario: pendiente.destinatario }
      : null,
  };
}

export function serializarFuncionResumen(f: CompraDetalle['funcion']) {
  return {
    id: f.id,
    codigo: f.codigo,
    fechaHora: f.fechaHora,
    estado: f.estado,
    exigePatente: f.exigePatente,
    aperturaPlaya: f.aperturaPlaya,
    evento: { id: f.evento.id, nombre: f.evento.nombre, categoria: f.evento.categoria },
    sala: { id: f.sala.id, nombre: f.sala.nombre, direccion: f.sala.direccion },
  };
}

export function serializarCompra(c: CompraDetalle, viewerId: number) {
  const pases = c.pases.map((p) => {
    const mostrarQR = !!p.codigoQR && p.estado !== 'ANULADA';
    return {
      id: p.id,
      patente: formatearPatente(p.patente),
      precio: p.precio,
      estado: p.estado,
      usadoEn: p.usadoEn,
      tarifaId: p.tarifaId,
      playa: { id: p.tarifa.playa.id, nombre: p.tarifa.playa.nombre },
      codigo: p.codigoQR,
      qr: mostrarQR ? contenidoQR(p.codigoQR!) : null,
      hash: mostrarQR ? hashVisible(p.codigoQR!) : null,
    };
  });
  const v = c.voucher;
  const voucher = v
    ? {
        id: v.id,
        estado: v.estado,
        pin: v.pin,
        canjeadoEn: v.canjeadoEn,
        codigo: v.codigoQR,
        qr: v.codigoQR && v.estado !== 'ANULADA' ? contenidoQR(v.codigoQR) : null,
        items: v.items.map((i) => ({
          productoId: i.productoId,
          nombre: i.producto.nombre,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
        })),
      }
    : null;

  const totales = {
    entradas: suma(c.entradas.filter((e) => vigente(e.estado)).map((e) => e.precio)),
    estacionamiento: suma(c.pases.filter((p) => vigente(p.estado)).map((p) => p.precio)),
    consumiciones: v && vigente(v.estado) ? suma(v.items.map((i) => i.cantidad * i.precioUnitario)) : 0,
  };

  return {
    id: c.id,
    codigo: c.codigo,
    estado: c.estado,
    fecha: c.fecha,
    fechaExpiracionReserva: c.fechaExpiracionReserva,
    reservaExtendida: c.reservaExtendida,
    idTransaccionPago: c.idTransaccionPago,
    fechaPago: c.fechaPago,
    comprador: c.comprador,
    funcion: serializarFuncionResumen(c.funcion),
    entradas: c.entradas.map((e) => serializarEntrada(e, viewerId)),
    pases,
    voucher,
    totales: { ...totales, total: totales.entradas + totales.estacionamiento + totales.consumiciones },
    reembolsos: c.reembolsos.map((r) => ({
      id: r.id,
      fechaSolicitud: r.fechaSolicitud,
      montoReintegrado: r.montoReintegrado,
      motivo: r.motivo,
      estado: r.estado,
      idTransaccionReintegro: r.idTransaccionReintegro,
      entradas: r.entradas.map((e) => e.id),
    })),
  };
}

export async function obtenerCompra(compraId: number, usuario: UsuarioAutenticado) {
  const compra = await prisma.compra.findUnique({ where: { id: compraId }, include: incluirDetalleCompra });
  if (!compra) throw noEncontrado('La compra no existe');
  if (compra.compradorId !== usuario.id && usuario.rol !== 'ADMINISTRADOR') throw prohibido();
  return serializarCompra(compra, usuario.id);
}

/** Reserva en curso (RESERVADA o PENDIENTE_PAGO) del comprador para una función. */
export async function reservaActiva(usuario: UsuarioAutenticado, funcionId: number) {
  const compra = await prisma.compra.findFirst({
    where: {
      compradorId: usuario.id,
      funcionId,
      OR: [{ estado: 'RESERVADA', fechaExpiracionReserva: { gt: new Date() } }, { estado: 'PENDIENTE_PAGO' }],
    },
    include: incluirDetalleCompra,
    orderBy: { id: 'desc' },
  });
  return compra ? serializarCompra(compra, usuario.id) : null;
}

export async function misCompras(usuario: UsuarioAutenticado) {
  const [compras, recibidas, pendientes] = await Promise.all([
    prisma.compra.findMany({
      where: { compradorId: usuario.id, estado: { in: ['PAGADA', 'REEMBOLSADA', 'PENDIENTE_PAGO'] } },
      include: incluirDetalleCompra,
      orderBy: { fecha: 'desc' },
    }),
    prisma.entrada.findMany({
      where: { titularId: usuario.id, compra: { compradorId: { not: usuario.id }, estado: 'PAGADA' } },
      include: { ...incluirEntrada, funcion: { include: { evento: true, sala: true } }, compra: { include: { comprador: usuarioBasico } } },
      orderBy: { id: 'desc' },
    }),
    prisma.transferenciaEntrada.findMany({
      where: { destinatarioId: usuario.id, estado: 'PENDIENTE' },
      include: {
        cedente: usuarioBasico,
        entrada: { include: { ...incluirEntrada, funcion: { include: { evento: true, sala: true } } } },
      },
      orderBy: { fechaHora: 'desc' },
    }),
  ]);
  return {
    compras: compras.map((c) => serializarCompra(c, usuario.id)),
    entradasRecibidas: recibidas.map((e) => ({
      ...serializarEntrada(e, usuario.id),
      funcion: serializarFuncionResumen(e.funcion),
      cedidaPor: e.compra.comprador,
    })),
    transferenciasPendientes: pendientes.map((t) => ({
      id: t.id,
      fechaHora: t.fechaHora,
      cedente: t.cedente,
      entrada: {
        id: t.entrada.id,
        sector: t.entrada.sector.nombre,
        ubicacion: ubicacionTexto(t.entrada),
        funcion: serializarFuncionResumen(t.entrada.funcion),
      },
    })),
  };
}

// ─── Reserva ─────────────────────────────────────────────────────────────────

async function codigoCompraUnico(tx: Tx) {
  for (let i = 0; i < 25; i++) {
    const codigo = nuevoCodigoCompra();
    if (!(await tx.compra.findUnique({ where: { codigo }, select: { id: true } }))) return codigo;
  }
  throw new Error('No se pudo generar un código de compra único');
}

/** Compra.liberarReserva(): libera butacas, cupo de sectores y estacionamiento, y restituye stock. */
export async function liberarReserva(tx: Tx, compraId: number) {
  const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId }, include: { voucher: { include: { items: true } } } });
  await tx.entrada.updateMany({ where: { compraId, estado: 'VIGENTE' }, data: { estado: 'ANULADA' } });
  await tx.paseEstacionamiento.updateMany({ where: { compraId, estado: 'VIGENTE' }, data: { estado: 'ANULADA' } });
  if (compra.voucher && compra.voucher.estado === 'VIGENTE') {
    for (const item of compra.voucher.items) {
      await tx.productoConsumicion.update({ where: { id: item.productoId }, data: { stockDisponible: { increment: item.cantidad } } });
    }
    await tx.voucherConsumicion.update({ where: { id: compra.voucher.id }, data: { estado: 'ANULADA' } });
  }
  await tx.compra.update({ where: { id: compraId }, data: { estado: 'VENCIDA' } });
}

async function liberarVencidasDelComprador(tx: Tx, compradorId: number, funcionId: number) {
  const vencidas = await tx.compra.findMany({
    where: { compradorId, funcionId, estado: 'RESERVADA', fechaExpiracionReserva: { lte: new Date() } },
    select: { id: true },
  });
  for (const v of vencidas) await liberarReserva(tx, v.id);
}

/** Agrega una ubicación a la reserva del comprador (la crea si no existe). */
export async function agregarEntrada(
  usuario: UsuarioAutenticado,
  datos: { funcionId: number; sectorId: number; butacaId?: number | null },
) {
  const compraId = await conBloqueo(claveFuncion(datos.funcionId), () =>
    prisma.$transaction(async (tx) => {
      const ahora = new Date();
      const funcion = await tx.funcion.findUnique({
        where: { id: datos.funcionId },
        include: { tarifas: { include: { descuentos: true } } },
      });
      if (!funcion) throw noEncontrado('La función no existe');
      if (funcion.estado !== 'PUBLICADA') throw conflicto('La función no está a la venta', 'FUNCION_NO_PUBLICADA');
      if (funcion.fechaHora <= ahora) throw conflicto('La función ya comenzó', 'FUNCION_INICIADA');
      if (await enListaNegra(tx, usuario.dni)) {
        throw prohibido('No podés comprar entradas: tu DNI figura en la lista de derecho de admisión');
      }
      if (await tx.compra.findFirst({ where: { compradorId: usuario.id, funcionId: funcion.id, estado: 'PENDIENTE_PAGO' } })) {
        throw conflicto('Tenés un pago en proceso para esta función. Esperá la confirmación de la pasarela.', 'PAGO_EN_PROCESO');
      }

      await liberarVencidasDelComprador(tx, usuario.id, funcion.id);

      if ((await entradasDelTitular(tx, usuario.id, funcion.id)) >= MAX_ENTRADAS_POR_FUNCION) {
        throw conflicto(`Límite alcanzado: máximo ${MAX_ENTRADAS_POR_FUNCION} entradas por persona para esta función`, 'TOPE_ENTRADAS');
      }

      const sector = await tx.sector.findFirst({ where: { id: datos.sectorId, salaId: funcion.salaId } });
      if (!sector) throw noEncontrado('El sector no pertenece a la sala de la función');
      const tarifa = funcion.tarifas.find((t) => t.sectorId === sector.id);
      if (!tarifa) throw conflicto('Este sector no tiene precio definido para la función', 'SECTOR_SIN_PRECIO');

      const { butacasOcupadas, ocupadasPorSector } = await ocupacionFuncion(tx, funcion.id);
      let butacaId: number | null = null;
      if (sector.numerado) {
        if (datos.butacaId) {
          const butaca = await tx.butaca.findFirst({ where: { id: datos.butacaId, sectorId: sector.id } });
          if (!butaca) throw noEncontrado('La butaca no pertenece al sector');
          if (butacasOcupadas.has(butaca.id)) {
            throw conflicto(`La butaca ${butaca.fila}${butaca.numero} ya no está disponible`, 'BUTACA_OCUPADA');
          }
          butacaId = butaca.id;
        } else {
          // Asignación automática: primera butaca libre (fila y número ascendentes)
          const butacas = await tx.butaca.findMany({ where: { sectorId: sector.id }, orderBy: [{ fila: 'asc' }, { numero: 'asc' }] });
          const libre = butacas.find((b) => !butacasOcupadas.has(b.id));
          if (!libre) throw conflicto(`${sector.nombre} está agotado`, 'SECTOR_AGOTADO');
          butacaId = libre.id;
        }
      } else if ((ocupadasPorSector.get(sector.id) ?? 0) >= sector.cupoMaximo) {
        throw conflicto(`${sector.nombre} está agotado`, 'SECTOR_AGOTADO');
      }

      let compra = await tx.compra.findFirst({
        where: { compradorId: usuario.id, funcionId: funcion.id, estado: 'RESERVADA', fechaExpiracionReserva: { gt: ahora } },
      });
      if (!compra) {
        compra = await tx.compra.create({
          data: {
            codigo: await codigoCompraUnico(tx),
            compradorId: usuario.id,
            funcionId: funcion.id,
            estado: 'RESERVADA',
            fechaExpiracionReserva: new Date(ahora.getTime() + RESERVA_MINUTOS * 60_000),
          },
        });
      }
      await tx.entrada.create({
        data: {
          compraId: compra.id,
          funcionId: funcion.id,
          sectorId: sector.id,
          butacaId,
          titularId: usuario.id,
          precio: precioVigente(tarifa, ahora),
        },
      });
      return compra.id;
    }),
  );
  return obtenerCompra(compraId, usuario);
}

/** Lee la compra fuera de la transacción para conocer su función (clave del bloqueo). */
async function compraPropia(usuario: UsuarioAutenticado, compraId: number) {
  const compra = await prisma.compra.findUnique({ where: { id: compraId }, select: { id: true, funcionId: true, compradorId: true } });
  if (!compra) throw noEncontrado('La compra no existe');
  if (compra.compradorId !== usuario.id) throw prohibido();
  return compra;
}

async function reservaEditable(tx: Tx, compraId: number) {
  const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
  if (compra.estado !== 'RESERVADA') throw conflicto('La reserva ya no se puede modificar', 'RESERVA_NO_EDITABLE');
  if (compra.fechaExpiracionReserva <= new Date()) {
    throw new HttpError(410, 'Tu reserva de 10 minutos venció y las ubicaciones se liberaron', 'RESERVA_VENCIDA');
  }
  return compra;
}

export async function quitarEntrada(usuario: UsuarioAutenticado, compraId: number, entradaId: number) {
  const base = await compraPropia(usuario, compraId);
  const quedan = await conBloqueo(claveFuncion(base.funcionId), () =>
    prisma.$transaction(async (tx) => {
      await reservaEditable(tx, compraId);
      const entrada = await tx.entrada.findFirst({ where: { id: entradaId, compraId } });
      if (!entrada) throw noEncontrado('La entrada no pertenece a la reserva');
      await tx.entrada.delete({ where: { id: entrada.id } });
      const restantes = await tx.entrada.count({ where: { compraId } });
      if (restantes === 0) await liberarReserva(tx, compraId);
      return restantes;
    }),
  );
  return quedan === 0 ? null : obtenerCompra(compraId, usuario);
}

export async function cancelarReserva(usuario: UsuarioAutenticado, compraId: number) {
  const base = await compraPropia(usuario, compraId);
  await conBloqueo(claveFuncion(base.funcionId), () =>
    prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
      if (compra.estado !== 'RESERVADA') throw conflicto('Solo se puede cancelar una reserva sin pagar', 'RESERVA_NO_EDITABLE');
      await liberarReserva(tx, compraId);
    }),
  );
}

export interface DatosAdicionales {
  estacionamiento: { tarifaId: number; patente: string }[];
  consumiciones: { productoId: number; cantidad: number }[];
}

/** Elegir estacionamiento (patente) y/o consumiciones: verifica cupo/stock y lo suma a la reserva. */
export async function actualizarAdicionales(usuario: UsuarioAutenticado, compraId: number, datos: DatosAdicionales) {
  const base = await compraPropia(usuario, compraId);
  await conBloqueo(claveFuncion(base.funcionId), () =>
    prisma.$transaction(async (tx) => {
      const compra = await reservaEditable(tx, compraId);
      const funcion = await tx.funcion.findUniqueOrThrow({ where: { id: compra.funcionId } });

      // Estacionamiento: se reemplazan los pases de la reserva
      await tx.paseEstacionamiento.deleteMany({ where: { compraId } });
      const patentes = new Set<string>();
      for (const pedido of datos.estacionamiento) {
        const tarifa = await tx.tarifaEstacionamiento.findFirst({
          where: { id: pedido.tarifaId, funcionId: compra.funcionId },
          include: { playa: true },
        });
        if (!tarifa || !tarifa.playa.habilitada) throw noEncontrado('La playa no está habilitada para esta función');
        const patente = normalizarPatente(pedido.patente);
        if (!patenteValida(patente)) {
          throw solicitudInvalida(`La patente "${pedido.patente}" no es válida (formato AB 123 CD o ABC 123)`, 'PATENTE_INVALIDA');
        }
        if (patentes.has(patente)) throw solicitudInvalida('Ingresaste la misma patente dos veces', 'PATENTE_REPETIDA');
        patentes.add(patente);
        const yaTienePase = await tx.paseEstacionamiento.findFirst({
          where: { patente, estado: { in: ENTRADAS_OCUPAN }, tarifa: { funcionId: funcion.id }, compra: { estado: 'PAGADA' } },
        });
        if (yaTienePase) throw conflicto(`El vehículo ${formatearPatente(patente)} ya tiene un pase para esta función`, 'PATENTE_CON_PASE');
        if ((await pasesActivos(tx, tarifa.id)) >= tarifa.cupoHabilitado) {
          throw conflicto(`No quedan cocheras disponibles en ${tarifa.playa.nombre}`, 'SIN_CUPO_ESTACIONAMIENTO');
        }
        await tx.paseEstacionamiento.create({ data: { compraId, tarifaId: tarifa.id, patente, precio: tarifa.precio } });
      }

      // Consumiciones: se restituye el stock anterior y se vuelve a descontar
      const anterior = await tx.voucherConsumicion.findUnique({ where: { compraId }, include: { items: true } });
      if (anterior) {
        for (const item of anterior.items) {
          await tx.productoConsumicion.update({ where: { id: item.productoId }, data: { stockDisponible: { increment: item.cantidad } } });
        }
        await tx.voucherConsumicion.delete({ where: { id: anterior.id } });
      }
      const cantidades = new Map<number, number>();
      for (const i of datos.consumiciones) cantidades.set(i.productoId, (cantidades.get(i.productoId) ?? 0) + i.cantidad);
      const pedidos = [...cantidades].filter(([, cantidad]) => cantidad > 0);
      if (pedidos.length) {
        const voucher = await tx.voucherConsumicion.create({ data: { compraId, pin: nuevoPin() } });
        for (const [productoId, cantidad] of pedidos) {
          const producto = await tx.productoConsumicion.findFirst({ where: { id: productoId, eventoId: funcion.eventoId, activo: true } });
          if (!producto) throw noEncontrado('El producto no está disponible para este evento');
          // ProductoConsumicion.descontarStock(): decremento atómico condicionado al stock disponible
          const { count } = await tx.productoConsumicion.updateMany({
            where: { id: producto.id, stockDisponible: { gte: cantidad } },
            data: { stockDisponible: { decrement: cantidad } },
          });
          if (count === 0) throw conflicto(`Sin stock suficiente de "${producto.nombre}"`, 'SIN_STOCK');
          await tx.itemConsumicion.create({
            data: { voucherId: voucher.id, productoId: producto.id, cantidad, precioUnitario: producto.precioPreventa },
          });
        }
      }
    }),
  );
  return obtenerCompra(compraId, usuario);
}

// ─── Pago ────────────────────────────────────────────────────────────────────

/** Genera los QR de entradas, pases y voucher, y deja la compra PAGADA. */
async function confirmarVenta(tx: Tx, compraId: number, idTransaccion: string) {
  const compra = await tx.compra.findUniqueOrThrow({
    where: { id: compraId },
    include: {
      comprador: true,
      funcion: { include: { evento: true } },
      entradas: { where: { estado: 'VIGENTE' }, include: { butaca: true } },
      pases: { where: { estado: 'VIGENTE' } },
      voucher: true,
    },
  });
  for (const e of compra.entradas) {
    await tx.entrada.update({ where: { id: e.id }, data: { codigoQR: await generarCodigoEntrada(tx, e.butaca) } });
  }
  for (const p of compra.pases) {
    await tx.paseEstacionamiento.update({ where: { id: p.id }, data: { codigoQR: await generarCodigoPase(tx) } });
  }
  if (compra.voucher?.estado === 'VIGENTE') {
    await tx.voucherConsumicion.update({ where: { id: compra.voucher.id }, data: { codigoQR: await generarCodigoVoucher(tx) } });
  }
  await tx.compra.update({ where: { id: compraId }, data: { estado: 'PAGADA', idTransaccionPago: idTransaccion, fechaPago: new Date() } });

  const extras = [
    compra.pases.length ? `${compra.pases.length} pase(s) de estacionamiento` : null,
    compra.voucher ? '1 voucher de consumición' : null,
  ].filter(Boolean);
  await enviarCorreo(
    tx,
    compra.comprador.email,
    `Tus entradas para ${compra.funcion.evento.nombre}`,
    `Compra ${compra.codigo} confirmada (transacción ${idTransaccion}). Incluye ${compra.entradas.length} entrada(s)` +
      (extras.length ? ` y ${extras.join(' y ')}` : '') +
      '. Tus códigos QR están disponibles en "Mis Compras".',
  );
}

export async function pagar(usuario: UsuarioAutenticado, compraId: number, simular?: ResultadoSimulado) {
  const base = await compraPropia(usuario, compraId);
  const resultado = await conBloqueo(claveFuncion(base.funcionId), () =>
    prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUniqueOrThrow({
        where: { id: compraId },
        include: { entradas: true, pases: true, voucher: { include: { items: true } } },
      });
      if (compra.estado === 'PAGADA') return { tipo: 'aprobado' as const };
      if (compra.estado !== 'RESERVADA') throw conflicto('La compra no se puede pagar en su estado actual', 'COMPRA_NO_PAGABLE');
      if (compra.fechaExpiracionReserva <= new Date()) {
        await liberarReserva(tx, compraId);
        return { tipo: 'vencida' as const };
      }
      const entradas = compra.entradas.filter((e) => e.estado === 'VIGENTE');
      if (!entradas.length) throw solicitudInvalida('La reserva no tiene entradas', 'RESERVA_VACIA');

      const total =
        suma(entradas.map((e) => e.precio)) +
        suma(compra.pases.map((p) => p.precio)) +
        suma(compra.voucher?.items.map((i) => i.cantidad * i.precioUnitario) ?? []);

      const respuesta = pasarela.cobrar({ referencia: compra.codigo, monto: total, simular });
      if (respuesta.estado === 'RECHAZADO') return { tipo: 'rechazado' as const, motivo: respuesta.motivo };
      if (respuesta.estado === 'SIN_RESPUESTA') {
        await tx.compra.update({ where: { id: compraId }, data: { estado: 'PENDIENTE_PAGO', idTransaccionPago: respuesta.idTransaccion } });
        return { tipo: 'pendiente' as const, idTransaccion: respuesta.idTransaccion };
      }
      await confirmarVenta(tx, compraId, respuesta.idTransaccion);
      return { tipo: 'aprobado' as const };
    }),
  );

  if (resultado.tipo === 'vencida') {
    throw new HttpError(410, 'Tu reserva de 10 minutos venció y las ubicaciones se liberaron', 'RESERVA_VENCIDA');
  }
  if (resultado.tipo === 'rechazado') {
    throw new HttpError(402, `Pago rechazado: ${resultado.motivo}. Tu reserva sigue vigente, podés reintentar.`, 'PAGO_RECHAZADO');
  }
  if (resultado.tipo === 'pendiente') {
    pasarela.alConfirmarCobro(resultado.idTransaccion, (id) => confirmarPagoTardio(compraId, id));
  }
  return obtenerCompra(compraId, usuario);
}

/** Webhook de la pasarela para un cobro que había quedado sin respuesta (riesgo R-04). */
export async function confirmarPagoTardio(compraId: number, idTransaccion: string) {
  const base = await prisma.compra.findUnique({ where: { id: compraId }, select: { funcionId: true } });
  if (!base) return;
  await conBloqueo(claveFuncion(base.funcionId), () =>
    prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUniqueOrThrow({
        where: { id: compraId },
        include: { comprador: true, entradas: true, pases: true, voucher: { include: { items: true } } },
      });
      if (compra.idTransaccionPago !== idTransaccion) return;
      if (compra.estado === 'PENDIENTE_PAGO') {
        await confirmarVenta(tx, compraId, idTransaccion);
      } else if (compra.estado === 'VENCIDA') {
        // El pago se aprobó tarde, con la reserva ya liberada: reversa automática
        const monto =
          suma(compra.entradas.map((e) => e.precio)) +
          suma(compra.pases.map((p) => p.precio)) +
          suma(compra.voucher?.items.map((i) => i.cantidad * i.precioUnitario) ?? []);
        const reintegro = pasarela.reintegrar({ idTransaccionOriginal: idTransaccion, monto });
        await enviarCorreo(
          tx,
          compra.comprador.email,
          'Pago revertido',
          `La pasarela confirmó el pago de la reserva ${compra.codigo} cuando ya había vencido. ` +
            `Reintegramos el importe automáticamente (operación ${reintegro.estado === 'APROBADO' ? reintegro.idTransaccion : 'pendiente'}).`,
        );
      }
    }),
  );
}

// ─── Vencimiento de la reserva (evento temporal, actividad 3.2) ─────────────

export async function procesarVencimientos(ahora = new Date()) {
  const candidatas = await prisma.compra.findMany({
    where: { estado: { in: ['RESERVADA', 'PENDIENTE_PAGO'] }, fechaExpiracionReserva: { lte: ahora } },
    select: { id: true, funcionId: true },
  });
  let liberadas = 0;
  let extendidas = 0;
  for (const c of candidatas) {
    await conBloqueo(claveFuncion(c.funcionId), () =>
      prisma.$transaction(async (tx) => {
        const compra = await tx.compra.findUnique({ where: { id: c.id } });
        if (!compra || compra.fechaExpiracionReserva > ahora) return;
        if (compra.estado === 'PENDIENTE_PAGO' && !compra.reservaExtendida) {
          // Extender retención 5 min (una sola vez) mientras la pasarela responde
          await tx.compra.update({
            where: { id: compra.id },
            data: {
              reservaExtendida: true,
              fechaExpiracionReserva: new Date(ahora.getTime() + EXTENSION_PENDIENTE_MINUTOS * 60_000),
            },
          });
          extendidas++;
        } else if (compra.estado === 'RESERVADA' || compra.estado === 'PENDIENTE_PAGO') {
          await liberarReserva(tx, compra.id);
          liberadas++;
        }
      }),
    );
  }
  return { liberadas, extendidas };
}
