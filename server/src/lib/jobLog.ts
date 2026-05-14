import { prisma } from './prisma.js';
import { logger } from './logger.js';

export type JobLogLevel = 'info' | 'warn' | 'error';

export async function appendJobLog(
  siteJobId: string,
  level: JobLogLevel,
  message: string,
  metadata?: unknown,
) {
  try {
    await prisma.jobLog.create({
      data: {
        siteJobId,
        level,
        message,
        metadata: metadata == null ? undefined : (metadata as object),
      },
    });
  } catch (err) {
    logger.error({ err, siteJobId, message }, 'failed to write job log');
  }
}
