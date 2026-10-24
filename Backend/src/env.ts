import 'dotenv/config';

const num = (valor: string | undefined, porDefecto: number) => {
  const n = Number(valor);
  return Number.isFinite(n) && valor !== '' && valor !== undefined ? n : porDefecto;
};

export const env = {
  port: num(process.env.PORT, 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-jwt-secret',
  qrSecret: process.env.QR_SECRET ?? 'dev-qr-secret',
  demoMode: (process.env.DEMO_MODE ?? 'true') === 'true',
  reservaMinutos: num(process.env.RESERVA_MINUTOS, 10),
  extensionPendienteMinutos: num(process.env.EXTENSION_PENDIENTE_MINUTOS, 5),
  pasarelaWebhookSegundos: num(process.env.PASARELA_WEBHOOK_SEGUNDOS, 20),
};
