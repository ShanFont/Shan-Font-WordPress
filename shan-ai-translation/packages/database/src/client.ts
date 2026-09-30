import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as { satPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.satPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === '1' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.satPrisma = prisma;

export type DbClient = PrismaClient;
