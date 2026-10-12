import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isProd } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: isProd ? ['error'] : ['warn', 'error'],
  });
}

/** Single Prisma client (reused across `tsx watch` reloads in dev). */
export const prisma = globalForPrisma.prisma ?? createClient();
if (!isProd) globalForPrisma.prisma = prisma;
