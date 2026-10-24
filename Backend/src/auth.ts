import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db';
import { env } from './env';
import type { Rol } from './domain/enums';
import { HttpError, prohibido } from './lib/http';

export interface UsuarioAutenticado {
  id: number;
  rol: Rol;
  nombre: string;
  email: string;
  dni: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

export function emitirToken(usuario: { id: number; rol: string }) {
  return jwt.sign({ sub: String(usuario.id), rol: usuario.rol }, env.jwtSecret, { expiresIn: '12h' });
}

export function usuarioPublico(u: {
  id: number;
  rol: string;
  nombre: string;
  email: string;
  dni: string | null;
  productora?: string | null;
  puntoAcceso?: string | null;
}) {
  return {
    id: u.id,
    rol: u.rol as Rol,
    nombre: u.nombre,
    email: u.email,
    dni: u.dni,
    productora: u.productora ?? null,
    puntoAcceso: u.puntoAcceso ?? null,
  };
}

async function leerUsuario(header: string | undefined) {
  if (!header?.startsWith('Bearer ')) return null;
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw new HttpError(401, 'La sesión expiró, volvé a iniciar sesión', 'TOKEN_INVALIDO');
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: Number(payload.sub) } });
  if (!usuario || !usuario.activo) throw new HttpError(401, 'Usuario inexistente o inactivo', 'USUARIO_INACTIVO');
  return { id: usuario.id, rol: usuario.rol as Rol, nombre: usuario.nombre, email: usuario.email, dni: usuario.dni };
}

export const autenticar: RequestHandler = async (req, _res, next) => {
  const usuario = await leerUsuario(req.headers.authorization);
  if (!usuario) throw new HttpError(401, 'Necesitás iniciar sesión', 'NO_AUTENTICADO');
  req.usuario = usuario;
  next();
};

export const autenticarOpcional: RequestHandler = async (req, _res, next) => {
  req.usuario = (await leerUsuario(req.headers.authorization).catch(() => null)) ?? undefined;
  next();
};

export const requiereRol =
  (...roles: Rol[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) throw prohibido('Tu rol no tiene acceso a esta sección');
    next();
  };

/** Usuario autenticado de la request (después del middleware `autenticar`). */
export const usuarioDe = (req: Express.Request) => req.usuario!;
