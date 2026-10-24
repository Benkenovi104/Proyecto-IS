// Enumeraciones del punto 2.3 del Caso Integrador.
// SQLite no soporta enums nativos, así que se validan en la aplicación.

const enumeracion = <T extends string>(...valores: T[]) =>
  Object.fromEntries(valores.map((v) => [v, v])) as { [K in T]: K };

export const Rol = enumeracion('ADMINISTRADOR', 'ORGANIZADOR', 'COMPRADOR', 'CONTROLADOR');
export type Rol = keyof typeof Rol;

export const Categoria = enumeracion('RECITAL', 'TEATRO', 'DEPORTE', 'OTRO');
export type Categoria = keyof typeof Categoria;

export const EstadoFuncion = enumeracion('BORRADOR', 'PUBLICADA', 'DESPUBLICADA', 'FINALIZADA');
export type EstadoFuncion = keyof typeof EstadoFuncion;

export const EstadoCompra = enumeracion('RESERVADA', 'PENDIENTE_PAGO', 'PAGADA', 'VENCIDA', 'REEMBOLSADA');
export type EstadoCompra = keyof typeof EstadoCompra;

export const EstadoEntrada = enumeracion('VIGENTE', 'USADA', 'ANULADA');
export type EstadoEntrada = keyof typeof EstadoEntrada;

export const EstadoTransferencia = enumeracion('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'CANCELADA');
export type EstadoTransferencia = keyof typeof EstadoTransferencia;

export const EstadoReembolso = enumeracion('PENDIENTE', 'COMPLETADO', 'RECHAZADO');
export type EstadoReembolso = keyof typeof EstadoReembolso;

export const PuntoControl = enumeracion('PUERTA', 'ESTACIONAMIENTO', 'BARRA');
export type PuntoControl = keyof typeof PuntoControl;

/** Compras que retienen ubicaciones, cupo y stock. */
export const COMPRAS_ACTIVAS: EstadoCompra[] = ['RESERVADA', 'PENDIENTE_PAGO', 'PAGADA'];
/** Entradas que ocupan una ubicación (las ANULADAS la liberan). */
export const ENTRADAS_OCUPAN: EstadoEntrada[] = ['VIGENTE', 'USADA'];
