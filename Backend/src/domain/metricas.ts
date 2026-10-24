// Consultar reportes de venta (Administrador y Organizador).
import { prisma } from '../db';
import { noEncontrado } from '../lib/http';

export async function metricasFuncion(funcionId: number) {
  const funcion = await prisma.funcion.findUnique({
    where: { id: funcionId },
    include: { sala: { include: { sectores: { orderBy: { id: 'asc' } } } }, tarifasEstacionamiento: { include: { playa: true } } },
  });
  if (!funcion) throw noEncontrado('La función no existe');

  const hace24h = new Date(Date.now() - 24 * 3600_000);
  const [entradas, pases, vouchers, comprasPagadas, ventas24h, reembolsos] = await Promise.all([
    prisma.entrada.findMany({
      where: { funcionId, compra: { estado: 'PAGADA' }, estado: { in: ['VIGENTE', 'USADA'] } },
      select: { sectorId: true, precio: true, estado: true },
    }),
    prisma.paseEstacionamiento.findMany({
      where: { tarifa: { funcionId }, compra: { estado: 'PAGADA' }, estado: { in: ['VIGENTE', 'USADA'] } },
      select: { tarifaId: true, precio: true, estado: true, patente: true },
    }),
    prisma.voucherConsumicion.findMany({
      where: { compra: { funcionId, estado: 'PAGADA' }, estado: { in: ['VIGENTE', 'USADA'] } },
      include: { items: { include: { producto: true } } },
    }),
    prisma.compra.count({ where: { funcionId, estado: { in: ['PAGADA', 'REEMBOLSADA'] } } }),
    prisma.entrada.count({ where: { funcionId, compra: { estado: 'PAGADA', fechaPago: { gte: hace24h } }, estado: { not: 'ANULADA' } } }),
    prisma.reembolso.aggregate({ where: { compra: { funcionId }, estado: 'COMPLETADO' }, _sum: { montoReintegrado: true }, _count: { _all: true } }),
  ]);

  const recEntradas = entradas.reduce((a, e) => a + e.precio, 0);
  const recPases = pases.reduce((a, p) => a + p.precio, 0);
  const itemsVendidos = vouchers.flatMap((v) => v.items);
  const recConsumiciones = itemsVendidos.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0);

  const porProducto = new Map<number, { nombre: string; cantidad: number; recaudacion: number }>();
  for (const i of itemsVendidos) {
    const p = porProducto.get(i.productoId) ?? { nombre: i.producto.nombre, cantidad: 0, recaudacion: 0 };
    p.cantidad += i.cantidad;
    p.recaudacion += i.cantidad * i.precioUnitario;
    porProducto.set(i.productoId, p);
  }

  const cupoTotal = funcion.sala.sectores.reduce((a, s) => a + s.cupoMaximo, 0);
  const cupoEstacionamiento = funcion.tarifasEstacionamiento.reduce((a, t) => a + t.cupoHabilitado, 0);

  return {
    recaudacion: {
      total: recEntradas + recPases + recConsumiciones,
      entradas: recEntradas,
      estacionamiento: recPases,
      consumiciones: recConsumiciones,
      reembolsado: reembolsos._sum.montoReintegrado ?? 0,
      reembolsos: reembolsos._count._all,
    },
    entradas: {
      vendidas: entradas.length,
      ingresadas: entradas.filter((e) => e.estado === 'USADA').length,
      cupo: cupoTotal,
      ultimas24h: ventas24h,
      porSector: funcion.sala.sectores.map((s) => {
        const delSector = entradas.filter((e) => e.sectorId === s.id);
        return {
          sectorId: s.id,
          nombre: s.nombre,
          numerado: s.numerado,
          vendidas: delSector.length,
          cupo: s.cupoMaximo,
          recaudacion: delSector.reduce((a, e) => a + e.precio, 0),
        };
      }),
    },
    estacionamiento: {
      vendidos: pases.length,
      ingresados: pases.filter((p) => p.estado === 'USADA').length,
      cupo: cupoEstacionamiento,
      libres: Math.max(0, cupoEstacionamiento - pases.length),
      patentesRegistradas: new Set(pases.map((p) => p.patente)).size,
      porPlaya: funcion.tarifasEstacionamiento.map((t) => ({
        playa: t.playa.nombre,
        vendidos: pases.filter((p) => p.tarifaId === t.id).length,
        cupo: t.cupoHabilitado,
      })),
    },
    consumiciones: {
      vouchers: vouchers.length,
      canjeados: vouchers.filter((v) => v.estado === 'USADA').length,
      conversion: comprasPagadas ? vouchers.length / comprasPagadas : 0,
      comprasPagadas,
      porProducto: [...porProducto.values()].sort((a, b) => b.cantidad - a.cantidad),
    },
  };
}

export async function reporteCsv(funcionId: number) {
  const m = await metricasFuncion(funcionId);
  const funcion = await prisma.funcion.findUniqueOrThrow({ where: { id: funcionId }, include: { evento: true } });
  const filas: (string | number)[][] = [
    ['Reporte de ventas', `${funcion.evento.nombre} (${funcion.codigo})`],
    ['Generado', new Date().toISOString()],
    [],
    ['Concepto', 'Detalle', 'Cantidad', 'Cupo', 'Recaudación (ARS)'],
    ...m.entradas.porSector.map((s) => ['Entradas', s.nombre, s.vendidas, s.cupo, s.recaudacion]),
    ...m.estacionamiento.porPlaya.map((p) => ['Estacionamiento', p.playa, p.vendidos, p.cupo, '']),
    ['Estacionamiento', 'Total', m.estacionamiento.vendidos, m.estacionamiento.cupo, m.recaudacion.estacionamiento],
    ...m.consumiciones.porProducto.map((p) => ['Consumiciones', p.nombre, p.cantidad, '', p.recaudacion]),
    [],
    ['Total recaudado', '', '', '', m.recaudacion.total],
    ['Reembolsado', `${m.recaudacion.reembolsos} reembolsos`, '', '', m.recaudacion.reembolsado],
  ];
  const escapar = (v: string | number) => (typeof v === 'string' && /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
  return '﻿' + filas.map((f) => f.map(escapar).join(';')).join('\r\n');
}
