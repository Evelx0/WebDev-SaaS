import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import {
  leadEnrichmentQueue,
  designRefreshQueue,
  siteGenerationQueue,
  siteDeploymentQueue,
} from '../lib/queues.js';
import { HttpError } from '../middleware/error.js';
import { jobsQuerySchema, retryPayloadSchema, JOB_STATUSES } from '../schemas/index.js';
import { getGenerationUsage, hasUsableVercelConfig } from '../services/userSettings.js';

export const jobsRouter = Router();

function leadAccessWhere(req: { session?: { sub: string; role: string } }) {
  return req.session?.role === 'admin' ? {} : { createdByUserId: req.session!.sub };
}

async function assertCanQueueGeneration(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, vercelApiTokenEnc: true, vercelProjectPrefix: true, openrouterApiKeyEnc: true },
  });
  if (user?.role !== 'admin' && (!user || !hasUsableVercelConfig(user))) {
    throw new HttpError(400, 'vercel_settings_required', 'Vercel settings are required before generating demo sites.');
  }
  if (user?.role === 'admin' || user?.openrouterApiKeyEnc) return;
  const usage = await getGenerationUsage(userId);
  if (usage.limit != null && usage.used >= usage.limit) {
    throw new HttpError(429, 'generation_limit_reached', `Generation limit reached: ${usage.used}/${usage.limit} in the last 24 hours.`);
  }
}

jobsRouter.get('/', async (req, res, next) => {
  try {
    const { status, leadId } = jobsQuerySchema.parse(req.query);
    const where: Record<string, unknown> = { lead: leadAccessWhere(req) };
    if (status) where.status = status;
    if (leadId) where.leadId = leadId;
    const jobs = await prisma.siteJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { lead: { select: { id: true, businessName: true } } },
    });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/:jobId', async (req, res, next) => {
  try {
    const job = await prisma.siteJob.findFirst({
      where: { id: req.params.jobId, lead: leadAccessWhere(req) },
      include: {
        lead: { select: { id: true, businessName: true } },
        logs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!job) throw new HttpError(404, 'job_not_found');
    res.json(job);
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/:jobId/logs', async (req, res, next) => {
  try {
    const job = await prisma.siteJob.findFirst({
      where: { id: req.params.jobId, lead: leadAccessWhere(req) },
      select: { id: true },
    });
    if (!job) throw new HttpError(404, 'job_not_found');
    const logs = await prisma.jobLog.findMany({
      where: { siteJobId: job.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/:jobId/retry', async (req, res, next) => {
  try {
    const job = await prisma.siteJob.findFirst({ where: { id: req.params.jobId, lead: leadAccessWhere(req) } });
    if (!job) throw new HttpError(404, 'job_not_found');
    if (job.status === 'running' || job.status === 'queued') {
      throw new HttpError(400, 'job_already_active');
    }
    const lead = await prisma.lead.findUnique({ where: { id: job.leadId } });
    if (!lead) throw new HttpError(404, 'lead_not_found');

    const updated = await prisma.siteJob.update({
      where: { id: job.id },
      data: { status: 'queued', errorMessage: null, startedAt: null, completedAt: null },
    });

    // Re-queue based on jobType.
    if (job.jobType === 'pull_lead_info') {
      await leadEnrichmentQueue.add(
        'pull-info',
        { siteJobId: job.id, leadId: lead.id, googleProfileUrl: lead.googleProfileUrl },
        { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
      );
    } else if (job.jobType === 'refresh_site_design') {
      await designRefreshQueue.add(
        'refresh-site-design',
        { siteJobId: job.id, leadId: lead.id },
        { attempts: 2, backoff: { type: 'exponential', delay: 5_000 } },
      );
    } else if (job.jobType === 'generate_site' || job.jobType === 'generate_and_deploy_site') {
      await assertCanQueueGeneration(lead.createdByUserId ?? req.session!.sub);
      const inp = retryPayloadSchema.parse(job.inputPayload ?? {});
      await siteGenerationQueue.add(
        'generate-site',
        {
          siteJobId: job.id,
          leadId: lead.id,
          stylePreference: inp.stylePreference,
          notes: inp.notes,
          autoDeploy: job.jobType === 'generate_and_deploy_site',
        },
        { attempts: 2, backoff: { type: 'exponential', delay: 10_000 } },
      );
    } else if (job.jobType === 'deploy_site') {
      const inp = retryPayloadSchema.parse(job.inputPayload ?? {});
      if (!inp.generatedSiteId) throw new HttpError(400, 'missing_generated_site');
      await siteDeploymentQueue.add(
        'deploy-site',
        { siteJobId: job.id, leadId: lead.id, generatedSiteId: inp.generatedSiteId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
      );
    } else {
      throw new HttpError(400, 'unknown_job_type');
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/:jobId/cancel', async (req, res, next) => {
  try {
    const job = await prisma.siteJob.findFirst({ where: { id: req.params.jobId, lead: leadAccessWhere(req) } });
    if (!job) throw new HttpError(404, 'job_not_found');
    if (job.status !== 'running' && job.status !== 'queued') {
      throw new HttpError(400, 'job_not_active', 'Only running or queued jobs can be cancelled.');
    }
    const updated = await prisma.siteJob.update({
      where: { id: job.id },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Remove a single completed/failed/cancelled job from history (does not cancel active jobs).
jobsRouter.delete('/:jobId', async (req, res, next) => {
  try {
    const job = await prisma.siteJob.findFirst({ where: { id: req.params.jobId, lead: leadAccessWhere(req) } });
    if (!job) throw new HttpError(404, 'job_not_found');
    if (job.status === 'running' || job.status === 'queued') {
      throw new HttpError(400, 'job_active', 'Cancel the job before removing it from history.');
    }
    await prisma.siteJob.delete({ where: { id: req.params.jobId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Bulk clear all completed/failed/cancelled jobs from history. Optional ?leadId= filter.
jobsRouter.delete('/', async (req, res, next) => {
  try {
    const { leadId } = jobsQuerySchema.parse(req.query);
    const terminalStatuses = JOB_STATUSES.filter((s) => s === 'succeeded' || s === 'failed' || s === 'cancelled');
    const where: Record<string, unknown> = { status: { in: terminalStatuses } };
    if (leadId) where.leadId = leadId;
    where.lead = leadAccessWhere(req);
    const deleted = await prisma.siteJob.deleteMany({ where });
    res.json({ ok: true, count: deleted.count });
  } catch (err) {
    next(err);
  }
});
