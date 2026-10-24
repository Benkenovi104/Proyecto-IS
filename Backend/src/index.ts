import { crearApp } from './app';
import { procesarVencimientos } from './domain/compras';
import { env } from './env';

const INTERVALO_VENCIMIENTOS_MS = 10_000;

crearApp().listen(env.port, () => {
  console.log(`TicketFr API escuchando en http://localhost:${env.port}/api`);
});

// Evento temporal "Venció fechaExpiracionReserva" (actividad 3.2)
setInterval(() => {
  procesarVencimientos()
    .then(({ liberadas, extendidas }) => {
      if (liberadas || extendidas) console.log(`[reservas] liberadas: ${liberadas} · extendidas: ${extendidas}`);
    })
    .catch((err) => console.error('[reservas] error procesando vencimientos', err));
}, INTERVALO_VENCIMIENTOS_MS);
