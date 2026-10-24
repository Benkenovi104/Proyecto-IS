import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { type z, ZodError, type ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const noEncontrado = (msg = 'Recurso no encontrado', code = 'NO_ENCONTRADO') => new HttpError(404, msg, code);
export const prohibido = (msg = 'No tenés permiso para esta acción') => new HttpError(403, msg, 'PROHIBIDO');
export const conflicto = (msg: string, code = 'CONFLICTO', details?: unknown) => new HttpError(409, msg, code, details);
export const solicitudInvalida = (msg: string, code = 'SOLICITUD_INVALIDA') => new HttpError(400, msg, code);

export function validar<S extends ZodTypeAny>(esquema: S, datos: unknown): z.output<S> {
  return esquema.parse(datos);
}

export function idParam(valor: unknown): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Identificador inválido');
  return id;
}

export const manejarErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    const campos = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
    res.status(400).json({ error: `Datos inválidos (${campos.join('; ')})`, code: 'VALIDACION', details: err.issues });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ error: 'Ya existe un registro con esos datos', code: 'DUPLICADO', details: err.meta });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido', code: 'JSON_INVALIDO' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor', code: 'ERROR_INTERNO' });
};
