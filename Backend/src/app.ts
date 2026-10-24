import cors from 'cors';
import express from 'express';
import { env } from './env';
import { manejarErrores } from './lib/http';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { compradorRouter } from './routes/comprador';
import { controlRouter } from './routes/control';
import { organizadorRouter } from './routes/organizador';
import { publicoRouter } from './routes/publico';

export function crearApp() {
  const app = express();
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hora: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/org', organizadorRouter);
  app.use('/api/control', controlRouter);
  app.use('/api', publicoRouter);
  app.use('/api', compradorRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta inexistente', code: 'RUTA_INEXISTENTE' });
  });
  app.use(manejarErrores);
  return app;
}
