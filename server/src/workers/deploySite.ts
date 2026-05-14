import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { bullConnection } from '../lib/redis.js';
import { QUEUE_NAMES, type DeploySiteJobData } from '../lib/queues.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { appendJobLog } from '../lib/jobLog.js';
import { deployStaticDirectoryToVercel } from '../services/vercel.js';
import { auditBothSites } from '../services/pageSpeedAudit.js';
import { getUserVercelConfig } from '../services/userSettings.js';

export function startDeploySiteWorker() {
  const worker = new Worker<DeploySiteJobData>(
    QUEUE_NAMES.siteDeployment,
    async (job) => {
      const { siteJobId, leadId, generatedSiteId, brandName } = job.data;
      logger.info({ siteJobId, leadId, generatedSiteId }, 'deploySite: start');
      await prisma.siteJob.update({
        where: { id: siteJobId },
        data: { status: 'running', startedAt: new Date(), attemptCount: { increment: 1 } },
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { siteStatus: 'deploying', leadStatus: 'site_deploying', lastError: null },
      });
      await appendJobLog(siteJobId, 'info', 'Starting Vercel deployment');

      try {
        const generated = await prisma.generatedSite.findUnique({ where: { id: generatedSiteId } });
        if (!generated) throw new Error('Generated site not found');
        if (!generated.sourceFilesPath) throw new Error('Generated site has no source files path');
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead?.createdByUserId) throw new Error('Lead has no owning user for Vercel deployment');
        const vercel = await getUserVercelConfig(lead.createdByUserId);
        if (!vercel) throw new Error('Vercel settings are required before deployment');

        const result = await deployStaticDirectoryToVercel({
          leadId,
          generatedSiteId,
          directory: generated.sourceFilesPath,
          brandName,
          vercel,
        });

        if (result.mock) {
          await appendJobLog(siteJobId, 'warn', 'Vercel API token not configured — using mock URL', {
            url: result.url,
          });
        } else {
          await appendJobLog(siteJobId, 'info', `Deployed: ${result.url}`);
        }

        await prisma.generatedSite.update({
          where: { id: generatedSiteId },
          data: {
            vercelUrl: result.url,
            vercelDeploymentId: result.deploymentId,
            vercelProjectId: result.projectId,
          },
        });

        await prisma.lead.update({
          where: { id: leadId },
          data: {
            vercelUrl: result.url,
            siteStatus: 'deployed',
            leadStatus: 'site_deployed',
          },
        });

        // W3: PageSpeed audit — best-effort, never fails the job.
        if (!result.mock) {
          await appendJobLog(siteJobId, 'info', 'Running PageSpeed audit (W3)');
          const pageSpeedAudit = await auditBothSites(
            lead?.existingWebsiteUrl ?? null,
            result.url,
          ).catch(() => ({ old: null, new: null }));

          const currentMeta = (generated.generationMetadata ?? {}) as Record<string, unknown>;
          await prisma.generatedSite.update({
            where: { id: generatedSiteId },
            data: {
              generationMetadata: {
                ...currentMeta,
                pageSpeedAudit,
              } as Prisma.InputJsonValue,
            },
          });

          const newScore = pageSpeedAudit.new?.performanceScore;
          const oldScore = pageSpeedAudit.old?.performanceScore;
          const msg = newScore != null
            ? `W3 PageSpeed: new=${newScore}${oldScore != null ? `, old=${oldScore}` : ''}`
            : 'W3 PageSpeed audit returned no scores';
          await appendJobLog(siteJobId, 'info', msg);
        }

        await prisma.siteJob.update({
          where: { id: siteJobId },
          data: {
            status: 'succeeded',
            completedAt: new Date(),
            outputPayload: result as unknown as Prisma.InputJsonValue,
          },
        });
        return { ok: true, url: result.url };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        logger.error({ err, siteJobId }, 'deploySite failed');
        await prisma.siteJob.update({
          where: { id: siteJobId },
          data: { status: 'failed', completedAt: new Date(), errorMessage: msg },
        });
        await prisma.lead.update({
          where: { id: leadId },
          data: { siteStatus: 'failed', leadStatus: 'site_failed', lastError: msg },
        });
        await appendJobLog(siteJobId, 'error', msg);
        throw err;
      }
    },
    { connection: { url: bullConnection.url }, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err?.message }, 'site-deployment worker job failed');
  });
  return worker;
}
