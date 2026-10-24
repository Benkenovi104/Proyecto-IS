import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { autenticar, requiereRol, usuarioDe, usuarioPublico } from '../auth';
import { prisma } from '../db';
import { detalleSala, guardarMapa } from '../domain/salas';
import { conflicto, idParam, noEncontrado, solicitudInvalida, validar } from '../lib/http';

export const adminRouter = Router();
adminRouter.use(autenticar, requiereRol('ADMINISTRADOR'));

// ─── Gestionar salas ─────────────────────────────────────────────────────────

adminRouter.get('/salas', async (_req, res) => {
  const salas = await prisma.sala.findMany({
    include: { _count: { select: { sectores: true, playas: true, funciones: true } } },
    orderBy: { id: 'asc' },
  });
  res.json(salas);
});

adminRouter.get('/salas/:id', async (req, res) => {
  res.json(await detalleSala(idParam(req.params.id)));
});

const esquemaSala = z.object({
  nombre: z.string().trim().min(3),
  direccion: z.string().trim().min(3),
  capacidad: z.number().int().positive(),
});

adminRouter.post('/salas', async (req, res) => {
  const datos = validar(esquemaSala, req.body);
  const cantidad = await prisma.sala.count();
  const sala = await prisma.sala.create({
    data: {
      ...datos,
      codigo: `VEN-${String(cantidad + 41).padStart(3, '0')}`,
      escenarios: { create: { nombre: 'Escenario Principal', esBase: true, posX: 180, posY: 24, ancho: 500, alto: 105 } },
    },
  });
  res.status(201).json(await detalleSala(sala.id));
});

adminRouter.patch('/salas/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const datos = validar(esquemaSala.partial(), req.body);
  await prisma.sala.update({ where: { id }, data: datos });
  res.json(await detalleSala(id));
});

const numero = z.number().finite();
const esquemaMapa = z.object({
  escenario: z.object({ nombre: z.string().trim().min(1), posX: numero, posY: numero, ancho: numero.positive(), alto: numero.positive() }),
  sectores: z.array(
    z.object({
      id: z.number().int().positive().optional(),
      codigo: z.string().trim().min(2),
      nombre: z.string().trim().min(2),
      numerado: z.boolean(),
      cupoMaximo: z.number().int().min(0),
      filas: z.number().int().min(0).max(40),
      butacasPorFila: z.number().int().min(0).max(60),
      color: z.string().min(1),
      forma: z.enum(['RECT', 'TRAPECIO', 'ARCO']),
      posX: numero,
      posY: numero,
      ancho: numero.positive(),
      alto: numero.positive(),
      puertaAcceso: z.string().trim().nullish(),
    }),
  ),
});

/** Dibujar escenario, definir sectores y cargar mapa de butacas. */
adminRouter.put('/salas/:id/mapa', async (req, res) => {
  res.json(await guardarMapa(idParam(req.params.id), validar(esquemaMapa, req.body)));
});

// ─── Gestionar playas de estacionamiento ─────────────────────────────────────

const esquemaPlaya = z.object({
  nombre: z.string().trim().min(2),
  capacidadTotal: z.number().int().positive(),
  usoExclusivo: z.boolean().default(false),
  habilitada: z.boolean().default(true),
});

adminRouter.post('/salas/:id/playas', async (req, res) => {
  const salaId = idParam(req.params.id);
  const datos = validar(esquemaPlaya, req.body);
  res.status(201).json(await prisma.playaEstacionamiento.create({ data: { ...datos, salaId } }));
});

adminRouter.patch('/playas/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const datos = validar(esquemaPlaya.partial(), req.body);
  if (datos.capacidadTotal !== undefined) {
    const mayorCupo = await prisma.tarifaEstacionamiento.findFirst({ where: { playaId: id }, orderBy: { cupoHabilitado: 'desc' } });
    if (mayorCupo && mayorCupo.cupoHabilitado > datos.capacidadTotal) {
      throw conflicto(`Hay funciones con ${mayorCupo.cupoHabilitado} cocheras habilitadas en esta playa`, 'CAPACIDAD_INSUFICIENTE');
    }
  }
  res.json(await prisma.playaEstacionamiento.update({ where: { id }, data: datos }));
});

adminRouter.delete('/playas/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const pases = await prisma.paseEstacionamiento.count({ where: { tarifa: { playaId: id }, estado: { not: 'ANULADA' } } });
  if (pases) throw conflicto('La playa tiene pases emitidos: deshabilitala en lugar de eliminarla', 'PLAYA_CON_PASES');
  await prisma.playaEstacionamiento.delete({ where: { id } });
  res.status(204).end();
});

// ─── Gestionar lista negra (derecho de admisión) ─────────────────────────────

adminRouter.get('/lista-negra', async (_req, res) => {
  const registros = await prisma.registroListaNegra.findMany({ orderBy: { fechaAlta: 'desc' } });
  const conEntradas = await Promise.all(
    registros.map(async (r) => ({
      ...r,
      entradasVigentes: await prisma.entrada.count({ where: { titular: { dni: r.dni }, estado: 'VIGENTE', compra: { estado: 'PAGADA' } } }),
    })),
  );
  res.json(conEntradas);
});

const esquemaListaNegra = z.object({
  dni: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 dígitos')),
  nombre: z.string().trim().optional(),
  motivo: z.string().trim().min(3),
});

adminRouter.post('/lista-negra', async (req, res) => {
  const datos = validar(esquemaListaNegra, req.body);
  if (await prisma.registroListaNegra.findUnique({ where: { dni: datos.dni } })) throw conflicto('Ese DNI ya está en la lista negra');
  res.status(201).json(await prisma.registroListaNegra.create({ data: datos }));
});

adminRouter.delete('/lista-negra/:id', async (req, res) => {
  await prisma.registroListaNegra.delete({ where: { id: idParam(req.params.id) } });
  res.status(204).end();
});

// ─── Gestionar usuarios del backoffice ───────────────────────────────────────

adminRouter.get('/usuarios', async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({ orderBy: [{ rol: 'asc' }, { id: 'asc' }] });
  res.json(usuarios.map((u) => ({ ...usuarioPublico(u), activo: u.activo, creadoEn: u.creadoEn })));
});

const esquemaUsuario = z.object({
  nombre: z.string().trim().min(3),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(6),
  rol: z.enum(['ADMINISTRADOR', 'ORGANIZADOR', 'CONTROLADOR']),
  productora: z.string().trim().optional(),
  puntoAcceso: z.string().trim().optional(),
});

adminRouter.post('/usuarios', async (req, res) => {
  const { password, ...datos } = validar(esquemaUsuario, req.body);
  if (datos.rol === 'ORGANIZADOR' && !datos.productora) throw solicitudInvalida('Indicá la productora del organizador');
  const usuario = await prisma.usuario.create({ data: { ...datos, passwordHash: await bcrypt.hash(password, 10) } });
  res.status(201).json(usuarioPublico(usuario));
});

adminRouter.patch('/usuarios/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const { activo } = validar(z.object({ activo: z.boolean() }), req.body);
  if (id === usuarioDe(req).id && !activo) throw solicitudInvalida('No podés desactivar tu propio usuario');
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw noEncontrado('El usuario no existe');
  const actualizado = await prisma.usuario.update({ where: { id }, data: { activo } });
  res.json({ ...usuarioPublico(actualizado), activo: actualizado.activo });
});
