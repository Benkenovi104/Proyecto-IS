// Validar QR en puerta, playa o barra (actividad 3.5).
import type { UsuarioAutenticado } from '../auth';
import { prisma } from '../db';
import { leerCodigo } from '../lib/codigos';
import { noEncontrado } from '../lib/http';
import { type PuntoControl } from './enums';
import { enListaNegra } from './ocupacion';
import { formatearPatente, normalizarPatente } from './reglas';

type TipoCodigo = 'ENTRADA' | 'PASE' | 'VOUCHER';

const PUNTO_DEL_TIPO: Record<TipoCodigo, PuntoControl> = { ENTRADA: 'PUERTA', PASE: 'ESTACIONAMIENTO', VOUCHER: 'BARRA' };
const NOMBRE_PUNTO: Record<PuntoControl, string> = {
  PUERTA: 'la puerta de sala',
  ESTACIONAMIENTO: 'el ingreso al estacionamiento',
  BARRA: 'las barras gastronómicas',
};

const hora = (d: Date) =>
  d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false });

export interface ResultadoValidacion {
  resultado: 'APROBADO' | 'RECHAZADO';
  confirmado: boolean;
  codigo: string;
  tipo: TipoCodigo | null;
  punto: PuntoControl;
  motivo: string | null;
  estadoCodigo: string;
  titular: { nombre: string; dni: string | null } | null;
  sector: string | null;
  ubicacion: string | null;
  puertaAcceso: string | null;
  patente: string | null;
  playa: string | null;
  items: { nombre: string; cantidad: number }[];
  pin: string | null;
  revocacion: { motivo: string; fecha: Date } | null;
  usadoEn: Date | null;
  latenciaMs: number;
  offline: boolean;
}

function base(codigo: string, punto: PuntoControl): ResultadoValidacion {
  return {
    resultado: 'RECHAZADO',
    confirmado: false,
    codigo,
    tipo: null,
    punto,
    motivo: null,
    estadoCodigo: 'INEXISTENTE',
    titular: null,
    sector: null,
    ubicacion: null,
    puertaAcceso: null,
    patente: null,
    playa: null,
    items: [],
    pin: null,
    revocacion: null,
    usadoEn: null,
    latenciaMs: 0,
    offline: false,
  };
}

/** Informa por qué un código ya no sirve: revocado (transferencia/reembolso) o, si no hay registro, el motivo genérico. */
async function rechazoRevocado(r: ResultadoValidacion, motivoGenerico: string, estadoGenerico: string) {
  const revocado = await prisma.codigoRevocado.findUnique({ where: { codigo: r.codigo } });
  if (revocado) {
    r.tipo = revocado.tipo as TipoCodigo;
    r.estadoCodigo = 'REVOCADO';
    r.revocacion = { motivo: revocado.motivo, fecha: revocado.fecha };
    r.motivo =
      revocado.motivo === 'TRANSFERENCIA'
        ? 'Código QR inválido: esta entrada fue reasignada a un nuevo titular y su QR anterior quedó anulado'
        : 'Código QR inválido: fue anulado por el reembolso de la compra';
    return r;
  }
  r.estadoCodigo = estadoGenerico;
  r.motivo = motivoGenerico;
  return r;
}

const rechazoInexistente = (r: ResultadoValidacion) => rechazoRevocado(r, 'El código no existe en el padrón de la función', 'INEXISTENTE');
const rechazoAnulado = (r: ResultadoValidacion) =>
  rechazoRevocado(r, 'Código anulado (la reserva venció o la compra fue reembolsada)', 'ANULADA');

function verificarComun(
  r: ResultadoValidacion,
  datos: { estado: string; compraPagada: boolean; funcionId: number; usadoEn: Date | null },
  tipo: TipoCodigo,
  funcion: { id: number; nombre: string },
) {
  r.tipo = tipo;
  r.estadoCodigo = datos.estado;
  r.usadoEn = datos.usadoEn;
  if (!datos.compraPagada) return 'La compra asociada no está pagada';
  if (datos.estado === 'USADA') {
    return tipo === 'VOUCHER'
      ? `Voucher ya canjeado${datos.usadoEn ? ` a las ${hora(datos.usadoEn)} hs` : ''}`
      : `Este código QR ya fue escaneado${datos.usadoEn ? ` hoy a las ${hora(datos.usadoEn)} hs` : ''}`;
  }
  if (datos.estado === 'ANULADA') return 'Código anulado (la compra fue reembolsada o la reserva venció)';
  if (PUNTO_DEL_TIPO[tipo] !== r.punto) return `Este código corresponde a ${NOMBRE_PUNTO[PUNTO_DEL_TIPO[tipo]]}`;
  if (datos.funcionId !== funcion.id) return `Corresponde a otra función (${funcion.nombre})`;
  return null;
}

async function evaluar(codigo: string, punto: PuntoControl, funcionId: number, confirmar: boolean, firmaValida: boolean | null) {
  const r = base(codigo, punto);
  if (firmaValida === false) {
    r.estadoCodigo = 'FIRMA_INVALIDA';
    r.motivo = 'La firma del QR no es válida: posible código adulterado';
    return r;
  }

  // ── Entradas (por código o por DNI del titular) ──
  if (codigo.startsWith('ENT-') || codigo.startsWith('DNI-')) {
    const incluir = { compra: true, sector: true, butaca: true, titular: true, funcion: { include: { evento: true } } } as const;
    let entrada;
    if (codigo.startsWith('DNI-')) {
      const dni = codigo.slice(4).replace(/\D/g, '');
      const delTitular = await prisma.entrada.findMany({
        where: { funcionId, titular: { dni }, compra: { estado: 'PAGADA' }, codigoQR: { not: null } },
        include: incluir,
        orderBy: { id: 'asc' },
      });
      entrada = delTitular.find((e) => e.estado === 'VIGENTE') ?? delTitular.find((e) => e.estado === 'USADA');
      if (!entrada) {
        r.motivo = `No hay entradas para el DNI ${dni} en esta función`;
        return r;
      }
      r.codigo = entrada.codigoQR!;
    } else {
      entrada = await prisma.entrada.findUnique({ where: { codigoQR: codigo }, include: incluir });
      if (!entrada) return rechazoInexistente(r);
    }
    r.titular = { nombre: entrada.titular.nombre, dni: entrada.titular.dni };
    r.sector = entrada.sector.nombre;
    r.ubicacion = entrada.butaca ? `Fila ${entrada.butaca.fila} — Butaca ${entrada.butaca.fila}${entrada.butaca.numero}` : 'Sin numerar (cupo general)';
    r.puertaAcceso = entrada.sector.puertaAcceso;
    if (entrada.estado === 'ANULADA') return rechazoAnulado(Object.assign(r, { tipo: 'ENTRADA' as const }));
    const error = verificarComun(
      r,
      { estado: entrada.estado, compraPagada: entrada.compra.estado === 'PAGADA', funcionId: entrada.funcionId, usadoEn: entrada.usadaEn },
      'ENTRADA',
      { id: funcionId, nombre: entrada.funcion.evento.nombre },
    );
    if (error) return Object.assign(r, { motivo: error });
    if (await enListaNegra(prisma, entrada.titular.dni)) {
      return Object.assign(r, { motivo: 'El titular figura en la lista negra (derecho de admisión)', estadoCodigo: 'LISTA_NEGRA' });
    }
    if (confirmar) {
      const usadaEn = new Date();
      const { count } = await prisma.entrada.updateMany({ where: { id: entrada.id, estado: 'VIGENTE' }, data: { estado: 'USADA', usadaEn } });
      if (!count) return Object.assign(r, { motivo: 'Este QR acaba de usarse en otro acceso', estadoCodigo: 'USADA' });
      Object.assign(r, { confirmado: true, estadoCodigo: 'USADA', usadoEn: usadaEn });
    }
    return Object.assign(r, { resultado: 'APROBADO' as const });
  }

  // ── Pases de estacionamiento (por código o por patente) ──
  if (codigo.startsWith('PRK-') || codigo.startsWith('PAT-')) {
    const incluir = { compra: { include: { comprador: true } }, tarifa: { include: { playa: true, funcion: { include: { evento: true } } } } } as const;
    let pase;
    if (codigo.startsWith('PAT-')) {
      const patente = normalizarPatente(codigo.slice(4));
      const candidatos = await prisma.paseEstacionamiento.findMany({
        where: { patente, tarifa: { funcionId }, compra: { estado: 'PAGADA' }, codigoQR: { not: null } },
        include: incluir,
      });
      pase = candidatos.find((p) => p.estado === 'VIGENTE') ?? candidatos.find((p) => p.estado === 'USADA');
      if (!pase) {
        r.motivo = `La patente ${formatearPatente(patente)} no tiene pase para esta función`;
        r.patente = formatearPatente(patente);
        return r;
      }
      r.codigo = pase.codigoQR!;
    } else {
      pase = await prisma.paseEstacionamiento.findUnique({ where: { codigoQR: codigo }, include: incluir });
      if (!pase) return rechazoInexistente(r);
    }
    r.titular = { nombre: pase.compra.comprador.nombre, dni: pase.compra.comprador.dni };
    r.patente = formatearPatente(pase.patente);
    r.playa = pase.tarifa.playa.nombre;
    if (pase.estado === 'ANULADA') return rechazoAnulado(Object.assign(r, { tipo: 'PASE' as const }));
    const error = verificarComun(
      r,
      { estado: pase.estado, compraPagada: pase.compra.estado === 'PAGADA', funcionId: pase.tarifa.funcionId, usadoEn: pase.usadoEn },
      'PASE',
      { id: funcionId, nombre: pase.tarifa.funcion.evento.nombre },
    );
    if (error) return Object.assign(r, { motivo: error });
    if (confirmar) {
      const usadoEn = new Date();
      const { count } = await prisma.paseEstacionamiento.updateMany({ where: { id: pase.id, estado: 'VIGENTE' }, data: { estado: 'USADA', usadoEn } });
      if (!count) return Object.assign(r, { motivo: 'Este pase acaba de usarse en otro acceso', estadoCodigo: 'USADA' });
      Object.assign(r, { confirmado: true, estadoCodigo: 'USADA', usadoEn });
    }
    return Object.assign(r, { resultado: 'APROBADO' as const });
  }

  // ── Vouchers de consumición ──
  if (codigo.startsWith('VCH-')) {
    const voucher = await prisma.voucherConsumicion.findUnique({
      where: { codigoQR: codigo },
      include: { compra: { include: { comprador: true, funcion: { include: { evento: true } } } }, items: { include: { producto: true } } },
    });
    if (!voucher) return rechazoInexistente(r);
    r.titular = { nombre: voucher.compra.comprador.nombre, dni: voucher.compra.comprador.dni };
    r.items = voucher.items.map((i) => ({ nombre: i.producto.nombre, cantidad: i.cantidad }));
    r.pin = voucher.pin;
    if (voucher.estado === 'ANULADA') return rechazoAnulado(Object.assign(r, { tipo: 'VOUCHER' as const }));
    const error = verificarComun(
      r,
      { estado: voucher.estado, compraPagada: voucher.compra.estado === 'PAGADA', funcionId: voucher.compra.funcionId, usadoEn: voucher.canjeadoEn },
      'VOUCHER',
      { id: funcionId, nombre: voucher.compra.funcion.evento.nombre },
    );
    if (error) return Object.assign(r, { motivo: error });
    if (confirmar) {
      const canjeadoEn = new Date();
      // VoucherConsumicion.canjear(): el canje es independiente de validar la entrada al show
      const { count } = await prisma.voucherConsumicion.updateMany({ where: { id: voucher.id, estado: 'VIGENTE' }, data: { estado: 'USADA', canjeadoEn } });
      if (!count) return Object.assign(r, { motivo: 'Este voucher acaba de canjearse en otra barra', estadoCodigo: 'USADA' });
      Object.assign(r, { confirmado: true, estadoCodigo: 'USADA', usadoEn: canjeadoEn });
    }
    return Object.assign(r, { resultado: 'APROBADO' as const });
  }

  r.estadoCodigo = 'FORMATO_INVALIDO';
  r.motivo = 'Formato no reconocido. Usá #ENT-, #VCH-, PRK-, DNI- o PAT-';
  return r;
}

/**
 * Lee y verifica un código. Con `confirmar=false` solo informa el resultado (paso "Leer y verificar código QR");
 * con `confirmar=true` además marca la entrada/pase como USADO o el voucher como canjeado, de forma atómica.
 */
export async function validarCodigo(
  controlador: UsuarioAutenticado,
  datos: { codigo: string; punto: PuntoControl; funcionId: number; confirmar: boolean; offline?: boolean; fechaHora?: Date },
) {
  const inicio = performance.now();
  const { codigo, firmaValida } = leerCodigo(datos.codigo);
  const r = await evaluar(codigo, datos.punto, datos.funcionId, datos.confirmar, firmaValida);
  r.latenciaMs = Math.max(1, Math.round(performance.now() - inicio));
  r.offline = !!datos.offline;

  // Se registra todo rechazo y todo acceso confirmado
  if (r.resultado === 'RECHAZADO' || r.confirmado) {
    await prisma.validacionAcceso.create({
      data: {
        funcionId: datos.funcionId,
        controladorId: controlador.id,
        punto: datos.punto,
        codigo: r.codigo,
        tipo: r.tipo,
        resultado: r.resultado,
        motivo: r.motivo,
        titular: r.titular?.nombre ?? (r.patente ? `Vehículo ${r.patente}` : null),
        ubicacion: r.ubicacion ?? r.playa ?? (r.items.length ? r.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ') : null),
        latenciaMs: r.latenciaMs,
        offline: r.offline,
        fechaHora: datos.fechaHora ?? new Date(),
      },
    });
  }
  return r;
}

export async function resumenControl(controladorId: number, funcionId: number) {
  const funcion = await prisma.funcion.findUnique({
    where: { id: funcionId },
    include: { evento: true, sala: true, tarifasEstacionamiento: { include: { playa: true } } },
  });
  if (!funcion) throw noEncontrado('La función no existe');

  const entradasPagadas = { funcionId, compra: { estado: 'PAGADA' }, estado: { in: ['VIGENTE', 'USADA'] } };
  const pasesPagados = { tarifa: { funcionId }, compra: { estado: 'PAGADA' }, estado: { in: ['VIGENTE', 'USADA'] } };
  const vouchersPagados = { compra: { funcionId, estado: 'PAGADA' }, estado: { in: ['VIGENTE', 'USADA'] } };

  const [vendidas, ingresadas, pases, pasesUsados, vouchers, canjeados, turno, latencia, recientes] = await Promise.all([
    prisma.entrada.count({ where: entradasPagadas }),
    prisma.entrada.count({ where: { ...entradasPagadas, estado: 'USADA' } }),
    prisma.paseEstacionamiento.count({ where: pasesPagados }),
    prisma.paseEstacionamiento.count({ where: { ...pasesPagados, estado: 'USADA' } }),
    prisma.voucherConsumicion.count({ where: vouchersPagados }),
    prisma.voucherConsumicion.count({ where: { ...vouchersPagados, estado: 'USADA' } }),
    prisma.validacionAcceso.groupBy({ by: ['resultado'], where: { funcionId, controladorId }, _count: { _all: true } }),
    prisma.validacionAcceso.aggregate({ where: { funcionId, controladorId }, _avg: { latenciaMs: true } }),
    prisma.validacionAcceso.findMany({ where: { funcionId }, orderBy: { fechaHora: 'desc' }, take: 12 }),
  ]);
  const aprobados = turno.find((t) => t.resultado === 'APROBADO')?._count._all ?? 0;
  const rechazados = turno.find((t) => t.resultado === 'RECHAZADO')?._count._all ?? 0;

  return {
    funcion: {
      id: funcion.id,
      codigo: funcion.codigo,
      fechaHora: funcion.fechaHora,
      evento: funcion.evento.nombre,
      sala: funcion.sala.nombre,
    },
    puerta: { ingresados: ingresadas, vendidas },
    estacionamiento: {
      ocupados: pasesUsados,
      vendidos: pases,
      cupo: funcion.tarifasEstacionamiento.reduce((a, t) => a + t.cupoHabilitado, 0),
      playas: funcion.tarifasEstacionamiento.map((t) => t.playa.nombre),
    },
    barra: { canjeados, emitidos: vouchers },
    turno: {
      lecturas: aprobados + rechazados,
      aprobados,
      rechazados,
      latenciaPromedioMs: Math.round(latencia._avg.latenciaMs ?? 0),
    },
    recientes,
  };
}

/** Sincronizar padrón para modo sin conexión: todos los códigos de la función y su estado. */
export async function padronFuncion(funcionId: number) {
  const [entradas, pases, vouchers] = await Promise.all([
    prisma.entrada.findMany({
      where: { funcionId, compra: { estado: 'PAGADA' }, codigoQR: { not: null } },
      include: { titular: true, sector: true, butaca: true },
    }),
    prisma.paseEstacionamiento.findMany({
      where: { tarifa: { funcionId }, compra: { estado: 'PAGADA' }, codigoQR: { not: null } },
      include: { tarifa: { include: { playa: true } }, compra: { include: { comprador: true } } },
    }),
    prisma.voucherConsumicion.findMany({
      where: { compra: { funcionId, estado: 'PAGADA' }, codigoQR: { not: null } },
      include: { items: { include: { producto: true } }, compra: { include: { comprador: true } } },
    }),
  ]);
  const ids = { ENTRADA: entradas.map((e) => e.id), PASE: pases.map((p) => p.id), VOUCHER: vouchers.map((v) => v.id) };
  const revocados = await prisma.codigoRevocado.findMany({
    where: {
      OR: [
        { tipo: 'ENTRADA', referenciaId: { in: ids.ENTRADA } },
        { tipo: 'PASE', referenciaId: { in: ids.PASE } },
        { tipo: 'VOUCHER', referenciaId: { in: ids.VOUCHER } },
      ],
    },
  });
  return {
    funcionId,
    generadoEn: new Date(),
    codigos: [
      ...entradas.map((e) => ({
        codigo: e.codigoQR!,
        tipo: 'ENTRADA' as const,
        estado: e.estado,
        titular: e.titular.nombre,
        dni: e.titular.dni,
        detalle: `${e.sector.nombre} · ${e.butaca ? `Fila ${e.butaca.fila} — Butaca ${e.butaca.fila}${e.butaca.numero}` : 'Sin numerar'}`,
      })),
      ...pases.map((p) => ({
        codigo: p.codigoQR!,
        tipo: 'PASE' as const,
        estado: p.estado,
        titular: p.compra.comprador.nombre,
        dni: null,
        patente: p.patente,
        detalle: `${formatearPatente(p.patente)} · ${p.tarifa.playa.nombre}`,
      })),
      ...vouchers.map((v) => ({
        codigo: v.codigoQR!,
        tipo: 'VOUCHER' as const,
        estado: v.estado,
        titular: v.compra.comprador.nombre,
        dni: null,
        detalle: v.items.map((i) => `${i.cantidad}x ${i.producto.nombre}`).join(', '),
      })),
    ],
    revocados: revocados.map((r) => ({ codigo: r.codigo, tipo: r.tipo, motivo: r.motivo, fecha: r.fecha })),
  };
}
