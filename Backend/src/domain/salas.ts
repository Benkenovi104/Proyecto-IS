// Gestionar salas, dibujar escenario y definir sectores, cargar mapa de butacas (Administrador).
import { prisma, type Tx } from '../db';
import { conflicto, noEncontrado, solicitudInvalida } from '../lib/http';
import { letraFila } from './reglas';

export interface SectorMapa {
  id?: number;
  codigo: string;
  nombre: string;
  numerado: boolean;
  cupoMaximo: number;
  filas: number;
  butacasPorFila: number;
  color: string;
  forma: string;
  posX: number;
  posY: number;
  ancho: number;
  alto: number;
  puertaAcceso?: string | null;
}

export interface MapaSala {
  escenario: { nombre: string; posX: number; posY: number; ancho: number; alto: number };
  sectores: SectorMapa[];
}

/** Matriz de butacas con posición relativa dentro del sector. */
export function matrizButacas(sectorId: number, filas: number, butacasPorFila: number) {
  const butacas = [];
  for (let f = 0; f < filas; f++) {
    for (let n = 1; n <= butacasPorFila; n++) {
      butacas.push({
        sectorId,
        fila: letraFila(f),
        numero: n,
        posX: (n - 0.5) / butacasPorFila,
        posY: (f + 0.5) / filas,
      });
    }
  }
  return butacas;
}

export const incluirSalaCompleta = {
  escenarios: { orderBy: { id: 'asc' } },
  sectores: { include: { _count: { select: { butacas: true, entradas: true } } }, orderBy: { id: 'asc' } },
  playas: { orderBy: { id: 'asc' } },
} as const;

export async function detalleSala(salaId: number) {
  const sala = await prisma.sala.findUnique({ where: { id: salaId }, include: incluirSalaCompleta });
  if (!sala) throw noEncontrado('La sala no existe');
  const escenario = sala.escenarios.find((e) => e.esBase) ?? sala.escenarios[0] ?? null;
  return {
    ...sala,
    escenario,
    sectores: sala.sectores.map(({ _count, ...s }) => ({ ...s, butacasGeneradas: _count.butacas, entradasEmitidas: _count.entradas })),
  };
}

async function entradasDelSector(tx: Tx, sectorId: number) {
  return tx.entrada.count({ where: { sectorId, estado: { not: 'ANULADA' } } });
}

/** Guarda el mapa completo de la sala en una sola transacción. */
export async function guardarMapa(salaId: number, mapa: MapaSala) {
  const codigos = mapa.sectores.map((s) => s.codigo.trim().toUpperCase());
  if (new Set(codigos).size !== codigos.length) throw solicitudInvalida('Hay dos sectores con el mismo código');

  await prisma.$transaction(async (tx) => {
    const sala = await tx.sala.findUnique({ where: { id: salaId }, include: { sectores: true, escenarios: true } });
    if (!sala) throw noEncontrado('La sala no existe');

    const base = sala.escenarios.find((e) => e.esBase) ?? sala.escenarios[0];
    if (base) {
      await tx.escenario.update({ where: { id: base.id }, data: { ...mapa.escenario, esBase: true } });
    } else {
      await tx.escenario.create({ data: { ...mapa.escenario, salaId, esBase: true } });
    }

    // Sectores eliminados
    const idsEnviados = new Set(mapa.sectores.flatMap((s) => (s.id ? [s.id] : [])));
    for (const existente of sala.sectores.filter((s) => !idsEnviados.has(s.id))) {
      if (await entradasDelSector(tx, existente.id)) {
        throw conflicto(`No se puede eliminar "${existente.nombre}": tiene entradas emitidas`, 'SECTOR_CON_ENTRADAS');
      }
      await tx.sector.delete({ where: { id: existente.id } });
    }

    for (const s of mapa.sectores) {
      const filas = s.numerado ? s.filas : 0;
      const butacasPorFila = s.numerado ? s.butacasPorFila : 0;
      if (s.numerado && (filas < 1 || butacasPorFila < 1)) {
        throw solicitudInvalida(`"${s.nombre}" es numerado: indicá filas y butacas por fila`);
      }
      const datos = {
        codigo: s.codigo.trim().toUpperCase(),
        nombre: s.nombre.trim(),
        numerado: s.numerado,
        cupoMaximo: s.numerado ? filas * butacasPorFila : s.cupoMaximo,
        filas,
        butacasPorFila,
        color: s.color,
        forma: s.forma,
        posX: s.posX,
        posY: s.posY,
        ancho: s.ancho,
        alto: s.alto,
        puertaAcceso: s.puertaAcceso ?? null,
      };

      if (!s.id) {
        const creado = await tx.sector.create({ data: { ...datos, salaId } });
        if (creado.numerado) await tx.butaca.createMany({ data: matrizButacas(creado.id, filas, butacasPorFila) });
        continue;
      }

      const actual = sala.sectores.find((x) => x.id === s.id);
      if (!actual) throw noEncontrado(`El sector ${s.id} no pertenece a la sala`);
      const cambiaMatriz = actual.numerado !== s.numerado || actual.filas !== filas || actual.butacasPorFila !== butacasPorFila;
      if (cambiaMatriz && (await entradasDelSector(tx, actual.id))) {
        throw conflicto(`No se puede regenerar la matriz de "${actual.nombre}": ya tiene entradas emitidas`, 'SECTOR_CON_ENTRADAS');
      }
      if (!s.numerado && s.cupoMaximo < (await entradasDelSector(tx, actual.id))) {
        throw conflicto(`El cupo de "${actual.nombre}" no puede ser menor a las entradas ya emitidas`, 'CUPO_INSUFICIENTE');
      }
      await tx.sector.update({ where: { id: actual.id }, data: datos });
      if (cambiaMatriz) {
        await tx.butaca.deleteMany({ where: { sectorId: actual.id } });
        if (s.numerado) await tx.butaca.createMany({ data: matrizButacas(actual.id, filas, butacasPorFila) });
      }
    }
  });
  return detalleSala(salaId);
}
