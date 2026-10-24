import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { autenticar, emitirToken, usuarioDe, usuarioPublico } from '../auth';
import { prisma } from '../db';
import { CUENTAS_DEMO } from '../domain/demo';
import { Rol } from '../domain/enums';
import { env } from '../env';
import { conflicto, HttpError, noEncontrado, validar } from '../lib/http';

export const authRouter = Router();

const esquemaLogin = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', async (req, res) => {
  const { email, password } = validar(esquemaLogin, req.body);
  const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
  if (!usuario || !(await bcrypt.compare(password, usuario.passwordHash))) {
    throw new HttpError(401, 'Email o contraseña incorrectos', 'CREDENCIALES_INVALIDAS');
  }
  if (!usuario.activo) throw new HttpError(403, 'Tu usuario está desactivado', 'USUARIO_INACTIVO');
  res.json({ token: emitirToken(usuario), usuario: usuarioPublico(usuario) });
});

const esquemaRegistro = z.object({
  nombre: z.string().trim().min(3, 'Ingresá nombre y apellido'),
  dni: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 dígitos')),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

/** Registrarse (solo compradores; los usuarios del backoffice los da de alta el administrador). */
authRouter.post('/registro', async (req, res) => {
  const datos = validar(esquemaRegistro, req.body);
  if (await prisma.usuario.findUnique({ where: { email: datos.email } })) throw conflicto('Ya existe una cuenta con ese email', 'EMAIL_REGISTRADO');
  if (await prisma.usuario.findUnique({ where: { dni: datos.dni } })) throw conflicto('Ya existe una cuenta con ese DNI', 'DNI_REGISTRADO');
  const usuario = await prisma.usuario.create({
    data: {
      nombre: datos.nombre,
      dni: datos.dni,
      email: datos.email,
      passwordHash: await bcrypt.hash(datos.password, 10),
      rol: Rol.COMPRADOR,
    },
  });
  res.status(201).json({ token: emitirToken(usuario), usuario: usuarioPublico(usuario) });
});

authRouter.get('/me', autenticar, async (req, res) => {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioDe(req).id } });
  res.json(usuarioPublico(usuario));
});

authRouter.get('/demo', (_req, res) => {
  res.json({ habilitado: env.demoMode, cuentas: env.demoMode ? CUENTAS_DEMO : {} });
});

/** Login rápido con la cuenta demo de un rol (selector de roles de la cabecera). */
authRouter.post('/demo', async (req, res) => {
  if (!env.demoMode) throw new HttpError(403, 'El modo demo está deshabilitado', 'DEMO_DESHABILITADO');
  const { rol } = validar(z.object({ rol: z.nativeEnum(Rol) }), req.body);
  const usuario = await prisma.usuario.findUnique({ where: { email: CUENTAS_DEMO[rol].email } });
  if (!usuario) throw noEncontrado('No existe la cuenta demo; corré `npm run db:seed`');
  res.json({ token: emitirToken(usuario), usuario: usuarioPublico(usuario) });
});
