import type { Rol } from './enums';

/** Cuentas de demostración que usa el selector de roles de la cabecera (DEMO_MODE=true). */
export const CUENTAS_DEMO: Record<Rol, { email: string; password: string }> = {
  ADMINISTRADOR: { email: 'admin@ticketfr.com', password: 'admin123' },
  ORGANIZADOR: { email: 'organizador@ticketfr.com', password: 'organizador123' },
  COMPRADOR: { email: 'comprador@ticketfr.com', password: 'comprador123' },
  CONTROLADOR: { email: 'controlador@ticketfr.com', password: 'controlador123' },
};
