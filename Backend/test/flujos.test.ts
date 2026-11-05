// Pruebas de integración de los flujos del Caso Integrador contra la API real.
// Usan una base SQLite propia (prisma/test.db) que se recrea con el seed en cada corrida.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = 'file:./test.db';
process.env.PASARELA_WEBHOOK_SEGUNDOS = '1';
process.env.DEMO_MODE = 'true';
process.env.JWT_SECRET ??= 'secreto-jwt-de-prueba';
process.env.QR_SECRET ??= 'secreto-qr-de-prueba';
execSync('npx prisma migrate reset --force --skip-generate', { stdio: 'ignore', env: process.env });

const { crearApp } = await import('../src/app');
const { prisma } = await import('../src/db');
const { procesarVencimientos } = await import('../src/domain/compras');

let base = '';
const server = crearApp().listen(0);
before(() => {
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(async () => {
  server.close();
  await prisma.$disconnect();
});

type Respuesta = { status: number; data: any };
async function api(method: string, path: string, opciones: { token?: string; body?: unknown } = {}): Promise<Respuesta> {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });
  const texto = await res.text();
  return { status: res.status, data: texto && res.headers.get('content-type')?.includes('json') ? JSON.parse(texto) : texto };
}
const login = async (email: string, password = 'comprador123') => {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token as string;
};

const funcionCosquin = () => prisma.funcion.findUniqueOrThrow({ where: { codigo: 'FUN-CQ26-BUE-01' } });
const sector = (funcionSalaId: number, codigo: string) => prisma.sector.findFirstOrThrow({ where: { salaId: funcionSalaId, codigo } });
/** butaca(sectorId, 'A3') */
const butaca = async (sectorId: number, etiqueta: string) => {
  const [, fila, numero] = /^([A-Z]+)(\d+)$/.exec(etiqueta)!;
  return prisma.butaca.findFirstOrThrow({ where: { sectorId, fila, numero: Number(numero) } });
};

test('cartelera: solo funciones publicadas y futuras, con precio desde', async () => {
  const r = await api('GET', '/eventos');
  assert.equal(r.status, 200);
  const codigos = r.data.map((f: any) => f.codigo);
  assert.ok(codigos.includes('FUN-CQ26-BUE-01'));
  assert.ok(!codigos.includes('FUN-CQ26-BUE-02'), 'la función en borrador no se publica');
  const cosquin = r.data.find((f: any) => f.codigo === 'FUN-CQ26-BUE-01');
  assert.equal(cosquin.precioDesde, 28000);
  const busqueda = await api('GET', '/eventos?q=cosquin');
  assert.equal(busqueda.data.length, 1, 'la búsqueda ignora tildes y mayúsculas');
});

test('mapa: las butacas vendidas figuran ocupadas', async () => {
  const f = await funcionCosquin();
  const r = await api('GET', `/funciones/${f.id}`);
  const vip = r.data.sectores.find((s: any) => s.codigo === 'SEC-VIP-01');
  const ocupadas = vip.butacas.filter((b: any) => b.ocupada).map((b: any) => `${b.fila}${b.numero}`);
  assert.deepEqual(ocupadas.sort(), ['A3', 'A4', 'A5', 'B6', 'B7']);
  assert.equal(vip.precio, 40500, 'aplica el 10% de descuento vigente');
});

test('reserva: butaca ocupada → 409; libre → reserva de 10 minutos', async () => {
  const token = await login('comprador2@email.com');
  const f = await funcionCosquin();
  const vip = await sector(f.salaId, 'SEC-VIP-01');
  const ocupada = await api('POST', '/compras/reserva/entradas', {
    token,
    body: { funcionId: f.id, sectorId: vip.id, butacaId: (await butaca(vip.id, 'A3')).id },
  });
  assert.equal(ocupada.status, 409);
  assert.equal(ocupada.data.code, 'BUTACA_OCUPADA');

  const libre = await api('POST', '/compras/reserva/entradas', {
    token,
    body: { funcionId: f.id, sectorId: vip.id, butacaId: (await butaca(vip.id, 'A1')).id },
  });
  assert.equal(libre.status, 201);
  assert.equal(libre.data.estado, 'RESERVADA');
  const minutos = (new Date(libre.data.fechaExpiracionReserva).getTime() - Date.now()) / 60_000;
  assert.ok(minutos > 9 && minutos <= 10, `vence en ~10 min (${minutos})`);
});

test('tope de 6 entradas por comprador y función (cuenta las ya compradas)', async () => {
  const token = await login('comprador@ticketfr.com'); // Lucas ya tiene 1 entrada (A5)
  const f = await funcionCosquin();
  const campo = await sector(f.salaId, 'SEC-CMP-01');
  for (let i = 0; i < 5; i++) {
    const r = await api('POST', '/compras/reserva/entradas', { token, body: { funcionId: f.id, sectorId: campo.id } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  const septima = await api('POST', '/compras/reserva/entradas', { token, body: { funcionId: f.id, sectorId: campo.id } });
  assert.equal(septima.status, 409);
  assert.equal(septima.data.code, 'TOPE_ENTRADAS');
  // Se libera la reserva para no afectar las pruebas siguientes
  const compra = await prisma.compra.findFirstOrThrow({ where: { comprador: { email: 'comprador@ticketfr.com' }, estado: 'RESERVADA' } });
  assert.equal((await api('DELETE', `/compras/${compra.id}`, { token })).status, 204);
});

test('dos compradores eligen la misma butaca a la vez: solo uno la obtiene', async () => {
  const [t1, t2] = await Promise.all([login('comprador3@email.com'), login('comprador4@email.com')]);
  const f = await funcionCosquin();
  const vip = await sector(f.salaId, 'SEC-VIP-01');
  const b = await butaca(vip.id, 'A9');
  const body = { funcionId: f.id, sectorId: vip.id, butacaId: b.id };
  const resultados = await Promise.all([
    api('POST', '/compras/reserva/entradas', { token: t1, body }),
    api('POST', '/compras/reserva/entradas', { token: t2, body }),
  ]);
  assert.deepEqual(resultados.map((r) => r.status).sort(), [201, 409]);
});

test('checkout: adicionales, pago rechazado mantiene la reserva, pago aprobado emite QR', async () => {
  const token = await login('comprador2@email.com');
  const f = await funcionCosquin();
  const compra = await prisma.compra.findFirstOrThrow({ where: { comprador: { email: 'comprador2@email.com' }, funcionId: f.id, estado: 'RESERVADA' } });
  const playa = await prisma.tarifaEstacionamiento.findFirstOrThrow({ where: { funcionId: f.id, precio: 8500 } });
  const burger = await prisma.productoConsumicion.findFirstOrThrow({ where: { nombre: { startsWith: 'Doble Burger' } } });

  const patenteMala = await api('PUT', `/compras/${compra.id}/adicionales`, {
    token,
    body: { estacionamiento: [{ tarifaId: playa.id, patente: 'XX' }], consumiciones: [] },
  });
  assert.equal(patenteMala.status, 400);
  assert.equal(patenteMala.data.code, 'PATENTE_INVALIDA');

  const ok = await api('PUT', `/compras/${compra.id}/adicionales`, {
    token,
    body: { estacionamiento: [{ tarifaId: playa.id, patente: 'ad 321 zz' }], consumiciones: [{ productoId: burger.id, cantidad: 2 }] },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.totales.total, 40500 + 8500 + 2 * 9500);
  const stock = await prisma.productoConsumicion.findUniqueOrThrow({ where: { id: burger.id } });
  assert.equal(stock.stockDisponible, burger.stockDisponible - 2, 'el stock queda reservado');

  const rechazado = await api('POST', `/compras/${compra.id}/pagar`, { token, body: { simular: 'RECHAZADO' } });
  assert.equal(rechazado.status, 402);
  assert.equal((await prisma.compra.findUniqueOrThrow({ where: { id: compra.id } })).estado, 'RESERVADA');

  const pagada = await api('POST', `/compras/${compra.id}/pagar`, { token, body: {} });
  assert.equal(pagada.status, 200);
  assert.equal(pagada.data.estado, 'PAGADA');
  assert.match(pagada.data.entradas[0].codigo, /^ENT-\d{5}-A1$/);
  assert.match(pagada.data.entradas[0].qr, /^TFR1:ENT-/);
  assert.equal(pagada.data.pases[0].patente, 'AD 321 ZZ');
  assert.ok(pagada.data.voucher.codigo.startsWith('VCH-'));
});

test('pago sin respuesta → PENDIENTE_PAGO y el webhook tardío lo confirma', async () => {
  const token = await login('comprador5@email.com');
  const f = await funcionCosquin();
  const campo = await sector(f.salaId, 'SEC-CMP-01');
  const reserva = await api('POST', '/compras/reserva/entradas', { token, body: { funcionId: f.id, sectorId: campo.id } });
  const pendiente = await api('POST', `/compras/${reserva.data.id}/pagar`, { token, body: { simular: 'SIN_RESPUESTA' } });
  assert.equal(pendiente.data.estado, 'PENDIENTE_PAGO');
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await prisma.compra.findUniqueOrThrow({ where: { id: reserva.data.id } })).estado, 'PAGADA');
});

test('vencimiento de la reserva: libera ubicaciones y restituye stock', async () => {
  const token = await login('comprador6@email.com');
  const f = await funcionCosquin();
  const vip = await sector(f.salaId, 'SEC-VIP-01');
  const b = await butaca(vip.id, 'B1');
  const hidratacion = await prisma.productoConsumicion.findFirstOrThrow({ where: { nombre: { startsWith: 'Combo Hidratación' } } });
  const reserva = await api('POST', '/compras/reserva/entradas', { token, body: { funcionId: f.id, sectorId: vip.id, butacaId: b.id } });
  await api('PUT', `/compras/${reserva.data.id}/adicionales`, { token, body: { consumiciones: [{ productoId: hidratacion.id, cantidad: 3 }] } });

  await prisma.compra.update({ where: { id: reserva.data.id }, data: { fechaExpiracionReserva: new Date(Date.now() - 1000) } });
  const { liberadas } = await procesarVencimientos();
  assert.ok(liberadas >= 1);
  assert.equal((await prisma.compra.findUniqueOrThrow({ where: { id: reserva.data.id } })).estado, 'VENCIDA');
  const producto = await prisma.productoConsumicion.findUniqueOrThrow({ where: { id: hidratacion.id } });
  assert.equal(producto.stockDisponible, hidratacion.stockDisponible);
  const mapa = await api('GET', `/funciones/${f.id}`);
  assert.equal(mapa.data.sectores.find((s: any) => s.id === vip.id).butacas.find((x: any) => x.id === b.id).ocupada, false);
});

test('control de acceso: aprobado, repetido, revocado, lista negra, punto incorrecto y firma adulterada', async () => {
  const token = await login('controlador@ticketfr.com', 'controlador123');
  const f = await funcionCosquin();
  const validar = (codigo: string, punto = 'PUERTA', confirmar = false) =>
    api('POST', '/control/validaciones', { token, body: { codigo, punto, funcionId: f.id, confirmar } });

  const compraLucas = await api('POST', '/auth/demo', { body: { rol: 'COMPRADOR' } }).then(async (r) => {
    const compras = await api('GET', '/compras/mias', { token: r.data.token });
    return compras.data.compras.find((c: any) => c.codigo === 'TFR-89421');
  });
  const qrLucas = compraLucas.entradas[0].qr as string;

  const verificado = await validar(qrLucas);
  assert.equal(verificado.data.resultado, 'APROBADO');
  assert.equal(verificado.data.confirmado, false);
  assert.equal(verificado.data.titular.nombre, 'Lucas Benítez');

  const usado = await validar(qrLucas, 'PUERTA', true);
  assert.equal(usado.data.confirmado, true);
  const repetido = await validar('#ENT-99210-A5');
  assert.equal(repetido.data.resultado, 'RECHAZADO');
  assert.equal(repetido.data.estadoCodigo, 'USADA');

  const revocado = await validar('#ENT-88412-C9');
  assert.equal(revocado.data.estadoCodigo, 'REVOCADO');
  assert.equal(revocado.data.revocacion.motivo, 'TRANSFERENCIA');

  const javier = await validar('DNI-27111222');
  assert.equal(javier.data.estadoCodigo, 'LISTA_NEGRA');

  const paseEnPuerta = await validar('PRK-48190-N');
  assert.match(paseEnPuerta.data.motivo, /estacionamiento/);
  const pase = await validar('PAT-AB 123 CD', 'ESTACIONAMIENTO', true);
  assert.equal(pase.data.confirmado, true);
  const sinHash = await validar('VCH-3918-B', 'BARRA', true);
  assert.equal(sinHash.data.estadoCodigo, 'FIRMA_REQUERIDA', 'un código tipeado sin HASH no habilita el canje');
  assert.equal(sinHash.data.confirmado, false);
  const voucher = await validar(`VCH-3918-B ${compraLucas.voucher.hash}`, 'BARRA', true);
  assert.equal(voucher.data.confirmado, true);
  assert.equal(voucher.data.pin, '7741');

  const adulterado = await validar('TFR1:ENT-99210-A5:0000000000000000');
  assert.equal(adulterado.data.estadoCodigo, 'FIRMA_INVALIDA');

  const resumen = await api('GET', `/control/funciones/${f.id}/resumen`, { token });
  assert.ok(resumen.data.turno.lecturas >= 7);
  assert.equal(resumen.data.puerta.ingresados, 1);
});

test('transferencia: requiere aceptación y regenera el QR (el anterior queda revocado)', async () => {
  const tCedente = await login('comprador2@email.com');
  const tDestino = await login('comprador7@email.com');
  const compras = await api('GET', '/compras/mias', { token: tCedente });
  const entrada = compras.data.compras[0].entradas[0];
  const codigoAnterior = entrada.codigo as string;

  const noRegistrado = await api('POST', `/entradas/${entrada.id}/transferencias`, { token: tCedente, body: { dni: '99999999' } });
  assert.equal(noRegistrado.status, 404);
  const bloqueado = await api('POST', `/entradas/${entrada.id}/transferencias`, { token: tCedente, body: { dni: '27111222' } });
  assert.equal(bloqueado.status, 403, 'no se puede transferir a alguien en la lista negra');

  const destino = await prisma.usuario.findUniqueOrThrow({ where: { email: 'comprador7@email.com' } });
  const t = await api('POST', `/entradas/${entrada.id}/transferencias`, { token: tCedente, body: { dni: destino.dni } });
  assert.equal(t.status, 201);
  assert.equal(t.data.estado, 'PENDIENTE');
  const otra = await api('POST', `/entradas/${entrada.id}/transferencias`, { token: tCedente, body: { dni: destino.dni } });
  assert.equal(otra.data.code, 'TRANSFERENCIA_PENDIENTE');

  const aceptada = await api('POST', `/transferencias/${t.data.id}/aceptar`, { token: tDestino });
  assert.equal(aceptada.status, 200);
  const recibida = aceptada.data.entradasRecibidas.find((e: any) => e.id === entrada.id);
  assert.notEqual(recibida.codigo, codigoAnterior);

  const control = await login('controlador@ticketfr.com', 'controlador123');
  const f = await funcionCosquin();
  const viejo = await api('POST', '/control/validaciones', { token: control, body: { codigo: codigoAnterior, punto: 'PUERTA', funcionId: f.id } });
  assert.equal(viejo.data.estadoCodigo, 'REVOCADO');
  const nuevo = await api('POST', '/control/validaciones', { token: control, body: { codigo: recibida.qr, punto: 'PUERTA', funcionId: f.id } });
  assert.equal(nuevo.data.resultado, 'APROBADO');
  assert.equal(nuevo.data.titular.dni, destino.dni);
});

test('reembolso: fuera de plazo (< 48 h) se rechaza; dentro de plazo anula QR y libera la butaca', async () => {
  const lucas = await login('comprador@ticketfr.com');
  const mias = await api('GET', '/compras/mias', { token: lucas });
  const standup = mias.data.compras.find((c: any) => c.funcion.codigo === 'FUN-STUP26-01');
  const fueraDePlazo = await api('GET', `/compras/${standup.id}/reembolso`, { token: lucas });
  assert.equal(fueraDePlazo.data.reembolsable, false);

  // Compra nueva de la función de Cosquín (faltan semanas)
  const f = await funcionCosquin();
  const vip = await sector(f.salaId, 'SEC-VIP-01');
  const b = await butaca(vip.id, 'B2');
  const reserva = await api('POST', '/compras/reserva/entradas', { token: lucas, body: { funcionId: f.id, sectorId: vip.id, butacaId: b.id } });
  const pagada = await api('POST', `/compras/${reserva.data.id}/pagar`, { token: lucas, body: {} });
  const codigo = pagada.data.entradas[0].codigo;

  const preview = await api('GET', `/compras/${reserva.data.id}/reembolso`, { token: lucas });
  assert.equal(preview.data.reembolsable, true);
  assert.equal(preview.data.total, 40500);

  const r = await api('POST', `/compras/${reserva.data.id}/reembolsos`, { token: lucas, body: { motivo: 'Imposibilidad de asistencia' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.estado, 'REEMBOLSADA');
  assert.equal(r.data.reembolsos[0].estado, 'COMPLETADO');

  const control = await login('controlador@ticketfr.com', 'controlador123');
  const escaneo = await api('POST', '/control/validaciones', { token: control, body: { codigo, punto: 'PUERTA', funcionId: f.id } });
  assert.equal(escaneo.data.revocacion.motivo, 'REEMBOLSO');
  const mapa = await api('GET', `/funciones/${f.id}`);
  assert.equal(mapa.data.sectores.find((s: any) => s.id === vip.id).butacas.find((x: any) => x.id === b.id).ocupada, false);
});

test('lista negra: un DNI vedado no puede reservar', async () => {
  const token = await login('bloqueado@ticketfr.com');
  const f = await funcionCosquin();
  const campo = await sector(f.salaId, 'SEC-CMP-01');
  const r = await api('POST', '/compras/reserva/entradas', { token, body: { funcionId: f.id, sectorId: campo.id } });
  assert.equal(r.status, 403);
});

test('organizador: no se publica con sectores sin precio; al completarlos, sí', async () => {
  const token = await login('organizador@ticketfr.com', 'organizador123');
  const f2 = await prisma.funcion.findUniqueOrThrow({ where: { codigo: 'FUN-CQ26-BUE-02' } });
  const fallida = await api('POST', `/org/funciones/${f2.id}/publicar`, { token });
  assert.equal(fallida.status, 409);
  assert.equal(fallida.data.code, 'SECTORES_SIN_PRECIO');

  const config = await api('GET', `/org/funciones/${f2.id}`, { token });
  const tarifas = config.data.sectores.map((s: any) => ({ sectorId: s.id, precio: s.tarifa?.precio ?? 30000, descuento: null }));
  assert.equal((await api('PUT', `/org/funciones/${f2.id}/tarifas`, { token, body: { tarifas } })).status, 200);
  const publicada = await api('POST', `/org/funciones/${f2.id}/publicar`, { token });
  assert.equal(publicada.status, 200);
  assert.equal(publicada.data.estado, 'PUBLICADA');

  const choque = await api('POST', '/org/funciones', {
    token,
    body: { eventoId: f2.eventoId, salaId: f2.salaId, fechaHora: new Date(f2.fechaHora.getTime() + 3600_000).toISOString() },
  });
  assert.equal(choque.data.code, 'SALA_OCUPADA');
});

test('administrador: no puede regenerar la matriz de un sector con entradas vendidas', async () => {
  const token = await login('admin@ticketfr.com', 'admin123');
  const sala = await prisma.sala.findUniqueOrThrow({ where: { codigo: 'VEN-042' } });
  const detalle = await api('GET', `/admin/salas/${sala.id}`, { token });
  const mapa = {
    escenario: detalle.data.escenario,
    sectores: detalle.data.sectores.map((s: any) => (s.codigo === 'SEC-VIP-01' ? { ...s, filas: 3 } : s)),
  };
  const r = await api('PUT', `/admin/salas/${sala.id}/mapa`, { token, body: mapa });
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'SECTOR_CON_ENTRADAS');

  const soloGeometria = { ...mapa, sectores: detalle.data.sectores.map((s: any) => (s.codigo === 'SEC-VIP-01' ? { ...s, posX: s.posX + 10 } : s)) };
  assert.equal((await api('PUT', `/admin/salas/${sala.id}/mapa`, { token, body: soloGeometria })).status, 200);
});

test('roles: un comprador no accede al backoffice', async () => {
  const token = await login('comprador@ticketfr.com');
  assert.equal((await api('GET', '/admin/salas', { token })).status, 403);
  assert.equal((await api('GET', '/org/panel', { token })).status, 403);
  assert.equal((await api('GET', '/compras/mias')).status, 401);
});

// ─── Regresiones de la revisión ──────────────────────────────────────────────

const funcionLiga = () => prisma.funcion.findUniqueOrThrow({ where: { codigo: 'FUN-LIGA26-01' } });

test('administrador: una sala nueva recibe un código libre', async () => {
  const token = await login('admin@ticketfr.com', 'admin123');
  const r = await api('POST', '/admin/salas', { token, body: { nombre: 'Sala de prueba', direccion: 'Calle 123', capacidad: 500 } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.codigo, 'VEN-045');
});

test('administrador: las medidas del plano no dejan afuera lo dibujado', async () => {
  const token = await login('admin@ticketfr.com', 'admin123');
  // Sala de 12 x 10 m (20 unidades por metro): el escenario inicial se adapta al plano
  const chica = await api('POST', '/admin/salas', { token, body: { nombre: 'Sala chica', direccion: 'Calle 456', capacidad: 80, ancho: 240, alto: 200 } });
  assert.equal(chica.status, 201, JSON.stringify(chica.data));
  const e = chica.data.escenario;
  assert.ok(e.posX >= 0 && e.posX + e.ancho <= 240 && e.posY + e.alto <= 200, JSON.stringify(e));
  const minima = await api('POST', '/admin/salas', { token, body: { nombre: 'Sala mínima', direccion: 'Calle 789', capacidad: 10, ancho: 100, alto: 200 } });
  assert.equal(minima.status, 400);

  const sala = await prisma.sala.findUniqueOrThrow({ where: { codigo: 'VEN-042' } });
  const achicar = await api('PATCH', `/admin/salas/${sala.id}`, { token, body: { ancho: 600 } });
  assert.equal(achicar.status, 409);
  assert.equal(achicar.data.code, 'PLANO_CHICO');
  const agrandar = await api('PATCH', `/admin/salas/${sala.id}`, { token, body: { ancho: 1200, alto: 900 } });
  assert.equal(agrandar.status, 200, JSON.stringify(agrandar.data));
  assert.deepEqual([agrandar.data.ancho, agrandar.data.alto], [1200, 900]);

  const fuera = { escenario: agrandar.data.escenario, sectores: agrandar.data.sectores.map((s: any, i: number) => (i === 0 ? { ...s, posX: 1150 } : s)) };
  const r = await api('PUT', `/admin/salas/${sala.id}/mapa`, { token, body: fuera });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'FUERA_DEL_PLANO');
  assert.equal((await api('PATCH', `/admin/salas/${sala.id}`, { token, body: { ancho: sala.ancho, alto: sala.alto } })).status, 200);
});

test('transferencia: aceptar dos veces a la vez no la deja cancelada', async () => {
  const lucas = await login('comprador@ticketfr.com');
  const t = await prisma.transferenciaEntrada.findFirstOrThrow({ where: { estado: 'PENDIENTE', destinatario: { email: 'comprador@ticketfr.com' } } });
  const respuestas = await Promise.all([1, 2].map(() => api('POST', `/transferencias/${t.id}/aceptar`, { token: lucas })));
  assert.deepEqual(respuestas.map((r) => r.status).sort(), [200, 409]);
  const despues = await prisma.transferenciaEntrada.findUniqueOrThrow({ where: { id: t.id }, include: { entrada: { include: { titular: true } } } });
  assert.equal(despues.estado, 'ACEPTADA');
  assert.equal(despues.entrada.titular.email, 'comprador@ticketfr.com');
  const avisos = await prisma.notificacion.count({ where: { para: 'mariana.rojas@email.com', asunto: 'Transferencia cancelada' } });
  assert.equal(avisos, 0, 'al cedente no le llega un aviso de cancelación falso');
});

test('transferencia: DNI y email de personas distintas se rechaza; "cedida por" es el último cedente', async () => {
  const lucas = await login('comprador@ticketfr.com');
  const mias = await api('GET', '/compras/mias', { token: lucas });
  const recibida = mias.data.entradasRecibidas[0];
  const mariana = await prisma.usuario.findUniqueOrThrow({ where: { email: 'mariana.rojas@email.com' } });
  const mezcla = await api('POST', `/entradas/${recibida.id}/transferencias`, { token: lucas, body: { dni: mariana.dni, email: 'comprador9@email.com' } });
  assert.equal(mezcla.status, 400);
  assert.equal(mezcla.data.code, 'DESTINATARIO_INCONSISTENTE');

  // Mariana → Lucas → comprador9: a comprador9 se la cedió Lucas
  const t = await api('POST', `/entradas/${recibida.id}/transferencias`, { token: lucas, body: { email: 'comprador9@email.com' } });
  assert.equal(t.status, 201);
  const aceptada = await api('POST', `/transferencias/${t.data.id}/aceptar`, { token: await login('comprador9@email.com') });
  assert.equal(aceptada.data.entradasRecibidas.find((e: any) => e.id === recibida.id).cedidaPor.email, 'comprador@ticketfr.com');
});

test('estacionamiento: deshabilitar una playa con pases anulados y patente opcional según la función', async () => {
  const admin = await login('admin@ticketfr.com', 'admin123');
  const comprador = await login('comprador45@email.com');
  const f = await funcionLiga();
  const campo = await sector(f.salaId, 'SEC-CMP-01');
  const tarifa = await prisma.tarifaEstacionamiento.findFirstOrThrow({ where: { funcionId: f.id } });
  const playas = await prisma.playaEstacionamiento.findMany({ where: { salaId: f.salaId } });
  const configurar = (exigePatente: boolean, habilitada: boolean) =>
    api('PUT', `/org/funciones/${f.id}/estacionamiento`, {
      token: admin,
      body: {
        exigePatente,
        aperturaPlaya: null,
        playas: playas.map((p) => ({ playaId: p.id, habilitada: habilitada && p.id === tarifa.playaId, precio: 6000, cupoHabilitado: 50 })),
      },
    });

  const reserva = await api('POST', '/compras/reserva/entradas', { token: comprador, body: { funcionId: f.id, sectorId: campo.id } });
  const conPatente = await api('PUT', `/compras/${reserva.data.id}/adicionales`, { token: comprador, body: { estacionamiento: [{ tarifaId: tarifa.id, patente: 'AA111BB' }] } });
  assert.equal(conPatente.status, 200);
  assert.equal((await api('DELETE', `/compras/${reserva.data.id}`, { token: comprador })).status, 204);

  const deshabilitar = await configurar(true, false);
  assert.equal(deshabilitar.status, 200, JSON.stringify(deshabilitar.data));
  assert.equal((await api('GET', `/funciones/${f.id}`)).data.estacionamiento.length, 0);

  assert.equal((await configurar(false, true)).status, 200);
  const otra = await api('POST', '/compras/reserva/entradas', { token: comprador, body: { funcionId: f.id, sectorId: campo.id } });
  const sinPatente = await api('PUT', `/compras/${otra.data.id}/adicionales`, { token: comprador, body: { estacionamiento: [{ tarifaId: tarifa.id }] } });
  assert.equal(sinPatente.status, 200, JSON.stringify(sinPatente.data));
  assert.equal(sinPatente.data.pases[0].patente, null);

  assert.equal((await configurar(true, true)).status, 200);
  const exigida = await api('PUT', `/compras/${otra.data.id}/adicionales`, { token: comprador, body: { estacionamiento: [{ tarifaId: tarifa.id }] } });
  assert.equal(exigida.data.code, 'PATENTE_REQUERIDA');
  await api('DELETE', `/compras/${otra.data.id}`, { token: comprador });
});

test('administrador: se puede borrar un sector que solo tuvo reservas vencidas', async () => {
  const admin = await login('admin@ticketfr.com', 'admin123');
  const comprador = await login('comprador46@email.com');
  const f = await funcionLiga();
  const detalle = (await api('GET', `/admin/salas/${f.salaId}`, { token: admin })).data;
  const mapa = (sectores: unknown[]) => ({ escenario: detalle.escenario, sectores });
  const nuevo = { codigo: 'SEC-TST-01', nombre: 'Sector de prueba', numerado: false, cupoMaximo: 10, filas: 0, butacasPorFila: 0, color: 'rose', forma: 'RECT', posX: 10, posY: 10, ancho: 100, alto: 60 };

  const alta = await api('PUT', `/admin/salas/${f.salaId}/mapa`, { token: admin, body: mapa([...detalle.sectores, nuevo]) });
  const creado = alta.data.sectores.find((s: any) => s.codigo === 'SEC-TST-01');
  await api('PUT', `/org/funciones/${f.id}/tarifas`, { token: admin, body: { tarifas: [{ sectorId: creado.id, precio: 1000, descuento: null }] } });
  const reserva = await api('POST', '/compras/reserva/entradas', { token: comprador, body: { funcionId: f.id, sectorId: creado.id } });
  await api('DELETE', `/compras/${reserva.data.id}`, { token: comprador });
  assert.equal((await api('GET', `/admin/salas/${f.salaId}`, { token: admin })).data.sectores.find((s: any) => s.id === creado.id).entradasEmitidas, 0);

  const baja = await api('PUT', `/admin/salas/${f.salaId}/mapa`, { token: admin, body: mapa(detalle.sectores) });
  assert.equal(baja.status, 200, JSON.stringify(baja.data));
  assert.equal(await prisma.sector.count({ where: { id: creado.id } }), 0);
});

test('control: un código tipeado necesita su HASH; la conciliación offline guarda la hora real', async () => {
  const control = await login('controlador@ticketfr.com', 'controlador123');
  const f = await funcionCosquin();
  const destino = await api('GET', '/compras/mias', { token: await login('comprador7@email.com') });
  const entrada = destino.data.entradasRecibidas[0];
  const validar = (codigo: string) => api('POST', '/control/validaciones', { token: control, body: { codigo, punto: 'PUERTA', funcionId: f.id } });

  assert.equal((await validar(`#${entrada.codigo}`)).data.estadoCodigo, 'FIRMA_REQUERIDA');
  assert.equal((await validar(`#${entrada.codigo} ${entrada.hash}`)).data.resultado, 'APROBADO');
  assert.equal((await validar(`#${entrada.codigo} 0000-0000-0000-0000`)).data.estadoCodigo, 'FIRMA_INVALIDA');

  const padron = await api('GET', `/control/funciones/${f.id}/padron`, { token: control });
  assert.ok(padron.data.listaNegra.includes('27111222'), 'el padrón lleva la lista negra para el modo offline');
  assert.ok(padron.data.codigos.every((c: any) => /^[0-9a-f]{16}$/.test(c.firma)));

  const horaIngreso = new Date(Date.now() - 2 * 3600_000);
  const sync = await api('POST', '/control/sincronizar', {
    token: control,
    body: { funcionId: f.id, operaciones: [{ codigo: entrada.codigo, punto: 'PUERTA', fechaHora: horaIngreso.toISOString() }] },
  });
  assert.equal(sync.data.aplicadas, 1);
  const usada = await prisma.entrada.findUniqueOrThrow({ where: { id: entrada.id } });
  assert.equal(usada.usadaEn?.getTime(), horaIngreso.getTime());
});

test('pago: la lista negra se vuelve a verificar al pagar', async () => {
  const admin = await login('admin@ticketfr.com', 'admin123');
  const comprador = await login('comprador47@email.com');
  const f = await funcionLiga();
  const campo = await sector(f.salaId, 'SEC-CMP-01');
  const reserva = await api('POST', '/compras/reserva/entradas', { token: comprador, body: { funcionId: f.id, sectorId: campo.id } });
  const { dni } = await prisma.usuario.findUniqueOrThrow({ where: { email: 'comprador47@email.com' } });
  const alta = await api('POST', '/admin/lista-negra', { token: admin, body: { dni, motivo: 'Prueba de pago bloqueado' } });

  const pago = await api('POST', `/compras/${reserva.data.id}/pagar`, { token: comprador, body: {} });
  assert.equal(pago.status, 403);
  assert.equal((await prisma.compra.findUniqueOrThrow({ where: { id: reserva.data.id } })).estado, 'VENCIDA');
  await api('DELETE', `/admin/lista-negra/${alta.data.id}`, { token: admin });
});

test('ids inexistentes responden 404 en lugar de 500', async () => {
  const admin = await login('admin@ticketfr.com', 'admin123');
  const control = await login('controlador@ticketfr.com', 'controlador123');
  const respuestas = await Promise.all([
    api('POST', '/control/validaciones', { token: control, body: { codigo: 'ENT-00000-X0', punto: 'PUERTA', funcionId: 99999 } }),
    api('PATCH', '/admin/salas/99999', { token: admin, body: { nombre: 'No existe' } }),
    api('DELETE', '/admin/lista-negra/99999', { token: admin }),
    api('POST', '/admin/salas/99999/playas', { token: admin, body: { nombre: 'Playa X', capacidadTotal: 10 } }),
  ]);
  assert.deepEqual(respuestas.map((r) => r.status), [404, 404, 404, 404]);
});
