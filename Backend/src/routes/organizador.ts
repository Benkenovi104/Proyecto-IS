import { Router } from 'express';
import { z } from 'zod';
import { autenticar, requiereRol, usuarioDe, type UsuarioAutenticado } from '../auth';
import { prisma } from '../db';
import { Categoria } from '../domain/enums';
import { despublicarFuncion, publicarFuncion, verificarSalaLibre } from '../domain/funciones';
import { metricasFuncion, reporteCsv } from '../domain/metricas';
import { pasesActivos } from '../domain/ocupacion';
import { descuentoVigente, precioVigente } from '../domain/precios';
import { conflicto, idParam, noEncontrado, prohibido, solicitudInvalida, validar } from '../lib/http';

export const organizadorRouter = Router();
organizadorRouter.use(autenticar, requiereRol('ORGANIZADOR', 'ADMINISTRADOR'));

const filtroPropios = (u: UsuarioAutenticado) => (u.rol === 'ADMINISTRADOR' ? {} : { organizadorId: u.id });

async function eventoPropio(u: UsuarioAutenticado, eventoId: number) {
  const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
  if (!evento) throw noEncontrado('El evento no existe');
  if (u.rol !== 'ADMINISTRADOR' && evento.organizadorId !== u.id) throw prohibido('El evento pertenece a otro organizador');
  return evento;
}

async function funcionPropia(u: UsuarioAutenticado, funcionId: number) {
  const funcion = await prisma.funcion.findUnique({ where: { id: funcionId }, include: { evento: true } });
  if (!funcion) throw noEncontrado('La función no existe');
  if (u.rol !== 'ADMINISTRADOR' && funcion.evento.organizadorId !== u.id) throw prohibido('La función pertenece a otro organizador');
  return funcion;
}

/** Eventos y funciones del organizador + salas disponibles (para los selectores del panel). */
organizadorRouter.get('/panel', async (req, res) => {
  const u = usuarioDe(req);
  const [eventos, salas] = await Promise.all([
    prisma.evento.findMany({
      where: filtroPropios(u),
      include: { funciones: { include: { sala: true }, orderBy: { fechaHora: 'asc' } } },
      orderBy: { id: 'asc' },
    }),
    prisma.sala.findMany({ include: { escenarios: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } }),
  ]);
  res.json({
    eventos: eventos.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      categoria: e.categoria,
      descripcion: e.descripcion,
      funciones: e.funciones.map((f) => ({ id: f.id, codigo: f.codigo, fechaHora: f.fechaHora, estado: f.estado, sala: f.sala.nombre })),
    })),
    salas: salas.map((s) => ({ id: s.id, nombre: s.nombre, direccion: s.direccion, capacidad: s.capacidad, escenarios: s.escenarios })),
  });
});

const esquemaEvento = z.object({
  nombre: z.string().trim().min(3),
  categoria: z.nativeEnum(Categoria),
  descripcion: z.string().trim().optional(),
});

/** Crear evento. */
organizadorRouter.post('/eventos', async (req, res) => {
  const datos = validar(esquemaEvento, req.body);
  const evento = await prisma.evento.create({ data: { ...datos, organizadorId: usuarioDe(req).id } });
  res.status(201).json(evento);
});

const esquemaFuncion = z.object({
  eventoId: z.number().int().positive(),
  salaId: z.number().int().positive(),
  fechaHora: z.coerce.date(),
  escenarioId: z.number().int().positive().optional(),
});

/** Programar función: sala, fecha y hora (verifica que la sala esté libre). */
organizadorRouter.post('/funciones', async (req, res) => {
  const datos = validar(esquemaFuncion, req.body);
  const evento = await eventoPropio(usuarioDe(req), datos.eventoId);
  if (datos.fechaHora <= new Date()) throw solicitudInvalida('La fecha de la función debe ser futura');
  const sala = await prisma.sala.findUnique({ where: { id: datos.salaId }, include: { escenarios: true } });
  if (!sala) throw noEncontrado('La sala no existe');
  const escenario = datos.escenarioId
    ? sala.escenarios.find((e) => e.id === datos.escenarioId)
    : (sala.escenarios.find((e) => e.esBase) ?? sala.escenarios[0]);
  if (!escenario) throw conflicto('La sala no tiene un escenario dibujado; pedile al administrador que lo cargue', 'SALA_SIN_ESCENARIO');
  await verificarSalaLibre(sala.id, datos.fechaHora);

  const cantidad = await prisma.funcion.count({ where: { eventoId: evento.id } });
  const sigla = evento.nombre.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'EVT';
  const funcion = await prisma.funcion.create({
    data: {
      codigo: `FUN-${sigla}${datos.fechaHora.getFullYear() % 100}-${String(evento.id).padStart(2, '0')}-${String(cantidad + 1).padStart(2, '0')}`,
      eventoId: evento.id,
      salaId: sala.id,
      escenarioId: escenario.id,
      fechaHora: datos.fechaHora,
    },
  });
  res.status(201).json(funcion);
});

/** Configuración completa de una función para el panel del organizador. */
organizadorRouter.get('/funciones/:id', async (req, res) => {
  const { id } = await funcionPropia(usuarioDe(req), idParam(req.params.id));
  const funcion = await prisma.funcion.findUniqueOrThrow({
    where: { id },
    include: {
      evento: { include: { organizador: true, productos: { orderBy: { id: 'asc' }, include: { items: { where: { voucher: { estado: { not: 'ANULADA' }, compra: { estado: 'PAGADA' } } } } } } } },
      sala: { include: { sectores: { orderBy: { id: 'asc' } }, playas: { orderBy: { id: 'asc' } }, escenarios: { orderBy: { id: 'asc' } } } },
      tarifas: { include: { descuentos: { orderBy: { vigenciaHasta: 'desc' } } } },
      tarifasEstacionamiento: true,
    },
  });
  const metricas = await metricasFuncion(id);

  res.json({
    funcion: {
      id: funcion.id,
      codigo: funcion.codigo,
      fechaHora: funcion.fechaHora,
      estado: funcion.estado,
      exigePatente: funcion.exigePatente,
      aperturaPlaya: funcion.aperturaPlaya,
      escenarioId: funcion.escenarioId,
    },
    evento: {
      id: funcion.evento.id,
      nombre: funcion.evento.nombre,
      categoria: funcion.evento.categoria,
      descripcion: funcion.evento.descripcion,
      productora: funcion.evento.organizador.productora,
    },
    sala: { id: funcion.sala.id, nombre: funcion.sala.nombre, direccion: funcion.sala.direccion, capacidad: funcion.sala.capacidad },
    escenarios: funcion.sala.escenarios.map((e) => ({ id: e.id, nombre: e.nombre, esBase: e.esBase })),
    sectores: funcion.sala.sectores.map((s) => {
      const tarifa = funcion.tarifas.find((t) => t.sectorId === s.id);
      const descuento = tarifa?.descuentos[0] ?? null;
      const vendido = metricas.entradas.porSector.find((p) => p.sectorId === s.id);
      return {
        id: s.id,
        codigo: s.codigo,
        nombre: s.nombre,
        numerado: s.numerado,
        color: s.color,
        cupo: s.cupoMaximo,
        vendidas: vendido?.vendidas ?? 0,
        tarifa: tarifa
          ? {
              precio: tarifa.precio,
              precioFinal: precioVigente(tarifa),
              descuento: descuento
                ? {
                    porcentaje: descuento.porcentaje,
                    vigenciaDesde: descuento.vigenciaDesde,
                    vigenciaHasta: descuento.vigenciaHasta,
                    descripcion: descuento.descripcion,
                    vigente: !!descuentoVigente([descuento]),
                  }
                : null,
            }
          : null,
      };
    }),
    playas: await Promise.all(
      funcion.sala.playas.map(async (p) => {
        const tarifa = funcion.tarifasEstacionamiento.find((t) => t.playaId === p.id);
        return {
          id: p.id,
          nombre: p.nombre,
          capacidadTotal: p.capacidadTotal,
          usoExclusivo: p.usoExclusivo,
          habilitadaEnSala: p.habilitada,
          tarifa: tarifa
            ? { id: tarifa.id, precio: tarifa.precio, cupoHabilitado: tarifa.cupoHabilitado, reservados: await pasesActivos(prisma, tarifa.id) }
            : null,
        };
      }),
    ),
    productos: funcion.evento.productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precioPreventa: p.precioPreventa,
      precioLista: p.precioLista,
      stockDisponible: p.stockDisponible,
      activo: p.activo,
      vendidos: p.items.reduce((a, i) => a + i.cantidad, 0),
    })),
    metricas,
  });
});

const esquemaAjustes = z.object({
  escenarioId: z.number().int().positive().optional(),
  exigePatente: z.boolean().optional(),
  aperturaPlaya: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

/** Ajustar escenario de la función («extend» de Programar función) y opciones generales. */
organizadorRouter.patch('/funciones/:id', async (req, res) => {
  const funcion = await funcionPropia(usuarioDe(req), idParam(req.params.id));
  const datos = validar(esquemaAjustes, req.body);
  if (datos.escenarioId) {
    const escenario = await prisma.escenario.findFirst({ where: { id: datos.escenarioId, salaId: funcion.salaId } });
    if (!escenario) throw solicitudInvalida('El escenario debe pertenecer a la sala de la función');
  }
  res.json(await prisma.funcion.update({ where: { id: funcion.id }, data: datos }));
});

organizadorRouter.post('/funciones/:id/publicar', async (req, res) => {
  const funcion = await funcionPropia(usuarioDe(req), idParam(req.params.id));
  res.json(await publicarFuncion(funcion.id));
});

organizadorRouter.post('/funciones/:id/despublicar', async (req, res) => {
  const funcion = await funcionPropia(usuarioDe(req), idParam(req.params.id));
  res.json(await despublicarFuncion(funcion.id));
});

const esquemaTarifas = z.object({
  tarifas: z.array(
    z.object({
      sectorId: z.number().int().positive(),
      precio: z.number().int().min(0),
      descuento: z
        .object({
          porcentaje: z.number().min(1).max(90),
          vigenciaDesde: z.coerce.date().optional(),
          vigenciaHasta: z.coerce.date(),
          descripcion: z.string().optional(),
        })
        .nullable(),
    }),
  ),
});

/** Definir precios por sector y cargar descuentos. */
organizadorRouter.put('/funciones/:id/tarifas', async (req, res) => {
  const funcion = await funcionPropia(usuarioDe(req), idParam(req.params.id));
  const { tarifas } = validar(esquemaTarifas, req.body);
  const sectores = await prisma.sector.findMany({ where: { salaId: funcion.salaId }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    for (const t of tarifas) {
      if (!sectores.some((s) => s.id === t.sectorId)) throw solicitudInvalida('El sector no pertenece a la sala de la función');
      if (t.precio === 0) {
        await tx.tarifa.deleteMany({ where: { funcionId: funcion.id, sectorId: t.sectorId } });
        continue;
      }
      const tarifa = await tx.tarifa.upsert({
        where: { funcionId_sectorId: { funcionId: funcion.id, sectorId: t.sectorId } },
        create: { funcionId: funcion.id, sectorId: t.sectorId, precio: t.precio },
        update: { precio: t.precio },
      });
      await tx.descuento.deleteMany({ where: { tarifaId: tarifa.id } });
      if (t.descuento) {
        await tx.descuento.create({
          data: {
            tarifaId: tarifa.id,
            porcentaje: t.descuento.porcentaje,
            vigenciaDesde: t.descuento.vigenciaDesde ?? new Date(),
            vigenciaHasta: t.descuento.vigenciaHasta,
            descripcion: t.descuento.descripcion,
          },
        });
      }
    }
  });
  res.json({ ok: true });
});

const esquemaEstacionamiento = z.object({
  exigePatente: z.boolean(),
  aperturaPlaya: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  playas: z.array(
    z.object({
      playaId: z.number().int().positive(),
      habilitada: z.boolean(),
      precio: z.number().int().min(0),
      cupoHabilitado: z.number().int().min(0),
    }),
  ),
});

/** Configurar estacionamiento por función (cupo y tarifa sobre las playas de la sala). */
organizadorRouter.put('/funciones/:id/estacionamiento', async (req, res) => {
  const funcion = await funcionPropia(usuarioDe(req), idParam(req.params.id));
  const datos = validar(esquemaEstacionamiento, req.body);
  await prisma.$transaction(async (tx) => {
    await tx.funcion.update({ where: { id: funcion.id }, data: { exigePatente: datos.exigePatente, aperturaPlaya: datos.aperturaPlaya } });
    for (const p of datos.playas) {
      const playa = await tx.playaEstacionamiento.findFirst({ where: { id: p.playaId, salaId: funcion.salaId } });
      if (!playa) throw solicitudInvalida('La playa no pertenece a la sala de la función');
      const actual = await tx.tarifaEstacionamiento.findUnique({ where: { funcionId_playaId: { funcionId: funcion.id, playaId: playa.id } } });
      const reservados = actual ? await pasesActivos(tx, actual.id) : 0;
      if (!p.habilitada) {
        if (reservados) throw conflicto(`${playa.nombre} ya tiene ${reservados} pases vendidos: no se puede deshabilitar`, 'PLAYA_CON_PASES');
        if (actual) await tx.tarifaEstacionamiento.delete({ where: { id: actual.id } });
        continue;
      }
      if (p.cupoHabilitado > playa.capacidadTotal) {
        throw solicitudInvalida(`El cupo de ${playa.nombre} no puede superar su capacidad física (${playa.capacidadTotal})`);
      }
      if (p.cupoHabilitado < reservados) {
        throw conflicto(`El cupo de ${playa.nombre} no puede ser menor a los ${reservados} pases ya reservados`, 'CUPO_INSUFICIENTE');
      }
      await tx.tarifaEstacionamiento.upsert({
        where: { funcionId_playaId: { funcionId: funcion.id, playaId: playa.id } },
        create: { funcionId: funcion.id, playaId: playa.id, precio: p.precio, cupoHabilitado: p.cupoHabilitado },
        update: { precio: p.precio, cupoHabilitado: p.cupoHabilitado },
      });
    }
  });
  res.json({ ok: true });
});

const esquemaProducto = z.object({
  nombre: z.string().trim().min(2),
  descripcion: z.string().trim().nullish(),
  precioPreventa: z.number().int().positive(),
  precioLista: z.number().int().positive().nullish(),
  stockDisponible: z.number().int().min(0),
  activo: z.boolean().optional(),
});

/** Gestionar catálogo de consumiciones. */
organizadorRouter.post('/eventos/:id/productos', async (req, res) => {
  const evento = await eventoPropio(usuarioDe(req), idParam(req.params.id));
  const datos = validar(esquemaProducto, req.body);
  res.status(201).json(await prisma.productoConsumicion.create({ data: { ...datos, eventoId: evento.id } }));
});

organizadorRouter.patch('/productos/:id', async (req, res) => {
  const producto = await prisma.productoConsumicion.findUnique({ where: { id: idParam(req.params.id) } });
  if (!producto) throw noEncontrado('El producto no existe');
  await eventoPropio(usuarioDe(req), producto.eventoId);
  const datos = validar(esquemaProducto.partial(), req.body);
  res.json(await prisma.productoConsumicion.update({ where: { id: producto.id }, data: datos }));
});

organizadorRouter.delete('/productos/:id', async (req, res) => {
  const producto = await prisma.productoConsumicion.findUnique({ where: { id: idParam(req.params.id) }, include: { _count: { select: { items: true } } } });
  if (!producto) throw noEncontrado('El producto no existe');
  await eventoPropio(usuarioDe(req), producto.eventoId);
  if (producto._count.items) {
    // Ya se vendió: se da de baja del catálogo pero se conserva para los vouchers emitidos
    await prisma.productoConsumicion.update({ where: { id: producto.id }, data: { activo: false } });
  } else {
    await prisma.productoConsumicion.delete({ where: { id: producto.id } });
  }
  res.status(204).end();
});

/** Consultar reportes de venta. */
organizadorRouter.get('/funciones/:id/metricas', async (req, res) => {
  const funcion = await funcionPropia(usuarioDe(req), idParam(req.params.id));
  res.json(await metricasFuncion(funcion.id));
});

organizadorRouter.get('/funciones/:id/reporte.csv', async (req, res) => {
  const funcion = await funcionPropia(usuarioDe(req), idParam(req.params.id));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reporte-${funcion.codigo}.csv"`);
  res.send(await reporteCsv(funcion.id));
});
