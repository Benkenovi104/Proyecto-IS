// Modo sin conexión del control de acceso (riesgo R-05):
// el padrón de la función se guarda en el dispositivo y los ingresos se encolan para sincronizar.
import type { Padron, PuntoControl, ResultadoValidacion } from '../../lib/tipos';

const clavePadron = (funcionId: number) => `ticketfr.padron.${funcionId}`;
const claveCola = (funcionId: number) => `ticketfr.cola.${funcionId}`;

export interface OperacionPendiente {
  codigo: string;
  punto: PuntoControl;
  fechaHora: string;
}

function leer<T>(clave: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? 'null');
  } catch {
    return null;
  }
}
function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento disponible: el modo offline queda deshabilitado
  }
}

export const padronLocal = (funcionId: number) => leer<Padron>(clavePadron(funcionId));
export const guardarPadron = (padron: Padron) => escribir(clavePadron(padron.funcionId), padron);
export const colaPendiente = (funcionId: number) => leer<OperacionPendiente[]>(claveCola(funcionId)) ?? [];
export const vaciarCola = (funcionId: number) => escribir(claveCola(funcionId), []);

const PUNTO: Record<string, PuntoControl> = { ENTRADA: 'PUERTA', PASE: 'ESTACIONAMIENTO', VOUCHER: 'BARRA' };

/** Misma lógica que el servidor, sobre el padrón local. No puede verificar la firma del QR. */
export function validarOffline(funcionId: number, entrada: string, punto: PuntoControl, confirmar: boolean): ResultadoValidacion {
  const inicio = performance.now();
  const padron = padronLocal(funcionId);
  const qr = /^TFR1:([A-Z0-9-]+):[0-9a-f]+$/i.exec(entrada.trim());
  let codigo = (qr ? qr[1] : entrada).toUpperCase().replace(/^#/, '').replace(/\s+/g, '');
  const r: ResultadoValidacion = {
    resultado: 'RECHAZADO',
    confirmado: false,
    codigo,
    tipo: null,
    punto,
    motivo: null,
    estadoCodigo: 'INEXISTENTE',
    titular: null,
    sector: null,
    ubicacion: null,
    puertaAcceso: null,
    patente: null,
    playa: null,
    items: [],
    pin: null,
    revocacion: null,
    usadoEn: null,
    latenciaMs: 0,
    offline: true,
  };
  const terminar = () => ({ ...r, latenciaMs: Math.max(1, Math.round(performance.now() - inicio)) });
  if (!padron) {
    r.motivo = 'Sin conexión y sin padrón sincronizado en este dispositivo';
    return terminar();
  }

  let item = padron.codigos.find((c) => c.codigo === codigo);
  if (!item && codigo.startsWith('DNI-')) {
    const doc = codigo.slice(4).replace(/\D/g, '');
    item = padron.codigos.find((c) => c.tipo === 'ENTRADA' && c.dni === doc && c.estado === 'VIGENTE') ?? padron.codigos.find((c) => c.tipo === 'ENTRADA' && c.dni === doc);
  }
  if (!item && codigo.startsWith('PAT-')) {
    const pat = codigo.slice(4).replace(/[^A-Z0-9]/g, '');
    item = padron.codigos.find((c) => c.tipo === 'PASE' && c.patente === pat && c.estado === 'VIGENTE') ?? padron.codigos.find((c) => c.tipo === 'PASE' && c.patente === pat);
  }
  if (!item) {
    const revocado = padron.revocados.find((x) => x.codigo === codigo);
    if (revocado) {
      Object.assign(r, {
        tipo: revocado.tipo,
        estadoCodigo: 'REVOCADO',
        revocacion: { motivo: revocado.motivo, fecha: revocado.fecha },
        motivo: revocado.motivo === 'TRANSFERENCIA' ? 'QR anulado: la entrada fue reasignada a un nuevo titular' : 'QR anulado por reembolso de la compra',
      });
    } else {
      r.motivo = 'El código no está en el padrón local de la función';
    }
    return terminar();
  }

  codigo = item.codigo;
  Object.assign(r, { codigo, tipo: item.tipo, estadoCodigo: item.estado, titular: { nombre: item.titular, dni: item.dni }, ubicacion: item.detalle });
  if (item.estado === 'USADA') r.motivo = 'Este código ya fue utilizado (registro local)';
  else if (item.estado === 'ANULADA') r.motivo = 'Código anulado';
  else if (PUNTO[item.tipo] !== punto) r.motivo = 'El código corresponde a otro punto de control';
  if (r.motivo) return terminar();

  r.resultado = 'APROBADO';
  if (confirmar) {
    item.estado = 'USADA';
    guardarPadron(padron);
    const cola = colaPendiente(funcionId);
    escribir(claveCola(funcionId), [...cola, { codigo, punto, fechaHora: new Date().toISOString() }]);
    Object.assign(r, { confirmado: true, estadoCodigo: 'USADA', usadoEn: new Date().toISOString() });
  }
  return terminar();
}
