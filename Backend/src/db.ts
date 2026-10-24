import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** Cliente dentro de una transacción interactiva (`prisma.$transaction(async (tx) => ...)`). */
export type Tx = Prisma.TransactionClient;
