import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { bullConnection } from '../lib/redis.js';
import { QUEUE_NAMES, type DesignRefreshJobData } from '../lib/queues.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { appendJobLog } from '../lib/jobLog.js';
import { buildDesignSuggestionForLead } from '../services/designSuggestion.js';

export function startRefreshSiteDesignWorker() {
  const worker = new Worker<DesignRefreshJobData>(
    QUEUE_NAMES.designRefresh,
    async (job) => {
      const { siteJobId, leadId } = job.data;
      logger.info({ siteJobId, leadId }, 'refreshSiteDesign: start');
      await prisma.siteJob.update({
        where: { id: siteJobId },
        data: { status: 'running', startedAt: new Date(), attemptCount: { increment: 1 } },
      });
      await appendJobLog(siteJobId, 'info', 'Starting AI design direction refresh');

      try {
        await appendJobLog(siteJobId, 'info', 'Building context from lead sources');
        const result = await buildDesignSuggestionForLead(leadId);
        await appendJobLog(
          siteJobId,
          'info',
          `Design brief generated (${result.usage.provider}/${result.usage.model})`,
        );

        await prisma.leadSource.create({
          data: {
            leadId,
            sourceType: 'site_design_suggestion',
            rawData: {
              usage: result.usage,
            } as unknown as Prisma.InputJsonValue,
            extractedData: result.designBrief as Prisma.InputJsonValue,
          },
        });

        await prisma.siteJob.update({
          where: { id: siteJobId },
          data: {
            status: 'succeeded',
            completedAt: new Date(),
            modelProvider: result.usage.provider,
            modelName: result.usage.model,
            outputPayload: { designBrief: result.designBrief } as Prisma.InputJsonValue,
          },
        });
        await appendJobLog(siteJobId, 'info', 'Design direction refresh complete');
        return { ok: true, designBrief: result.designBrief };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        logger.error({ err, siteJobId }, 'refreshSiteDesign failed');
        await prisma.siteJob.update({
          where: { id: siteJobId },
          data: { status: 'failed', completedAt: new Date(), errorMessage: msg },
        });
        await appendJobLog(siteJobId, 'error', msg);
        throw err;
      }
    },
    { connection: { url: bullConnection.url }, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err?.message }, 'design-refresh worker job failed');
  });
  return worker;
}
