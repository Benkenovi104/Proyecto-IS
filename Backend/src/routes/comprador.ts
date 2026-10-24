import { Router } from 'express';
import { z } from 'zod';
import { autenticar, requiereRol, usuarioDe } from '../auth';
import { prisma } from '../db';
import {
  actualizarAdicionales,
  agregarEntrada,
  cancelarReserva,
  misCompras,
  obtenerCompra,
  pagar,
  quitarEntrada,
} from '../domain/compras';
import { previsualizarReembolso, solicitarReembolso } from '../domain/reembolsos';
import {
  aceptarTransferencia,
  cancelarTransferencia,
  iniciarTransferencia,
  rechazarTransferencia,
} from '../domain/transferencias';
import { idParam, validar } from '../lib/http';

export const compradorRouter = Router();
// Se monta en /api: el guard se limita a sus prefijos para no interceptar otras rutas
compradorRouter.use(['/compras', '/entradas', '/transferencias', '/notificaciones'], autenticar, requiereRol('COMPRADOR'));

compradorRouter.get('/compras/mias', async (req, res) => {
  res.json(await misCompras(usuarioDe(req)));
});

compradorRouter.get('/compras/:id', async (req, res) => {
  res.json(await obtenerCompra(idParam(req.params.id), usuarioDe(req)));
});

const esquemaUbicacion = z.object({
  funcionId: z.number().int().positive(),
  sectorId: z.number().int().positive(),
  butacaId: z.number().int().positive().nullish(),
});

/** Seleccionar ubicaciones en el mapa: agrega una entrada a la reserva (vence en 10 min). */
compradorRouter.post('/compras/reserva/entradas', async (req, res) => {
  res.status(201).json(await agregarEntrada(usuarioDe(req), validar(esquemaUbicacion, req.body)));
});

compradorRouter.delete('/compras/:id/entradas/:entradaId', async (req, res) => {
  res.json({ compra: await quitarEntrada(usuarioDe(req), idParam(req.params.id), idParam(req.params.entradaId)) });
});

compradorRouter.delete('/compras/:id', async (req, res) => {
  await cancelarReserva(usuarioDe(req), idParam(req.params.id));
  res.status(204).end();
});

const esquemaAdicionales = z.object({
  estacionamiento: z.array(z.object({ tarifaId: z.number().int().positive(), patente: z.string().min(1) })).max(6).default([]),
  consumiciones: z.array(z.object({ productoId: z.number().int().positive(), cantidad: z.number().int().min(0).max(20) })).default([]),
});

compradorRouter.put('/compras/:id/adicionales', async (req, res) => {
  res.json(await actualizarAdicionales(usuarioDe(req), idParam(req.params.id), validar(esquemaAdicionales, req.body)));
});

const esquemaPago = z.object({
  simular: z.enum(['APROBADO', 'RECHAZADO', 'SIN_RESPUESTA']).optional(),
});

compradorRouter.post('/compras/:id/pagar', async (req, res) => {
  const { simular } = validar(esquemaPago, req.body ?? {});
  res.json(await pagar(usuarioDe(req), idParam(req.params.id), simular));
});

const entradaIds = z
  .union([z.array(z.number().int().positive()), z.string()])
  .optional()
  .transform((v) => (typeof v === 'string' ? v.split(',').filter(Boolean).map(Number) : v));

compradorRouter.get('/compras/:id/reembolso', async (req, res) => {
  const { entradas } = validar(z.object({ entradas: entradaIds }), req.query);
  res.json(await previsualizarReembolso(usuarioDe(req), idParam(req.params.id), entradas));
});

const esquemaReembolso = z.object({
  entradaIds: z.array(z.number().int().positive()).optional(),
  motivo: z.string().trim().min(3, 'Indicá el motivo de la devolución'),
});

compradorRouter.post('/compras/:id/reembolsos', async (req, res) => {
  res.status(201).json(await solicitarReembolso(usuarioDe(req), idParam(req.params.id), validar(esquemaReembolso, req.body)));
});

const esquemaTransferencia = z
  .object({ dni: z.string().optional(), email: z.string().email().optional().or(z.literal('')) })
  .refine((d) => d.dni || d.email, 'Indicá el DNI o el email del destinatario');

compradorRouter.post('/entradas/:id/transferencias', async (req, res) => {
  const destino = validar(esquemaTransferencia, req.body);
  res.status(201).json(await iniciarTransferencia(usuarioDe(req), idParam(req.params.id), { dni: destino.dni, email: destino.email || undefined }));
});

compradorRouter.post('/transferencias/:id/aceptar', async (req, res) => {
  await aceptarTransferencia(usuarioDe(req), idParam(req.params.id));
  res.json(await misCompras(usuarioDe(req)));
});

compradorRouter.post('/transferencias/:id/rechazar', async (req, res) => {
  await rechazarTransferencia(usuarioDe(req), idParam(req.params.id));
  res.json(await misCompras(usuarioDe(req)));
});

compradorRouter.post('/transferencias/:id/cancelar', async (req, res) => {
  await cancelarTransferencia(usuarioDe(req), idParam(req.params.id));
  res.json(await misCompras(usuarioDe(req)));
});

/** Bandeja del servicio de mailing simulado. */
compradorRouter.get('/notificaciones', async (req, res) => {
  res.json(await prisma.notificacion.findMany({ where: { para: usuarioDe(req).email }, orderBy: { fecha: 'desc' }, take: 30 }));
});
