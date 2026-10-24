// Buscar eventos, mostrar mapa con disponibilidad, y preparar/publicar una función (actividad 3.6).
import type { UsuarioAutenticado } from '../auth';
import { prisma } from '../db';
import { conflicto, noEncontrado } from '../lib/http';
import { reservaActiva } from './compras';
import { ocupacionFuncion, pasesActivos } from './ocupacion';
import { descuentoVigente, precioVigente } from './precios';
import { HORAS_OCUPACION_SALA } from './reglas';

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export async function cartelera(filtros: { q?: string; categoria?: string; desde?: Date; hasta?: Date }) {
  const funciones = await prisma.funcion.findMany({
    where: {
      estado: 'PUBLICADA',
      fechaHora: { gt: new Date(), ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lte: filtros.hasta } : {}) },
      ...(filtros.categoria ? { evento: { categoria: filtros.categoria } } : {}),
    },
    include: { evento: true, sala: true, tarifas: { include: { descuentos: true } } },
    orderBy: { fechaHora: 'asc' },
  });
  const q = filtros.q ? normalizar(filtros.q) : null;
  const visibles = q
    ? funciones.filter((f) => normalizar(`${f.evento.nombre} ${f.sala.nombre} ${f.evento.descripcion ?? ''}`).includes(q))
    : funciones;

  return Promise.all(
    visibles.map(async (f) => {
      const sectores = await prisma.sector.findMany({ where: { salaId: f.salaId }, select: { id: true, cupoMaximo: true } });
      const { ocupadasPorSector } = await ocupacionFuncion(prisma, f.id);
      const cupo = sectores.filter((s) => f.tarifas.some((t) => t.sectorId === s.id)).reduce((a, s) => a + s.cupoMaximo, 0);
      const vendidas = [...ocupadasPorSector.values()].reduce((a, b) => a + b, 0);
      const precios = f.tarifas.map((t) => precioVigente(t));
      return {
        id: f.id,
        codigo: f.codigo,
        fechaHora: f.fechaHora,
        evento: { id: f.evento.id, nombre: f.evento.nombre, categoria: f.evento.categoria, descripcion: f.evento.descripcion },
        sala: { id: f.sala.id, nombre: f.sala.nombre, direccion: f.sala.direccion },
        precioDesde: precios.length ? Math.min(...precios) : null,
        hayDescuento: f.tarifas.some((t) => descuentoVigente(t.descuentos)),
        disponibles: Math.max(0, cupo - vendidas),
        cupo,
      };
    }),
  );
}

/** Mapa con disponibilidad para el comprador (y vista previa para backoffice). */
export async function detalleFuncion(funcionId: number, usuario?: UsuarioAutenticado) {
  const funcion = await prisma.funcion.findUnique({
    where: { id: funcionId },
    include: {
      evento: { include: { productos: { where: { activo: true }, orderBy: { id: 'asc' } } } },
      sala: { include: { sectores: { include: { butacas: { orderBy: [{ fila: 'asc' }, { numero: 'asc' }] } }, orderBy: { id: 'asc' } } } },
      escenario: true,
      tarifas: { include: { descuentos: true } },
      tarifasEstacionamiento: { include: { playa: true }, orderBy: { id: 'asc' } },
    },
  });
  const esBackoffice = usuario && ['ADMINISTRADOR', 'ORGANIZADOR'].includes(usuario.rol);
  if (!funcion || (funcion.estado !== 'PUBLICADA' && !esBackoffice)) throw noEncontrado('La función no está disponible');

  const { butacasOcupadas, ocupadasPorSector } = await ocupacionFuncion(prisma, funcion.id);
  const estacionamiento = await Promise.all(
    funcion.tarifasEstacionamiento
      .filter((t) => t.playa.habilitada)
      .map(async (t) => ({
        tarifaId: t.id,
        playaId: t.playaId,
        playa: t.playa.nombre,
        precio: t.precio,
        cupo: t.cupoHabilitado,
        disponibles: Math.max(0, t.cupoHabilitado - (await pasesActivos(prisma, t.id))),
      })),
  );

  return {
    id: funcion.id,
    codigo: funcion.codigo,
    fechaHora: funcion.fechaHora,
    estado: funcion.estado,
    exigePatente: funcion.exigePatente,
    aperturaPlaya: funcion.aperturaPlaya,
    evento: {
      id: funcion.evento.id,
      nombre: funcion.evento.nombre,
      categoria: funcion.evento.categoria,
      descripcion: funcion.evento.descripcion,
    },
    sala: {
      id: funcion.sala.id,
      nombre: funcion.sala.nombre,
      direccion: funcion.sala.direccion,
      ancho: funcion.sala.ancho,
      alto: funcion.sala.alto,
    },
    escenario: funcion.escenario,
    sectores: funcion.sala.sectores.map((s) => {
      const tarifa = funcion.tarifas.find((t) => t.sectorId === s.id);
      const descuento = tarifa ? descuentoVigente(tarifa.descuentos) : null;
      const ocupadas = ocupadasPorSector.get(s.id) ?? 0;
      return {
        id: s.id,
        codigo: s.codigo,
        nombre: s.nombre,
        numerado: s.numerado,
        color: s.color,
        forma: s.forma,
        posX: s.posX,
        posY: s.posY,
        ancho: s.ancho,
        alto: s.alto,
        filas: s.filas,
        butacasPorFila: s.butacasPorFila,
        puertaAcceso: s.puertaAcceso,
        cupo: s.cupoMaximo,
        disponibles: Math.max(0, s.cupoMaximo - ocupadas),
        precioBase: tarifa?.precio ?? null,
        precio: tarifa ? precioVigente(tarifa) : null,
        descuento: descuento ? { porcentaje: descuento.porcentaje, vigenciaHasta: descuento.vigenciaHasta } : null,
        butacas: s.numerado
          ? s.butacas.map((b) => ({ id: b.id, fila: b.fila, numero: b.numero, posX: b.posX, posY: b.posY, ocupada: butacasOcupadas.has(b.id) }))
          : [],
      };
    }),
    estacionamiento,
    consumiciones: funcion.evento.productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precioPreventa,
      precioLista: p.precioLista,
      stock: p.stockDisponible,
    })),
    miReserva: usuario?.rol === 'COMPRADOR' ? await reservaActiva(usuario, funcion.id) : null,
  };
}

/** ¿Sala libre en esa fecha y hora? */
export async function verificarSalaLibre(salaId: number, fechaHora: Date, excluirFuncionId?: number) {
  const margen = HORAS_OCUPACION_SALA * 3600_000;
  const choque = await prisma.funcion.findFirst({
    where: {
      salaId,
      id: excluirFuncionId ? { not: excluirFuncionId } : undefined,
      estado: { in: ['BORRADOR', 'PUBLICADA'] },
      fechaHora: { gt: new Date(fechaHora.getTime() - margen), lt: new Date(fechaHora.getTime() + margen) },
    },
    include: { evento: true },
  });
  if (choque) {
    throw conflicto(
      `La sala ya tiene programada "${choque.evento.nombre}" (${choque.codigo}) a menos de ${HORAS_OCUPACION_SALA} h de ese horario`,
      'SALA_OCUPADA',
    );
  }
}

/** Funcion.publicar(): exige que todos los sectores de la sala tengan precio. */
export async function publicarFuncion(funcionId: number) {
  const funcion = await prisma.funcion.findUnique({ where: { id: funcionId }, include: { tarifas: true, sala: { include: { sectores: true } } } });
  if (!funcion) throw noEncontrado('La función no existe');
  if (funcion.fechaHora <= new Date()) throw conflicto('No se puede publicar una función que ya pasó', 'FUNCION_PASADA');
  const sinPrecio = funcion.sala.sectores.filter((s) => !funcion.tarifas.some((t) => t.sectorId === s.id && t.precio > 0));
  if (sinPrecio.length) {
    throw conflicto(
      `Completá el precio de: ${sinPrecio.map((s) => s.nombre).join(', ')}`,
      'SECTORES_SIN_PRECIO',
      sinPrecio.map((s) => s.id),
    );
  }
  await verificarSalaLibre(funcion.salaId, funcion.fechaHora, funcion.id);
  return prisma.funcion.update({ where: { id: funcionId }, data: { estado: 'PUBLICADA' } });
}

export function despublicarFuncion(funcionId: number) {
  return prisma.funcion.update({ where: { id: funcionId }, data: { estado: 'DESPUBLICADA' } });
}
