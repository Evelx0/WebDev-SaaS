/**
 * One-shot bootstrap: ensures an admin user exists if ADMIN_EMAIL/PASSWORD set.
 */
import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { env } from './lib/env.js';

export async function ensureAdminUser() {
  const userCount = await prisma.user.count();
  if (userCount > 0) return;
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    logger.warn('No users in DB and ADMIN_EMAIL/PASSWORD not set — login will be impossible.');
    return;
  }
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await prisma.user.create({
    data: { email: env.ADMIN_EMAIL, passwordHash, name: 'Admin', role: 'admin' },
  });
  logger.info({ email: env.ADMIN_EMAIL }, 'Bootstrapped initial admin user');
}
