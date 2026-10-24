// Datos de demostración, tomados de las pantallas de Stitch (Estadio Luna Central, Cosquín Rock,
// Lucas Benítez con la orden #TFR-89421, etc.). Las fechas son relativas al día en que se corre
// el seed, así la demo siempre tiene funciones futuras: una a menos de 48 h (no reembolsable)
// y otras con semanas de margen para probar reservas, reembolsos y transferencias.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CUENTAS_DEMO } from '../src/domain/demo';
import { matrizButacas } from '../src/domain/salas';
import { nuevoCodigoEntrada, nuevoCodigoPase, nuevoCodigoVoucher, nuevoPin } from '../src/lib/codigos';

const prisma = new PrismaClient();

/** Fecha y hora de Buenos Aires (UTC-3). */
const ar = (iso: string) => new Date(`${iso}:00-03:00`);
const haceDias = (dias: number, horas = 0) => new Date(Date.now() - dias * 86_400_000 - horas * 3_600_000);
/** Dentro de `dias` días (negativo = en el pasado) a la hora indicada, en Buenos Aires. */
const enDias = (dias: number, hora: string) => {
  const dia = new Date(Date.now() + dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  return ar(`${dia}T${hora}`);
};

// PRNG determinístico para que el seed genere siempre los mismos datos
let semilla = 20261023;
const azar = () => {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));

const usados = new Set<string>();
const unico = (generar: () => string) => {
  let c = generar();
  while (usados.has(c)) c = generar();
  usados.add(c);
  return c;
};
let nroCompra = 50000;
const codigoCompra = () => `TFR-${nroCompra++}`;

async function limpiar() {
  // Orden inverso a las dependencias
  await prisma.notificacion.deleteMany();
  await prisma.validacionAcceso.deleteMany();
  await prisma.codigoRevocado.deleteMany();
  await prisma.transferenciaEntrada.deleteMany();
  await prisma.itemConsumicion.deleteMany();
  await prisma.voucherConsumicion.deleteMany();
  await prisma.paseEstacionamiento.deleteMany();
  await prisma.entrada.deleteMany();
  await prisma.reembolso.deleteMany();
  await prisma.compra.deleteMany();
  await prisma.productoConsumicion.deleteMany();
  await prisma.descuento.deleteMany();
  await prisma.tarifa.deleteMany();
  await prisma.tarifaEstacionamiento.deleteMany();
  await prisma.funcion.deleteMany();
  await prisma.evento.deleteMany();
  await prisma.butaca.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.escenario.deleteMany();
  await prisma.playaEstacionamiento.deleteMany();
  await prisma.sala.deleteMany();
  await prisma.registroListaNegra.deleteMany();
  await prisma.usuario.deleteMany();
}

type SectorSeed = {
  codigo: string;
  nombre: string;
  numerado: boolean;
  cupo?: number;
  filas?: number;
  porFila?: number;
  color: string;
  forma?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  puerta: string;
};

async function crearSala(datos: {
  codigo: string;
  nombre: string;
  direccion: string;
  capacidad: number;
  escenarios: { nombre: string; esBase: boolean; x: number; y: number; w: number; h: number }[];
  sectores: SectorSeed[];
  playas: { nombre: string; capacidad: number; exclusiva?: boolean }[];
}) {
  const sala = await prisma.sala.create({
    data: { codigo: datos.codigo, nombre: datos.nombre, direccion: datos.direccion, capacidad: datos.capacidad },
  });
  const escenarios = [];
  for (const e of datos.escenarios) {
    escenarios.push(
      await prisma.escenario.create({ data: { salaId: sala.id, nombre: e.nombre, esBase: e.esBase, posX: e.x, posY: e.y, ancho: e.w, alto: e.h } }),
    );
  }
  const sectores: Record<string, { id: number; butacas: { id: number; fila: string; numero: number }[] }> = {};
  for (const s of datos.sectores) {
    const filas = s.numerado ? s.filas! : 0;
    const porFila = s.numerado ? s.porFila! : 0;
    const sector = await prisma.sector.create({
      data: {
        salaId: sala.id,
        codigo: s.codigo,
        nombre: s.nombre,
        numerado: s.numerado,
        cupoMaximo: s.numerado ? filas * porFila : s.cupo!,
        filas,
        butacasPorFila: porFila,
        color: s.color,
        forma: s.forma ?? 'RECT',
        posX: s.x,
        posY: s.y,
        ancho: s.w,
        alto: s.h,
        puertaAcceso: s.puerta,
      },
    });
    if (s.numerado) await prisma.butaca.createMany({ data: matrizButacas(sector.id, filas, porFila) });
    const butacas = await prisma.butaca.findMany({ where: { sectorId: sector.id }, orderBy: [{ fila: 'asc' }, { numero: 'asc' }] });
    sectores[s.codigo] = { id: sector.id, butacas };
  }
  const playas: Record<string, number> = {};
  for (const p of datos.playas) {
    const playa = await prisma.playaEstacionamiento.create({
      data: { salaId: sala.id, nombre: p.nombre, capacidadTotal: p.capacidad, usoExclusivo: !!p.exclusiva },
    });
    playas[p.nombre] = playa.id;
  }
  return { sala, escenarios, sectores, playas };
}

async function main() {
  await limpiar();
  const hash = (p: string) => bcrypt.hash(p, 10);

  // ─── Usuarios ──────────────────────────────────────────────────────────────
  const admin = await prisma.usuario.create({
    data: { email: CUENTAS_DEMO.ADMINISTRADOR.email, passwordHash: await hash(CUENTAS_DEMO.ADMINISTRADOR.password), rol: 'ADMINISTRADOR', nombre: 'Ana Díaz' },
  });
  const organizador = await prisma.usuario.create({
    data: {
      email: CUENTAS_DEMO.ORGANIZADOR.email,
      passwordHash: await hash(CUENTAS_DEMO.ORGANIZADOR.password),
      rol: 'ORGANIZADOR',
      nombre: 'Olivia García',
      productora: 'En Vivo Producciones',
    },
  });
  await prisma.usuario.create({
    data: {
      email: CUENTAS_DEMO.CONTROLADOR.email,
      passwordHash: await hash(CUENTAS_DEMO.CONTROLADOR.password),
      rol: 'CONTROLADOR',
      nombre: 'Carla Torres',
      puntoAcceso: 'Molinete 3 - Acceso Norte VIP',
    },
  });
  const passComprador = await hash(CUENTAS_DEMO.COMPRADOR.password);
  const comprador = (email: string, nombre: string, dni: string) =>
    prisma.usuario.create({ data: { email, passwordHash: passComprador, rol: 'COMPRADOR', nombre, dni } });
  const lucas = await comprador(CUENTAS_DEMO.COMPRADOR.email, 'Lucas Benítez', '38452190');
  const mariana = await comprador('mariana.rojas@email.com', 'Mariana Rojas', '41982554');
  const pedro = await comprador('pedro.sanchez@email.com', 'Pedro Sánchez', '33444555');
  const javier = await comprador('bloqueado@ticketfr.com', 'Javier Ruiz', '27111222');
  const otros = [];
  const nombres = ['Sofía', 'Mateo', 'Valentina', 'Benjamín', 'Martina', 'Thiago', 'Camila', 'Joaquín', 'Emma', 'Felipe', 'Lucía', 'Bautista', 'Julieta', 'Tomás', 'Catalina', 'Santino', 'Abril', 'Lautaro', 'Delfina', 'Ignacio'];
  const apellidos = ['Fernández', 'López', 'Martínez', 'Pérez', 'Romero', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Acosta', 'Medina', 'Herrera'];
  for (let i = 0; i < 48; i++) {
    const nombre = `${nombres[i % nombres.length]} ${apellidos[(i * 7) % apellidos.length]}`;
    otros.push(await comprador(`comprador${i + 1}@email.com`, nombre, String(30000000 + i * 104729)));
  }

  await prisma.registroListaNegra.create({
    data: { dni: javier.dni!, nombre: javier.nombre, motivo: 'Incidentes de violencia en evento anterior (derecho de admisión)', fechaAlta: haceDias(3) },
  });
  await prisma.registroListaNegra.create({
    data: { dni: '25987123', nombre: 'Diego Paz', motivo: 'Reventa no autorizada de entradas', fechaAlta: haceDias(20) },
  });

  // ─── Salas ─────────────────────────────────────────────────────────────────
  const luna = await crearSala({
    codigo: 'VEN-042',
    nombre: 'Estadio Luna Central',
    direccion: 'Av. Madero 420, Puerto Madero, CABA',
    capacidad: 15000,
    escenarios: [
      { nombre: 'Escenario Principal (18m x 10m)', esBase: true, x: 180, y: 24, w: 500, h: 105 },
      { nombre: 'Escenario v2 — Pasarela central', esBase: false, x: 230, y: 24, w: 400, h: 120 },
    ],
    sectores: [
      { codigo: 'SEC-VIP-01', nombre: 'Platea VIP Preferencial', numerado: true, filas: 2, porFila: 9, color: 'indigo', x: 170, y: 160, w: 520, h: 130, puerta: 'Molinete 3 - Acceso Norte VIP' },
      { codigo: 'SEC-PLO-01', nombre: 'Pullman Lateral Oeste', numerado: true, filas: 6, porFila: 10, color: 'amber', x: 24, y: 312, w: 150, h: 200, puerta: 'Molinete 1 - Acceso Oeste' },
      { codigo: 'SEC-CMP-01', nombre: 'Campo General de Pie', numerado: false, cupo: 6500, color: 'emerald', x: 190, y: 312, w: 480, h: 200, puerta: 'Molinete 2 - Acceso Central' },
      { codigo: 'SEC-PLE-01', nombre: 'Pullman Lateral Este', numerado: true, filas: 6, porFila: 10, color: 'amber', x: 686, y: 312, w: 150, h: 200, puerta: 'Molinete 5 - Acceso Este' },
      { codigo: 'SEC-PAT-01', nombre: 'Pullman Alto Trasero', numerado: true, filas: 5, porFila: 24, color: 'purple', forma: 'TRAPECIO', x: 24, y: 530, w: 812, h: 90, puerta: 'Molinete 4 - Acceso Sur' },
    ],
    playas: [
      { nombre: 'Playa Norte (Acceso Rampa A)', capacidad: 350 },
      { nombre: 'Playa Este - Subsuelo', capacidad: 180 },
      { nombre: 'Playa VIP / Prensa', capacidad: 70, exclusiva: true },
    ],
  });

  const arena = await crearSala({
    codigo: 'VEN-043',
    nombre: 'Arena Metropolitana',
    direccion: 'Av. Corrientes 1500, CABA',
    capacidad: 4500,
    escenarios: [{ nombre: 'Escenario Teatral', esBase: true, x: 230, y: 30, w: 400, h: 90 }],
    sectores: [
      { codigo: 'SEC-PAL-01', nombre: 'Palcos Laterales', numerado: true, filas: 2, porFila: 6, color: 'purple', x: 24, y: 150, w: 110, h: 170, puerta: 'Puerta 1 - Palcos' },
      { codigo: 'SEC-PBJ-01', nombre: 'Platea Baja', numerado: true, filas: 8, porFila: 16, color: 'cyan', x: 150, y: 150, w: 560, h: 170, puerta: 'Puerta 2 - Platea' },
      { codigo: 'SEC-PAL-02', nombre: 'Platea Alta', numerado: true, filas: 6, porFila: 20, color: 'indigo', forma: 'TRAPECIO', x: 90, y: 345, w: 680, h: 130, puerta: 'Puerta 3 - Pullman' },
    ],
    playas: [{ nombre: 'Playa Corrientes', capacidad: 120 }],
  });

  await crearSala({
    codigo: 'VEN-044',
    nombre: 'Hipódromo San Isidro',
    direccion: 'Av. Márquez 504, San Isidro, Prov. Bs. As.',
    capacidad: 30000,
    escenarios: [{ nombre: 'Escenario Festival', esBase: true, x: 130, y: 24, w: 600, h: 110 }],
    sectores: [
      { codigo: 'SEC-VIP-01', nombre: 'Tribuna VIP', numerado: true, filas: 4, porFila: 20, color: 'indigo', x: 130, y: 160, w: 600, h: 120, puerta: 'Acceso VIP' },
      { codigo: 'SEC-CMP-01', nombre: 'Campo General', numerado: false, cupo: 20000, color: 'emerald', x: 60, y: 300, w: 740, h: 300, puerta: 'Accesos 1 a 6' },
    ],
    playas: [{ nombre: 'Estacionamiento Tribunas', capacidad: 800 }],
  });

  // ─── Eventos y funciones ──────────────────────────────────────────────────
  const S = luna.sectores;
  const A = arena.sectores;

  const cosquin = await prisma.evento.create({
    data: {
      organizadorId: organizador.id,
      nombre: 'Cosquín Rock 2026 - Gira Nacional',
      categoria: 'RECITAL',
      descripcion: 'Gira Cono Sur 2026 · Edición 26° aniversario. Música / Festival.',
    },
  });
  const f1 = await prisma.funcion.create({
    data: {
      codigo: 'FUN-CQ26-BUE-01',
      eventoId: cosquin.id,
      salaId: luna.sala.id,
      escenarioId: luna.escenarios[0].id,
      fechaHora: enDias(28, '21:00'),
      estado: 'PUBLICADA',
      exigePatente: true,
      aperturaPlaya: '18:00',
    },
  });
  const f2 = await prisma.funcion.create({
    data: {
      codigo: 'FUN-CQ26-BUE-02',
      eventoId: cosquin.id,
      salaId: luna.sala.id,
      escenarioId: luna.escenarios[1].id,
      fechaHora: enDias(29, '20:00'),
      estado: 'BORRADOR',
      aperturaPlaya: '17:00',
    },
  });

  const standup = await prisma.evento.create({
    data: { organizadorId: organizador.id, nombre: 'Stand-Up en el Puerto', categoria: 'OTRO', descripcion: 'Noche de humor con cinco comediantes.' },
  });
  const f3 = await prisma.funcion.create({
    data: {
      codigo: 'FUN-STUP26-01',
      eventoId: standup.id,
      salaId: arena.sala.id,
      escenarioId: arena.escenarios[0].id,
      fechaHora: enDias(1, '21:30'),
      estado: 'PUBLICADA',
      aperturaPlaya: '20:00',
    },
  });

  const sinfonica = await prisma.evento.create({
    data: {
      organizadorId: organizador.id,
      nombre: 'Orquesta Sinfónica: Noche de Bandas Sonoras',
      categoria: 'TEATRO',
      descripcion: 'Las bandas sonoras más famosas del cine, en vivo.',
    },
  });
  const f4 = await prisma.funcion.create({
    data: {
      codigo: 'FUN-SINF26-01',
      eventoId: sinfonica.id,
      salaId: arena.sala.id,
      escenarioId: arena.escenarios[0].id,
      fechaHora: enDias(49, '20:00'),
      estado: 'PUBLICADA',
      aperturaPlaya: '18:30',
    },
  });

  const basquet = await prisma.evento.create({
    data: { organizadorId: organizador.id, nombre: 'Final Liga Metropolitana de Básquet', categoria: 'DEPORTE', descripcion: 'Partido definitorio del campeonato.' },
  });
  const f5 = await prisma.funcion.create({
    data: {
      codigo: 'FUN-LIGA26-01',
      eventoId: basquet.id,
      salaId: luna.sala.id,
      escenarioId: luna.escenarios[0].id,
      fechaHora: enDias(14, '19:00'),
      estado: 'PUBLICADA',
      aperturaPlaya: '17:00',
    },
  });

  const tarifa = async (funcionId: number, sectorId: number, precio: number, descuento?: { porcentaje: number; desde: Date; hasta: Date; descripcion: string }) => {
    const t = await prisma.tarifa.create({ data: { funcionId, sectorId, precio } });
    if (descuento) {
      await prisma.descuento.create({
        data: { tarifaId: t.id, porcentaje: descuento.porcentaje, vigenciaDesde: descuento.desde, vigenciaHasta: descuento.hasta, descripcion: descuento.descripcion },
      });
    }
    return t;
  };

  // Cosquín (función 1): mismos precios de la pantalla del organizador
  await tarifa(f1.id, S['SEC-VIP-01'].id, 45000, { porcentaje: 10, desde: enDias(-22, '00:00'), hasta: enDias(8, '23:59'), descripcion: 'Preventa 1' });
  await tarifa(f1.id, S['SEC-PLO-01'].id, 30000);
  await tarifa(f1.id, S['SEC-CMP-01'].id, 28000, { porcentaje: 15, desde: enDias(-38, '00:00'), hasta: enDias(-13, '23:59'), descripcion: 'Preventa 1 (agotada)' });
  await tarifa(f1.id, S['SEC-PLE-01'].id, 30000);
  await tarifa(f1.id, S['SEC-PAT-01'].id, 34000);
  // Cosquín (función 2, borrador): faltan precios a propósito para mostrar la validación al publicar
  await tarifa(f2.id, S['SEC-VIP-01'].id, 45000);
  await tarifa(f2.id, S['SEC-CMP-01'].id, 28000);
  // Básquet
  await tarifa(f5.id, S['SEC-VIP-01'].id, 30000);
  await tarifa(f5.id, S['SEC-PLO-01'].id, 18000);
  await tarifa(f5.id, S['SEC-CMP-01'].id, 12000);
  await tarifa(f5.id, S['SEC-PLE-01'].id, 18000);
  await tarifa(f5.id, S['SEC-PAT-01'].id, 15000);
  // Stand-up y Sinfónica (Arena Metropolitana)
  await tarifa(f3.id, A['SEC-PAL-01'].id, 25000);
  await tarifa(f3.id, A['SEC-PBJ-01'].id, 18000);
  await tarifa(f3.id, A['SEC-PAL-02'].id, 14000);
  await tarifa(f4.id, A['SEC-PAL-01'].id, 38000);
  await tarifa(f4.id, A['SEC-PBJ-01'].id, 26000, { porcentaje: 20, desde: enDias(-22, '00:00'), hasta: enDias(23, '23:59'), descripcion: 'Early bird' });
  await tarifa(f4.id, A['SEC-PAL-02'].id, 19000);

  const playaNorte = await prisma.tarifaEstacionamiento.create({ data: { funcionId: f1.id, playaId: luna.playas['Playa Norte (Acceso Rampa A)'], precio: 8500, cupoHabilitado: 250 } });
  const playaEste = await prisma.tarifaEstacionamiento.create({ data: { funcionId: f1.id, playaId: luna.playas['Playa Este - Subsuelo'], precio: 7000, cupoHabilitado: 150 } });
  await prisma.tarifaEstacionamiento.create({ data: { funcionId: f5.id, playaId: luna.playas['Playa Norte (Acceso Rampa A)'], precio: 6000, cupoHabilitado: 300 } });
  const playaArena = await prisma.tarifaEstacionamiento.create({ data: { funcionId: f3.id, playaId: arena.playas['Playa Corrientes'], precio: 5000, cupoHabilitado: 80 } });
  await prisma.tarifaEstacionamiento.create({ data: { funcionId: f4.id, playaId: arena.playas['Playa Corrientes'], precio: 5500, cupoHabilitado: 100 } });

  const burger = await prisma.productoConsumicion.create({
    data: { eventoId: cosquin.id, nombre: 'Doble Burger + Cerveza 500cc', descripcion: 'Combo Doble Burger + Cerveza Artesanal 500cc', precioPreventa: 9500, precioLista: 11200, stockDisponible: 450 },
  });
  const hidratacion = await prisma.productoConsumicion.create({
    data: { eventoId: cosquin.id, nombre: 'Combo Hidratación (2x 500cc)', descripcion: 'Agua / Gaseosa', precioPreventa: 4800, precioLista: 6000, stockDisponible: 800 },
  });
  const ecovaso = await prisma.productoConsumicion.create({
    data: { eventoId: cosquin.id, nombre: 'Ecovaso Cosquín + IPA', descripcion: 'Coleccionable · Edición oficial', precioPreventa: 6200, stockDisponible: 60 },
  });
  await prisma.productoConsumicion.create({
    data: { eventoId: sinfonica.id, nombre: 'Copa de vino + tabla de quesos', descripcion: 'Servicio en el foyer durante el intervalo', precioPreventa: 8000, precioLista: 9500, stockDisponible: 150 },
  });
  await prisma.productoConsumicion.create({
    data: { eventoId: standup.id, nombre: 'Pinta de cerveza + papas', descripcion: 'Retiro en la barra del hall', precioPreventa: 6500, precioLista: 7800, stockDisponible: 200 },
  });

  // ─── Compras ──────────────────────────────────────────────────────────────
  const butacasUsadas = new Set<number>();
  const ocupar = (butacas: { id: number; fila: string; numero: number }[], cuantas: number) => {
    const libres = butacas.filter((b) => !butacasUsadas.has(b.id));
    const inicio = entre(0, Math.max(0, libres.length - cuantas));
    const elegidas = libres.slice(inicio, inicio + cuantas);
    elegidas.forEach((b) => butacasUsadas.add(b.id));
    return elegidas;
  };
  const butaca = (codigoSector: string, etiqueta: string) => {
    const b = S[codigoSector].butacas.find((x) => `${x.fila}${x.numero}` === etiqueta)!;
    butacasUsadas.add(b.id);
    return b;
  };

  type PedidoCompra = {
    comprador: { id: number };
    funcionId: number;
    fecha: Date;
    codigo?: string;
    entradas: { sectorId: number; butaca?: { id: number; fila: string; numero: number }; precio: number; codigo?: string }[];
    pases?: { tarifaId: number; patente: string; precio: number; codigo?: string }[];
    voucher?: { items: { productoId: number; cantidad: number; precio: number }[]; codigo?: string; pin?: string };
  };

  const crearCompra = async (p: PedidoCompra) => {
    const compra = await prisma.compra.create({
      data: {
        codigo: p.codigo ?? codigoCompra(),
        compradorId: p.comprador.id,
        funcionId: p.funcionId,
        fecha: p.fecha,
        fechaExpiracionReserva: new Date(p.fecha.getTime() + 10 * 60_000),
        estado: 'PAGADA',
        idTransaccionPago: `PAY-${(p.fecha.getTime() / 1000).toString(36).toUpperCase()}`,
        fechaPago: new Date(p.fecha.getTime() + 90_000),
      },
    });
    const entradas = [];
    for (const e of p.entradas) {
      entradas.push(
        await prisma.entrada.create({
          data: {
            compraId: compra.id,
            funcionId: p.funcionId,
            sectorId: e.sectorId,
            butacaId: e.butaca?.id,
            titularId: p.comprador.id,
            precio: e.precio,
            codigoQR: e.codigo ?? unico(() => nuevoCodigoEntrada(e.butaca ? `${e.butaca.fila}${e.butaca.numero}` : 'GEN')),
          },
        }),
      );
    }
    for (const pase of p.pases ?? []) {
      await prisma.paseEstacionamiento.create({
        data: { compraId: compra.id, tarifaId: pase.tarifaId, patente: pase.patente, precio: pase.precio, codigoQR: pase.codigo ?? unico(nuevoCodigoPase) },
      });
    }
    if (p.voucher) {
      await prisma.voucherConsumicion.create({
        data: {
          compraId: compra.id,
          codigoQR: p.voucher.codigo ?? unico(nuevoCodigoVoucher),
          pin: p.voucher.pin ?? nuevoPin(),
          items: { create: p.voucher.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad, precioUnitario: i.precio })) },
        },
      });
      for (const i of p.voucher.items) {
        await prisma.productoConsumicion.update({ where: { id: i.productoId }, data: { stockDisponible: { decrement: i.cantidad } } });
      }
    }
    return { compra, entradas };
  };

  // Lucas Benítez: la orden #TFR-89421 de la pantalla "Mis Compras" ($ 63.000)
  usados.add('ENT-99210-A5').add('PRK-48190-N').add('VCH-3918-B');
  await crearCompra({
    comprador: lucas,
    funcionId: f1.id,
    codigo: 'TFR-89421',
    fecha: haceDias(11, 3),
    entradas: [{ sectorId: S['SEC-VIP-01'].id, butaca: butaca('SEC-VIP-01', 'A5'), precio: 45000, codigo: 'ENT-99210-A5' }],
    pases: [{ tarifaId: playaNorte.id, patente: 'AB123CD', precio: 8500, codigo: 'PRK-48190-N' }],
    voucher: { items: [{ productoId: burger.id, cantidad: 1, precio: 9500 }], codigo: 'VCH-3918-B', pin: '7741' },
  });
  // Lucas: función de mañana (no reembolsable: faltan menos de 48 h)
  const pbj = A['SEC-PBJ-01'].butacas;
  await crearCompra({
    comprador: lucas,
    funcionId: f3.id,
    fecha: haceDias(8),
    entradas: [
      { sectorId: A['SEC-PBJ-01'].id, butaca: pbj.find((b) => b.fila === 'D' && b.numero === 7)!, precio: 18000 },
      { sectorId: A['SEC-PBJ-01'].id, butaca: pbj.find((b) => b.fila === 'D' && b.numero === 8)!, precio: 18000 },
    ],
    pases: [{ tarifaId: playaArena.id, patente: 'AB123CD', precio: 5000 }],
  });

  // Pedro Sánchez compró 2 de campo y le transfirió una a Mariana Rojas (QR anterior revocado)
  const dePedro = await crearCompra({
    comprador: pedro,
    funcionId: f1.id,
    fecha: haceDias(9),
    entradas: [
      { sectorId: S['SEC-CMP-01'].id, precio: 23800 },
      { sectorId: S['SEC-CMP-01'].id, precio: 23800 },
    ],
  });
  const transferida = dePedro.entradas[1];
  usados.add('ENT-88412-C9');
  await prisma.codigoRevocado.create({ data: { codigo: 'ENT-88412-C9', tipo: 'ENTRADA', motivo: 'TRANSFERENCIA', referenciaId: transferida.id, fecha: haceDias(5) } });
  await prisma.entrada.update({ where: { id: transferida.id }, data: { titularId: mariana.id } });
  await prisma.transferenciaEntrada.create({
    data: { entradaId: transferida.id, cedenteId: pedro.id, destinatarioId: mariana.id, estado: 'ACEPTADA', fechaHora: haceDias(5, 2), fechaRespuesta: haceDias(5) },
  });

  // Mariana Rojas compró 2 de campo y le está transfiriendo una a Lucas (pendiente de aceptar)
  const deMariana = await crearCompra({
    comprador: mariana,
    funcionId: f1.id,
    fecha: haceDias(6),
    entradas: [
      { sectorId: S['SEC-CMP-01'].id, precio: 28000 },
      { sectorId: S['SEC-CMP-01'].id, precio: 28000 },
    ],
    voucher: { items: [{ productoId: hidratacion.id, cantidad: 2, precio: 4800 }] },
  });
  await prisma.transferenciaEntrada.create({
    data: { entradaId: deMariana.entradas[1].id, cedenteId: mariana.id, destinatarioId: lucas.id, fechaHora: haceDias(0, 5) },
  });

  // Javier Ruiz compró antes de entrar en la lista negra: su QR será rechazado en la puerta
  await crearCompra({
    comprador: javier,
    funcionId: f1.id,
    fecha: haceDias(10),
    entradas: [{ sectorId: S['SEC-VIP-01'].id, butaca: butaca('SEC-VIP-01', 'B6'), precio: 45000 }],
  });

  // Butacas VIP ocupadas como en el mapa de Stitch (A3, A4, B7)
  await crearCompra({
    comprador: otros[0],
    funcionId: f1.id,
    fecha: haceDias(12),
    entradas: [
      { sectorId: S['SEC-VIP-01'].id, butaca: butaca('SEC-VIP-01', 'A3'), precio: 45000 },
      { sectorId: S['SEC-VIP-01'].id, butaca: butaca('SEC-VIP-01', 'A4'), precio: 45000 },
    ],
    pases: [{ tarifaId: playaNorte.id, patente: 'AC456FG', precio: 8500 }],
  });
  await crearCompra({
    comprador: otros[1],
    funcionId: f1.id,
    fecha: haceDias(4),
    entradas: [{ sectorId: S['SEC-VIP-01'].id, butaca: butaca('SEC-VIP-01', 'B7'), precio: 40500 }],
  });

  // Volumen de ventas para las métricas del organizador
  const letras = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const patenteAzar = () =>
    `${letras[entre(0, 22)]}${letras[entre(0, 22)]}${entre(100, 999)}${letras[entre(0, 22)]}${letras[entre(0, 22)]}`;
  for (const [i, c] of otros.slice(2).entries()) {
    const fecha = i < 6 ? haceDias(0, entre(1, 20)) : haceDias(entre(1, 25), entre(0, 23));
    const entradas: PedidoCompra['entradas'] = [];
    const tipo = azar();
    if (tipo < 0.55) {
      const precio = fecha < enDias(-13, '23:59') ? 23800 : 28000;
      for (let k = 0; k < entre(1, 4); k++) entradas.push({ sectorId: S['SEC-CMP-01'].id, precio });
    } else if (tipo < 0.8) {
      for (const b of ocupar(S['SEC-PAT-01'].butacas, entre(1, 4))) entradas.push({ sectorId: S['SEC-PAT-01'].id, butaca: b, precio: 34000 });
    } else {
      const codigo = azar() < 0.5 ? 'SEC-PLO-01' : 'SEC-PLE-01';
      for (const b of ocupar(S[codigo].butacas, entre(1, 3))) entradas.push({ sectorId: S[codigo].id, butaca: b, precio: 30000 });
    }
    const pases = azar() < 0.4 ? [{ tarifaId: azar() < 0.7 ? playaNorte.id : playaEste.id, patente: patenteAzar(), precio: 0 }] : [];
    for (const p of pases) p.precio = p.tarifaId === playaNorte.id ? 8500 : 7000;
    const voucher =
      azar() < 0.4
        ? {
            items: [
              { productoId: burger.id, cantidad: entre(1, 2), precio: 9500 },
              ...(azar() < 0.4 ? [{ productoId: hidratacion.id, cantidad: 1, precio: 4800 }] : []),
              ...(azar() < 0.2 ? [{ productoId: ecovaso.id, cantidad: 1, precio: 6200 }] : []),
            ],
          }
        : undefined;
    await crearCompra({ comprador: c, funcionId: f1.id, fecha, entradas, pases, voucher });
  }

  // Algunas ventas para las otras funciones
  for (const c of otros.slice(10, 22)) {
    await crearCompra({
      comprador: c,
      funcionId: f3.id,
      fecha: haceDias(entre(1, 15)),
      entradas: ocupar(A['SEC-PAL-02'].butacas, entre(1, 3)).map((b) => ({ sectorId: A['SEC-PAL-02'].id, butaca: b, precio: 14000 })),
    });
  }
  for (const c of otros.slice(22, 30)) {
    await crearCompra({
      comprador: c,
      funcionId: f4.id,
      fecha: haceDias(entre(1, 15)),
      entradas: ocupar(A['SEC-PBJ-01'].butacas, entre(1, 2)).map((b) => ({ sectorId: A['SEC-PBJ-01'].id, butaca: b, precio: 20800 })),
    });
  }
  for (const c of otros.slice(30, 40)) {
    await crearCompra({
      comprador: c,
      funcionId: f5.id,
      fecha: haceDias(entre(1, 15)),
      entradas: Array.from({ length: entre(1, 3) }, () => ({ sectorId: S['SEC-CMP-01'].id, precio: 12000 })),
    });
  }

  // ─── Notificaciones (servicio de mailing simulado) ────────────────────────
  await prisma.notificacion.createMany({
    data: [
      { para: lucas.email, asunto: 'Tus entradas para Cosquín Rock 2026 - Gira Nacional', cuerpo: 'Compra TFR-89421 confirmada. Incluye 1 entrada, 1 pase de estacionamiento y 1 voucher de consumición.', fecha: haceDias(11, 3) },
      { para: lucas.email, asunto: 'Te transfirieron una entrada', cuerpo: 'Mariana Rojas quiere transferirte una entrada para Cosquín Rock 2026 - Gira Nacional (Campo General de Pie). Aceptala o rechazala desde "Mis Compras".', fecha: haceDias(0, 5) },
    ],
  });

  const totales = await Promise.all([prisma.compra.count(), prisma.entrada.count(), prisma.usuario.count()]);
  console.log(`Seed OK: ${totales[0]} compras, ${totales[1]} entradas, ${totales[2]} usuarios (admin: ${admin.email}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
