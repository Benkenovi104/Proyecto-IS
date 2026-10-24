// Tipos de las respuestas de la API (Backend/src).

export type Rol = 'ADMINISTRADOR' | 'ORGANIZADOR' | 'COMPRADOR' | 'CONTROLADOR';
export type Categoria = 'RECITAL' | 'TEATRO' | 'DEPORTE' | 'OTRO';
export type EstadoFuncion = 'BORRADOR' | 'PUBLICADA' | 'DESPUBLICADA' | 'FINALIZADA';
export type EstadoCompra = 'RESERVADA' | 'PENDIENTE_PAGO' | 'PAGADA' | 'VENCIDA' | 'REEMBOLSADA';
export type EstadoEntrada = 'VIGENTE' | 'USADA' | 'ANULADA';
export type PuntoControl = 'PUERTA' | 'ESTACIONAMIENTO' | 'BARRA';

export interface Usuario {
  id: number;
  rol: Rol;
  nombre: string;
  email: string;
  dni: string | null;
  productora: string | null;
  puntoAcceso: string | null;
}

export interface Sesion {
  token: string;
  usuario: Usuario;
}

export interface FuncionResumen {
  id: number;
  codigo: string;
  fechaHora: string;
  estado: EstadoFuncion;
  exigePatente: boolean;
  aperturaPlaya: string | null;
  evento: { id: number; nombre: string; categoria: Categoria };
  sala: { id: number; nombre: string; direccion: string };
}

export interface FuncionCartelera {
  id: number;
  codigo: string;
  fechaHora: string;
  evento: { id: number; nombre: string; categoria: Categoria; descripcion: string | null };
  sala: { id: number; nombre: string; direccion: string };
  precioDesde: number | null;
  hayDescuento: boolean;
  disponibles: number;
  cupo: number;
}

export interface Geometria {
  posX: number;
  posY: number;
  ancho: number;
  alto: number;
}

export interface Escenario extends Geometria {
  id: number;
  salaId: number;
  nombre: string;
  esBase: boolean;
}

export interface ButacaMapa {
  id: number;
  fila: string;
  numero: number;
  posX: number;
  posY: number;
  ocupada: boolean;
}

export interface SectorMapa extends Geometria {
  id: number;
  codigo: string;
  nombre: string;
  numerado: boolean;
  color: string;
  forma: string;
  filas: number;
  butacasPorFila: number;
  puertaAcceso: string | null;
  cupo: number;
  disponibles: number;
  precioBase: number | null;
  precio: number | null;
  descuento: { porcentaje: number; vigenciaHasta: string } | null;
  butacas: ButacaMapa[];
}

export interface DetalleFuncion {
  id: number;
  codigo: string;
  fechaHora: string;
  estado: EstadoFuncion;
  exigePatente: boolean;
  aperturaPlaya: string | null;
  evento: { id: number; nombre: string; categoria: Categoria; descripcion: string | null };
  sala: { id: number; nombre: string; direccion: string; ancho: number; alto: number };
  escenario: Escenario;
  sectores: SectorMapa[];
  estacionamiento: { tarifaId: number; playaId: number; playa: string; precio: number; cupo: number; disponibles: number }[];
  consumiciones: { id: number; nombre: string; descripcion: string | null; precio: number; precioLista: number | null; stock: number }[];
  miReserva: Compra | null;
}

export interface Entrada {
  id: number;
  precio: number;
  estado: EstadoEntrada;
  usadaEn: string | null;
  reembolsada: boolean;
  sector: { id: number; codigo: string; nombre: string; color: string; numerado: boolean; puertaAcceso: string | null };
  butaca: { id: number; fila: string; numero: number } | null;
  ubicacion: string;
  titular: { id: number; nombre: string; dni: string | null };
  esTitular: boolean;
  codigo: string | null;
  qr: string | null;
  hash: string | null;
  transferenciaPendiente: { id: number; fechaHora: string; destinatario: { id: number; nombre: string; email: string; dni: string | null } } | null;
}

export interface Pase {
  id: number;
  patente: string;
  precio: number;
  estado: EstadoEntrada;
  usadoEn: string | null;
  tarifaId: number;
  playa: { id: number; nombre: string };
  codigo: string | null;
  qr: string | null;
  hash: string | null;
}

export interface Voucher {
  id: number;
  estado: EstadoEntrada;
  pin: string;
  canjeadoEn: string | null;
  codigo: string | null;
  qr: string | null;
  items: { productoId: number; nombre: string; cantidad: number; precioUnitario: number }[];
}

export interface Compra {
  id: number;
  codigo: string;
  estado: EstadoCompra;
  fecha: string;
  fechaExpiracionReserva: string;
  reservaExtendida: boolean;
  idTransaccionPago: string | null;
  fechaPago: string | null;
  comprador: { id: number; nombre: string; email: string; dni: string | null };
  funcion: FuncionResumen;
  entradas: Entrada[];
  pases: Pase[];
  voucher: Voucher | null;
  totales: { entradas: number; estacionamiento: number; consumiciones: number; total: number };
  reembolsos: {
    id: number;
    fechaSolicitud: string;
    montoReintegrado: number;
    motivo: string;
    estado: string;
    idTransaccionReintegro: string | null;
    entradas: number[];
  }[];
}

export interface MisCompras {
  compras: Compra[];
  entradasRecibidas: (Entrada & { funcion: FuncionResumen; cedidaPor: { id: number; nombre: string; email: string } })[];
  transferenciasPendientes: {
    id: number;
    fechaHora: string;
    cedente: { id: number; nombre: string; email: string; dni: string | null };
    entrada: { id: number; sector: string; ubicacion: string; funcion: FuncionResumen };
  }[];
}

export interface PreviewReembolso {
  reembolsable: boolean;
  motivo: string | null;
  limite: string;
  incluyeAdicionales: boolean;
  entradasDevolvibles: number[];
  entradasSeleccionadas: number[];
  items: { tipo: 'ENTRADA' | 'PASE' | 'CONSUMICION'; concepto: string; monto: number }[];
  total: number;
}

export interface Notificacion {
  id: number;
  para: string;
  asunto: string;
  cuerpo: string;
  fecha: string;
}

// ─── Organizador ────────────────────────────────────────────────────────────

export interface PanelOrganizador {
  eventos: {
    id: number;
    nombre: string;
    categoria: Categoria;
    descripcion: string | null;
    funciones: { id: number; codigo: string; fechaHora: string; estado: EstadoFuncion; sala: string }[];
  }[];
  salas: { id: number; nombre: string; direccion: string; capacidad: number; escenarios: Escenario[] }[];
}

export interface Metricas {
  recaudacion: { total: number; entradas: number; estacionamiento: number; consumiciones: number; reembolsado: number; reembolsos: number };
  entradas: {
    vendidas: number;
    ingresadas: number;
    cupo: number;
    ultimas24h: number;
    porSector: { sectorId: number; nombre: string; numerado: boolean; vendidas: number; cupo: number; recaudacion: number }[];
  };
  estacionamiento: {
    vendidos: number;
    ingresados: number;
    cupo: number;
    libres: number;
    patentesRegistradas: number;
    porPlaya: { playa: string; vendidos: number; cupo: number }[];
  };
  consumiciones: {
    vouchers: number;
    canjeados: number;
    conversion: number;
    comprasPagadas: number;
    porProducto: { nombre: string; cantidad: number; recaudacion: number }[];
  };
}

export interface ConfigFuncion {
  funcion: { id: number; codigo: string; fechaHora: string; estado: EstadoFuncion; exigePatente: boolean; aperturaPlaya: string | null; escenarioId: number };
  evento: { id: number; nombre: string; categoria: Categoria; descripcion: string | null; productora: string | null };
  sala: { id: number; nombre: string; direccion: string; capacidad: number };
  escenarios: { id: number; nombre: string; esBase: boolean }[];
  sectores: {
    id: number;
    codigo: string;
    nombre: string;
    numerado: boolean;
    color: string;
    cupo: number;
    vendidas: number;
    tarifa: {
      precio: number;
      precioFinal: number;
      descuento: { porcentaje: number; vigenciaDesde: string; vigenciaHasta: string; descripcion: string | null; vigente: boolean } | null;
    } | null;
  }[];
  playas: {
    id: number;
    nombre: string;
    capacidadTotal: number;
    usoExclusivo: boolean;
    habilitadaEnSala: boolean;
    tarifa: { id: number; precio: number; cupoHabilitado: number; reservados: number } | null;
  }[];
  productos: {
    id: number;
    nombre: string;
    descripcion: string | null;
    precioPreventa: number;
    precioLista: number | null;
    stockDisponible: number;
    activo: boolean;
    vendidos: number;
  }[];
  metricas: Metricas;
}

// ─── Administrador ──────────────────────────────────────────────────────────

export interface SectorSala extends Geometria {
  id: number;
  salaId: number;
  codigo: string;
  nombre: string;
  numerado: boolean;
  cupoMaximo: number;
  filas: number;
  butacasPorFila: number;
  color: string;
  forma: string;
  puertaAcceso: string | null;
  butacasGeneradas: number;
  entradasEmitidas: number;
}

export interface Playa {
  id: number;
  salaId: number;
  nombre: string;
  capacidadTotal: number;
  usoExclusivo: boolean;
  habilitada: boolean;
}

export interface SalaDetalle {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string;
  capacidad: number;
  ancho: number;
  alto: number;
  escenario: Escenario | null;
  escenarios: Escenario[];
  sectores: SectorSala[];
  playas: Playa[];
}

export interface SalaListado {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string;
  capacidad: number;
  _count: { sectores: number; playas: number; funciones: number };
}

// ─── Control de acceso ──────────────────────────────────────────────────────

export interface ResultadoValidacion {
  resultado: 'APROBADO' | 'RECHAZADO';
  confirmado: boolean;
  codigo: string;
  tipo: 'ENTRADA' | 'PASE' | 'VOUCHER' | null;
  punto: PuntoControl;
  motivo: string | null;
  estadoCodigo: string;
  titular: { nombre: string; dni: string | null } | null;
  sector: string | null;
  ubicacion: string | null;
  puertaAcceso: string | null;
  patente: string | null;
  playa: string | null;
  items: { nombre: string; cantidad: number }[];
  pin: string | null;
  revocacion: { motivo: string; fecha: string } | null;
  usadoEn: string | null;
  latenciaMs: number;
  offline: boolean;
}

export interface RegistroValidacion {
  id: number;
  funcionId: number | null;
  punto: PuntoControl;
  codigo: string;
  tipo: string | null;
  resultado: 'APROBADO' | 'RECHAZADO';
  motivo: string | null;
  titular: string | null;
  ubicacion: string | null;
  latenciaMs: number;
  offline: boolean;
  fechaHora: string;
}

export interface ResumenControl {
  funcion: { id: number; codigo: string; fechaHora: string; evento: string; sala: string };
  puerta: { ingresados: number; vendidas: number };
  estacionamiento: { ocupados: number; vendidos: number; cupo: number; playas: string[] };
  barra: { canjeados: number; emitidos: number };
  turno: { lecturas: number; aprobados: number; rechazados: number; latenciaPromedioMs: number };
  recientes: RegistroValidacion[];
}

export interface Padron {
  funcionId: number;
  generadoEn: string;
  codigos: { codigo: string; tipo: 'ENTRADA' | 'PASE' | 'VOUCHER'; estado: EstadoEntrada; titular: string; dni: string | null; patente?: string; detalle: string }[];
  revocados: { codigo: string; tipo: string; motivo: string; fecha: string }[];
}
