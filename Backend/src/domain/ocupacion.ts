import type { Tx } from '../db';
import { prisma } from '../db';
import { COMPRAS_ACTIVAS, ENTRADAS_OCUPAN } from './enums';

type Db = Tx | typeof prisma;

/** Entradas que hoy ocupan lugar en la función (reservadas, pendientes de pago o pagadas). */
export const filtroEntradasActivas = (funcionId: number) => ({
  funcionId,
  estado: { in: ENTRADAS_OCUPAN },
  compra: { estado: { in: COMPRAS_ACTIVAS } },
});

export async function ocupacionFuncion(db: Db, funcionId: number) {
  const entradas = await db.entrada.findMany({
    where: filtroEntradasActivas(funcionId),
    select: { sectorId: true, butacaId: true },
  });
  const butacasOcupadas = new Set<number>();
  const ocupadasPorSector = new Map<number, number>();
  for (const e of entradas) {
    if (e.butacaId) butacasOcupadas.add(e.butacaId);
    ocupadasPorSector.set(e.sectorId, (ocupadasPorSector.get(e.sectorId) ?? 0) + 1);
  }
  return { butacasOcupadas, ocupadasPorSector };
}

/** Pases de estacionamiento que consumen cupo de una tarifa (Funcion.cupoEstacionamientoDisponible). */
export function pasesActivos(db: Db, tarifaEstacionamientoId: number) {
  return db.paseEstacionamiento.count({
    where: {
      tarifaId: tarifaEstacionamientoId,
      estado: { in: ENTRADAS_OCUPAN },
      compra: { estado: { in: COMPRAS_ACTIVAS } },
    },
  });
}

/** Entradas que cuentan para el tope de 6 por comprador y función (las que tiene como titular). */
export function entradasDelTitular(db: Db, titularId: number, funcionId: number) {
  return db.entrada.count({ where: { ...filtroEntradasActivas(funcionId), titularId } });
}

export async function enListaNegra(db: Db, dni: string | null | undefined) {
  if (!dni) return null;
  return db.registroListaNegra.findUnique({ where: { dni } });
}
