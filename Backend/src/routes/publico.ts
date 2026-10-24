import { Router } from 'express';
import { z } from 'zod';
import { autenticarOpcional } from '../auth';
import { Categoria } from '../domain/enums';
import { cartelera, detalleFuncion } from '../domain/funciones';
import { idParam, validar } from '../lib/http';

export const publicoRouter = Router();

const esquemaFiltros = z.object({
  q: z.string().trim().optional(),
  categoria: z.nativeEnum(Categoria).optional().or(z.literal('').transform(() => undefined)),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

/** Buscar eventos (cartelera de funciones publicadas). */
publicoRouter.get('/eventos', async (req, res) => {
  res.json(await cartelera(validar(esquemaFiltros, req.query)));
});

/** Mostrar mapa con disponibilidad. */
publicoRouter.get('/funciones/:id', autenticarOpcional, async (req, res) => {
  res.json(await detalleFuncion(idParam(req.params.id), req.usuario));
});
