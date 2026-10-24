import { Router } from 'express';
import { z } from 'zod';
import { autenticar, requiereRol, usuarioDe } from '../auth';
import { prisma } from '../db';
import { padronFuncion, resumenControl, validarCodigo } from '../domain/control';
import { PuntoControl } from '../domain/enums';
import { idParam, validar } from '../lib/http';

export const controlRouter = Router();
controlRouter.use(autenticar, requiereRol('CONTROLADOR', 'ADMINISTRADOR'));

/** Funciones publicadas desde hoy en adelante (para elegir el evento operativo). */
controlRouter.get('/funciones', async (_req, res) => {
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const funciones = await prisma.funcion.findMany({
    where: { estado: 'PUBLICADA', fechaHora: { gte: inicioDelDia } },
    include: { evento: true, sala: true },
    orderBy: { fechaHora: 'asc' },
  });
  res.json(
    funciones.map((f) => ({ id: f.id, codigo: f.codigo, fechaHora: f.fechaHora, evento: f.evento.nombre, sala: f.sala.nombre })),
  );
});

/** Consultar aforo ingresado + métricas del turno + bitácora reciente. */
controlRouter.get('/funciones/:id/resumen', async (req, res) => {
  res.json(await resumenControl(usuarioDe(req).id, idParam(req.params.id)));
});

const esquemaValidacion = z.object({
  codigo: z.string().trim().min(3),
  punto: z.nativeEnum(PuntoControl),
  funcionId: z.number().int().positive(),
  confirmar: z.boolean().default(false),
});

/** Validar entrada / pase de estacionamiento / canjear voucher («include» Leer y verificar QR). */
controlRouter.post('/validaciones', async (req, res) => {
  res.json(await validarCodigo(usuarioDe(req), validar(esquemaValidacion, req.body)));
});

/** Sincronizar padrón para modo sin conexión. */
controlRouter.get('/funciones/:id/padron', async (req, res) => {
  res.json(await padronFuncion(idParam(req.params.id)));
});

const esquemaSincronizacion = z.object({
  funcionId: z.number().int().positive(),
  operaciones: z
    .array(z.object({ codigo: z.string().min(3), punto: z.nativeEnum(PuntoControl), fechaHora: z.coerce.date() }))
    .max(500),
});

/** Conciliación diferida: aplica en el servidor los ingresos registrados sin conexión. */
controlRouter.post('/sincronizar', async (req, res) => {
  const { funcionId, operaciones } = validar(esquemaSincronizacion, req.body);
  const resultados = [];
  for (const op of operaciones) {
    resultados.push(
      await validarCodigo(usuarioDe(req), { codigo: op.codigo, punto: op.punto, funcionId, confirmar: true, offline: true, fechaHora: op.fechaHora }),
    );
  }
  res.json({
    aplicadas: resultados.filter((r) => r.confirmado).length,
    conflictos: resultados.filter((r) => !r.confirmado),
  });
});
