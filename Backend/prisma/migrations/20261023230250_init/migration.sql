-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "nombre" TEXT NOT NULL,
    "dni" TEXT,
    "productora" TEXT,
    "puntoAcceso" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Sala" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "ancho" INTEGER NOT NULL DEFAULT 860,
    "alto" INTEGER NOT NULL DEFAULT 640
);

-- CreateTable
CREATE TABLE "Escenario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "salaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "esBase" BOOLEAN NOT NULL DEFAULT false,
    "posX" REAL NOT NULL,
    "posY" REAL NOT NULL,
    "ancho" REAL NOT NULL,
    "alto" REAL NOT NULL,
    "poligonoSVG" TEXT,
    CONSTRAINT "Escenario_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "salaId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "numerado" BOOLEAN NOT NULL,
    "cupoMaximo" INTEGER NOT NULL,
    "filas" INTEGER NOT NULL DEFAULT 0,
    "butacasPorFila" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT 'indigo',
    "forma" TEXT NOT NULL DEFAULT 'RECT',
    "posX" REAL NOT NULL,
    "posY" REAL NOT NULL,
    "ancho" REAL NOT NULL,
    "alto" REAL NOT NULL,
    "poligonoSVG" TEXT,
    "puertaAcceso" TEXT,
    CONSTRAINT "Sector_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Butaca" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sectorId" INTEGER NOT NULL,
    "fila" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "posX" REAL NOT NULL,
    "posY" REAL NOT NULL,
    CONSTRAINT "Butaca_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayaEstacionamiento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "salaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "capacidadTotal" INTEGER NOT NULL,
    "usoExclusivo" BOOLEAN NOT NULL DEFAULT false,
    "habilitada" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PlayaEstacionamiento_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizadorId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT,
    CONSTRAINT "Evento_organizadorId_fkey" FOREIGN KEY ("organizadorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Funcion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "salaId" INTEGER NOT NULL,
    "escenarioId" INTEGER NOT NULL,
    "fechaHora" DATETIME NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "exigePatente" BOOLEAN NOT NULL DEFAULT true,
    "aperturaPlaya" TEXT,
    CONSTRAINT "Funcion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Funcion_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Funcion_escenarioId_fkey" FOREIGN KEY ("escenarioId") REFERENCES "Escenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tarifa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "funcionId" INTEGER NOT NULL,
    "sectorId" INTEGER NOT NULL,
    "precio" INTEGER NOT NULL,
    CONSTRAINT "Tarifa_funcionId_fkey" FOREIGN KEY ("funcionId") REFERENCES "Funcion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tarifa_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Descuento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tarifaId" INTEGER NOT NULL,
    "porcentaje" REAL NOT NULL,
    "vigenciaDesde" DATETIME NOT NULL,
    "vigenciaHasta" DATETIME NOT NULL,
    "descripcion" TEXT,
    CONSTRAINT "Descuento_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "Tarifa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TarifaEstacionamiento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "funcionId" INTEGER NOT NULL,
    "playaId" INTEGER NOT NULL,
    "precio" INTEGER NOT NULL,
    "cupoHabilitado" INTEGER NOT NULL,
    CONSTRAINT "TarifaEstacionamiento_funcionId_fkey" FOREIGN KEY ("funcionId") REFERENCES "Funcion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TarifaEstacionamiento_playaId_fkey" FOREIGN KEY ("playaId") REFERENCES "PlayaEstacionamiento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductoConsumicion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precioPreventa" INTEGER NOT NULL,
    "precioLista" INTEGER,
    "stockDisponible" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProductoConsumicion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "compradorId" INTEGER NOT NULL,
    "funcionId" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaExpiracionReserva" DATETIME NOT NULL,
    "reservaExtendida" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL,
    "idTransaccionPago" TEXT,
    "fechaPago" DATETIME,
    CONSTRAINT "Compra_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Compra_funcionId_fkey" FOREIGN KEY ("funcionId") REFERENCES "Funcion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entrada" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "compraId" INTEGER NOT NULL,
    "funcionId" INTEGER NOT NULL,
    "sectorId" INTEGER NOT NULL,
    "butacaId" INTEGER,
    "titularId" INTEGER NOT NULL,
    "codigoQR" TEXT,
    "precio" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "usadaEn" DATETIME,
    "reembolsoId" INTEGER,
    CONSTRAINT "Entrada_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entrada_funcionId_fkey" FOREIGN KEY ("funcionId") REFERENCES "Funcion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entrada_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entrada_butacaId_fkey" FOREIGN KEY ("butacaId") REFERENCES "Butaca" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Entrada_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entrada_reembolsoId_fkey" FOREIGN KEY ("reembolsoId") REFERENCES "Reembolso" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaseEstacionamiento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "compraId" INTEGER NOT NULL,
    "tarifaId" INTEGER NOT NULL,
    "patente" TEXT NOT NULL,
    "codigoQR" TEXT,
    "precio" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "usadoEn" DATETIME,
    CONSTRAINT "PaseEstacionamiento_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaseEstacionamiento_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "TarifaEstacionamiento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherConsumicion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "compraId" INTEGER NOT NULL,
    "codigoQR" TEXT,
    "pin" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "canjeadoEn" DATETIME,
    CONSTRAINT "VoucherConsumicion_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemConsumicion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "voucherId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" INTEGER NOT NULL,
    CONSTRAINT "ItemConsumicion_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "VoucherConsumicion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemConsumicion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ProductoConsumicion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransferenciaEntrada" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entradaId" INTEGER NOT NULL,
    "cedenteId" INTEGER NOT NULL,
    "destinatarioId" INTEGER NOT NULL,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "fechaRespuesta" DATETIME,
    CONSTRAINT "TransferenciaEntrada_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "Entrada" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransferenciaEntrada_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransferenciaEntrada_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reembolso" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "compraId" INTEGER NOT NULL,
    "fechaSolicitud" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montoReintegrado" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "idTransaccionReintegro" TEXT,
    CONSTRAINT "Reembolso_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RegistroListaNegra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dni" TEXT NOT NULL,
    "nombre" TEXT,
    "motivo" TEXT NOT NULL,
    "fechaAlta" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CodigoRevocado" (
    "codigo" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "referenciaId" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ValidacionAcceso" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "funcionId" INTEGER,
    "controladorId" INTEGER NOT NULL,
    "punto" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT,
    "resultado" TEXT NOT NULL,
    "motivo" TEXT,
    "titular" TEXT,
    "ubicacion" TEXT,
    "latenciaMs" INTEGER NOT NULL DEFAULT 0,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidacionAcceso_funcionId_fkey" FOREIGN KEY ("funcionId") REFERENCES "Funcion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ValidacionAcceso_controladorId_fkey" FOREIGN KEY ("controladorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "para" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_dni_key" ON "Usuario"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "Sala_codigo_key" ON "Sala"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_salaId_codigo_key" ON "Sector"("salaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Butaca_sectorId_fila_numero_key" ON "Butaca"("sectorId", "fila", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Funcion_codigo_key" ON "Funcion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Tarifa_funcionId_sectorId_key" ON "Tarifa"("funcionId", "sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "TarifaEstacionamiento_funcionId_playaId_key" ON "TarifaEstacionamiento"("funcionId", "playaId");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_codigo_key" ON "Compra"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Entrada_codigoQR_key" ON "Entrada"("codigoQR");

-- CreateIndex
CREATE UNIQUE INDEX "PaseEstacionamiento_codigoQR_key" ON "PaseEstacionamiento"("codigoQR");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherConsumicion_compraId_key" ON "VoucherConsumicion"("compraId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherConsumicion_codigoQR_key" ON "VoucherConsumicion"("codigoQR");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroListaNegra_dni_key" ON "RegistroListaNegra"("dni");
