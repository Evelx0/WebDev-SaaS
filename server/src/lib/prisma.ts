import { PrismaClient } from '@prisma/client';

// The dev-mode hot-reload cache uses a single global to avoid
// recreating Prisma clients on every tsx restart.
declare global {
  // eslint-disable-next-line no-var
  var __leadPanelPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__leadPanelPrisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') {
  global.__leadPanelPrisma = prisma;
}
