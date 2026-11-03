-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaseEstacionamiento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "compraId" INTEGER NOT NULL,
    "tarifaId" INTEGER NOT NULL,
    "patente" TEXT,
    "codigoQR" TEXT,
    "precio" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "usadoEn" DATETIME,
    CONSTRAINT "PaseEstacionamiento_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaseEstacionamiento_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "TarifaEstacionamiento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PaseEstacionamiento" ("codigoQR", "compraId", "estado", "id", "patente", "precio", "tarifaId", "usadoEn") SELECT "codigoQR", "compraId", "estado", "id", "patente", "precio", "tarifaId", "usadoEn" FROM "PaseEstacionamiento";
DROP TABLE "PaseEstacionamiento";
ALTER TABLE "new_PaseEstacionamiento" RENAME TO "PaseEstacionamiento";
CREATE UNIQUE INDEX "PaseEstacionamiento_codigoQR_key" ON "PaseEstacionamiento"("codigoQR");
CREATE TABLE "new_TarifaEstacionamiento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "funcionId" INTEGER NOT NULL,
    "playaId" INTEGER NOT NULL,
    "precio" INTEGER NOT NULL,
    "cupoHabilitado" INTEGER NOT NULL,
    "habilitada" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TarifaEstacionamiento_funcionId_fkey" FOREIGN KEY ("funcionId") REFERENCES "Funcion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TarifaEstacionamiento_playaId_fkey" FOREIGN KEY ("playaId") REFERENCES "PlayaEstacionamiento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TarifaEstacionamiento" ("cupoHabilitado", "funcionId", "id", "playaId", "precio") SELECT "cupoHabilitado", "funcionId", "id", "playaId", "precio" FROM "TarifaEstacionamiento";
DROP TABLE "TarifaEstacionamiento";
ALTER TABLE "new_TarifaEstacionamiento" RENAME TO "TarifaEstacionamiento";
CREATE UNIQUE INDEX "TarifaEstacionamiento_funcionId_playaId_key" ON "TarifaEstacionamiento"("funcionId", "playaId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
