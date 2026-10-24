# TicketFr — Portal de venta de entradas

Implementación funcional del **Caso Integrador** de Ingeniería de Software ([CasoIntegradorIS-Purro-Saieva.md](CasoIntegradorIS-Purro-Saieva.md)), a partir del diseño hecho en Google Stitch (proyecto *TicketFr Ticketing Platform*).

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS 3 (tokens del design system *Nocturne Velocity*) |
| Backend | Node.js + Express 5 + TypeScript |
| Base de datos | SQLite con Prisma ORM (migraciones + seed) |
| Pruebas | `node:test` (15 pruebas de integración contra la API real) |

## Puesta en marcha

Requisitos: **Node.js 20 o superior** (probado con Node 24) y npm.

```bash
npm run setup   # instala todo, crea Backend/.env y carga la base con datos de demo
npm run dev     # levanta la API (puerto 3001) y la web (puerto 5173)
```

Abrí **http://localhost:5173**.

Otros comandos útiles (desde la raíz):

| Comando | Qué hace |
|---|---|
| `npm test` | Corre las pruebas de integración del backend (usan una base aparte, `prisma/test.db`) |
| `npm run db:reset` | Borra la base y la vuelve a cargar con los datos de demo |
| `npm run typecheck` | Verifica tipos en backend y frontend |
| `npm run build` | Genera el frontend de producción en `Frontend/dist` |
| `npm run db:studio --prefix Backend` | Abre Prisma Studio para ver las tablas |

## Cuentas de demostración

Con `DEMO_MODE=true` (por defecto) la cabecera muestra el **selector de roles** del diseño de Stitch: un clic inicia sesión con la cuenta demo de ese rol.

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | admin@ticketfr.com | admin123 |
| Organizador (En Vivo Producciones) | organizador@ticketfr.com | organizador123 |
| Comprador (Lucas Benítez, DNI 38.452.190) | comprador@ticketfr.com | comprador123 |
| Controlador de acceso | controlador@ticketfr.com | controlador123 |
| Comprador (Mariana Rojas, DNI 41.982.554) | mariana.rojas@email.com | comprador123 |
| Comprador **en lista negra** (Javier Ruiz) | bloqueado@ticketfr.com | comprador123 |

## Recorrido sugerido para la presentación

1. **Comprador** → *Cosquín Rock 2026*: elegir butacas en el mapa (arranca el contador de 10 min), sumar campo, estacionamiento con patente y consumiciones. En la pasarela simulada probar **Rechazado** (la reserva sigue) y después **Aprobado**.
2. **Mis Compras**: ver los QR de entrada, pase y voucher; **aceptar** la entrada que transfirió Mariana; transferir una entrada por DNI; pedir el **reembolso** de la orden #TFR-89421 ($ 63.000). La compra de *Stand-Up* (función de mañana) muestra que, a menos de 48 h, ya no se puede devolver.
3. **Controlador** → elegir *Cosquín Rock*: validar un código (o "Simular QR aprobado"), desbloquear el molinete y volver a escanearlo (rechazado por repetido). Probar `#ENT-88412-C9` (QR revocado por transferencia), `DNI-27111222` (lista negra) y `PAT-AB123CD` en el puesto de estacionamiento. Con "Sincronizar padrón" y el servidor apagado, la terminal sigue validando sin conexión y concilia al volver.
4. **Organizador**: editar tarifas y descuentos, habilitar playas y cupos, cargar productos y ver las métricas en vivo. En la segunda función de Cosquín (en borrador), activar "Publicar" muestra qué sectores no tienen precio.

> Las fechas de las funciones del seed son **relativas al día en que se carga la base** (Stand-Up mañana, Cosquín dentro de 4 semanas, etc.). Antes de presentar, corré `npm run db:reset` para tener todo fresco.
5. **Administrador**: arrastrar y redimensionar sectores en el editor, cambiar filas × butacas, agregar playas y gestionar lista negra y usuarios.

## Estructura del repositorio

```
├─ Backend/
│  ├─ prisma/            schema.prisma (modelo de dominio), migraciones y seed
│  ├─ src/
│  │  ├─ domain/         reglas de negocio: compras, reembolsos, transferencias, control, salas…
│  │  ├─ routes/         API REST por rol (auth, público, comprador, organizador, admin, control)
│  │  ├─ services/       pasarela de pagos y mailing (simulados)
│  │  └─ lib/            errores HTTP, bloqueo por función, códigos QR firmados
│  └─ test/              pruebas de integración de los flujos del caso
├─ Frontend/
│  └─ src/
│     ├─ pages/          una carpeta por rol (comprador, organizador, admin, control)
│     ├─ components/     design system (ui.tsx), cabecera, mapa SVG de sala, QR y patentes
│     └─ lib/            cliente de la API, tipos y formatos (es-AR)
└─ design/stitch/        referencia original exportada de Stitch (HTML, capturas y DESIGN.md)
```

## Del diseño de Stitch al código

- Las cinco pantallas de Stitch se portaron a componentes React conservando la estructura, los textos y la jerarquía visual: editor de sala (1), panel del organizador (2), compra (3), Mis Compras (4) y control de acceso (5).
- En Stitch convivían tres estilos: tokens de *Nocturne Velocity*, una paleta propia y Tailwind estándar, cada uno con íconos distintos. Se **unificó todo en Nocturne Velocity** ([design/stitch/DESIGN.md](design/stitch/DESIGN.md)), con íconos *Material Symbols* y la fuente Inter alojados en el proyecto, así que funcionan sin internet.
- Se agregaron las pantallas que el diseño no tenía: login y registro, cartelera, aceptar transferencias, lista negra, usuarios y programar función. Están armadas con los mismos componentes.

## Cómo se implementó el caso integrador

**Casos de uso** — todos los de la Vista 1 tienen endpoint y pantalla. Los «include» y «extend» se respetan: estacionamiento y consumiciones se agregan en el checkout de la compra, el reintegro forma parte del reembolso y la lectura del QR forma parte de cada validación.

**Modelo de clases** — [Backend/prisma/schema.prisma](Backend/prisma/schema.prisma) traduce la Vista 2 entidad por entidad:
- la jerarquía de usuarios se guarda en una sola tabla, con `rol` como discriminador;
- los estados son las enumeraciones del punto 2.3;
- los métodos del diagrama (`precioVigente`, `liberarReserva`, `regenerarQR`, `descontarStock`…) están en `src/domain`.

**Reglas de negocio**

| Regla | Dónde |
|---|---|
| Reserva de 10 min con vencimiento automático (actividad 3.2) | `domain/compras.ts` → `procesarVencimientos` (cada 10 s) |
| Tope de 6 entradas por comprador y función (cuenta las recibidas por transferencia) | `agregarEntrada`, `iniciarTransferencia`, `aceptarTransferencia` |
| Pago sin respuesta → `PENDIENTE_PAGO`, se extiende 5 min una vez; webhook tardío o reversa | `pagar`, `confirmarPagoTardio` |
| Reembolso hasta 48 h antes; se anulan los QR antes de reintegrar; los adicionales se devuelven con la última entrada | `domain/reembolsos.ts` |
| Transferencia con aceptación del destinatario registrado; QR anterior revocado y uno nuevo emitido | `domain/transferencias.ts` |
| Validación por estado, función y punto de control (puerta, playa, barra), con modo sin conexión | `domain/control.ts`, `Frontend/src/pages/control/offline.ts` |
| Lista negra verificada al comprar, al transferir y en la puerta | `domain/ocupacion.ts` → `enListaNegra` |
| No se publica una función con sectores sin precio ni con la sala ocupada | `domain/funciones.ts` |

**Riesgos del plan RMMM ([gestion-riesgos.md](gestion-riesgos.md)) que se mitigan en el código**

| Riesgo | Mitigación |
|---|---|
| R-01 sobreventa | Las operaciones de una misma función se serializan y corren en una transacción; hay una prueba de dos compradores eligiendo la misma butaca a la vez |
| R-03 fraude con QR | El QR va firmado con HMAC (`TFR1:CÓDIGO:FIRMA`); los códigos revocados se registran para informar el motivo; el uso se marca de forma atómica |
| R-04 pasarela asincrónica | Estado `PENDIENTE_PAGO`, extensión única de la reserva y reversa automática de pagos que llegan tarde |
| R-05 sin conexión en el predio | Padrón local, validación offline, cola de ingresos y conciliación posterior |
| R-08 y R-12 mapa pesado o inaccesible | Selección asistida de la "mejor ubicación disponible" y butacas operables con teclado |
| R-13 mailing saturado | Los QR se pueden ver siempre desde Mis Compras; los correos se guardan como bandeja simulada |

## Decisiones y limitaciones conocidas

- **Pasarela de pagos y mailing** están simulados: el checkout permite elegir el resultado y los correos se guardan en la tabla `Notificacion`.
- El **bloqueo contra la sobreventa** está en memoria y alcanza para un solo proceso. Con varias instancias haría falta un lock distribuido (Redis, como dice R-01).
- El **padrón offline** se guarda en `localStorage` sin cifrar. R-12 pide cifrado; queda pendiente.
- La **cámara** para leer QR funciona en `localhost` o con HTTPS (restricción del navegador). Siempre está disponible el ingreso manual o por lector USB.
- Si el repositorio queda dentro de **OneDrive**, la sincronización de `node_modules` y de la base SQLite puede volver lento el proyecto o bloquear archivos. Conviene clonarlo en una carpeta que no se sincronice (por ejemplo `C:\dev\ticketfr`).
