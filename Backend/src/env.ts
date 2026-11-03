import 'dotenv/config';

const num = (valor: string | undefined, porDefecto: number) => {
  const n = Number(valor);
  return Number.isFinite(n) && valor !== '' && valor !== undefined ? n : porDefecto;
};

/** Sin valor por defecto: un secreto conocido permitiría falsificar sesiones y códigos QR. */
const secreto = (nombre: string) => {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en Backend/.env (corré "npm run setup" para crearlo)`);
  return valor;
};

export const env = {
  port: num(process.env.PORT, 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: secreto('JWT_SECRET'),
  qrSecret: secreto('QR_SECRET'),
  // El login rápido con cuentas demo se habilita solo de forma explícita
  demoMode: process.env.DEMO_MODE === 'true',
  reservaMinutos: num(process.env.RESERVA_MINUTOS, 10),
  extensionPendienteMinutos: num(process.env.EXTENSION_PENDIENTE_MINUTOS, 5),
  pasarelaWebhookSegundos: num(process.env.PASARELA_WEBHOOK_SEGUNDOS, 20),
};
