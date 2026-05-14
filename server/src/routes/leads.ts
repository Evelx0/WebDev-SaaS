import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  createLeadSchema,
  updateLeadSchema,
  generateSiteSchema,
  generateSalesPitchInputSchema,
  leadsQuerySchema,
} from '../schemas/index.js';
import { HttpError } from '../middleware/error.js';
import {
  leadEnrichmentQueue,
  designRefreshQueue,
  siteGenerationQueue,
  siteDeploymentQueue,
} from '../lib/queues.js';
import { appendJobLog } from '../lib/jobLog.js';
import { generateSalesPitch } from '../services/salesPitch.js';
import { AiGatewayError } from '../services/aiGateway.js';
import { deleteVercelProject } from '../services/vercel.js';
import { buildDesignSuggestionForLead } from '../services/designSuggestion.js';
import { getGenerationUsage, getUserOpenRouterConfig, hasUsableVercelConfig } from '../services/userSettings.js';

export const leadsRouter = Router();

function isAdmin(req: { session?: { role: string } }) {
  return req.session?.role === 'admin';
}

function leadOwnerWhere(req: { session?: { sub: string; role: string } }): Prisma.LeadWhereInput {
  return isAdmin(req) ? {} : { createdByUserId: req.session!.sub };
}

async function findAccessibleLead(req: { session?: { sub: string; role: string } }, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...leadOwnerWhere(req) },
  });
  if (!lead) throw new HttpError(404, 'lead_not_found');
  return lead;
}

async function assertHasVercelConfig(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      vercelApiTokenEnc: true,
      vercelProjectPrefix: true,
    },
  });
  if (user?.role === 'admin') return;
  if (!user || !hasUsableVercelConfig(user)) {
    throw new HttpError(
      400,
      'vercel_settings_required',
      'Add your Vercel API token and project prefix in account settings before generating demo sites.',
    );
  }
}

async function assertCanQueueGeneration(userId: string) {
  await assertHasVercelConfig(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, openrouterApiKeyEnc: true },
  });
  if (user?.role === 'admin' || user?.openrouterApiKeyEnc) return;
  const usage = await getGenerationUsage(userId);
  if (usage.limit != null && usage.used >= usage.limit) {
    throw new HttpError(
      429,
      'generation_limit_reached',
      `Generation limit reached: ${usage.used}/${usage.limit} in the last 24 hours.`,
    );
  }
}

async function getLatestResearchForLead(leadId: string) {
  const researchSources = await prisma.leadSource.findMany({
    where: {
      leadId,
      sourceType: { in: ['web_research', 'competitor_scout', 'current_website_scrape'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  return {
    researchSource: researchSources.find((s) => s.sourceType === 'web_research') ?? null,
    competitorSource: researchSources.find((s) => s.sourceType === 'competitor_scout') ?? null,
    currentWebsiteSource: researchSources.find((s) => s.sourceType === 'current_website_scrape') ?? null,
  };
}

// List
leadsRouter.get('/', async (req, res, next) => {
  try {
    const { status, q } = leadsQuerySchema.parse(req.query);
    const where: Prisma.LeadWhereInput = { ...leadOwnerWhere(req) };
    if (status) where.leadStatus = status;
    if (q) where.businessName = { contains: q, mode: 'insensitive' };
    const [leads, total] = await prisma.$transaction([
      prisma.lead.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200 }),
      prisma.lead.count({ where }),
    ]);
    res.json({ leads, total });
  } catch (err) {
    next(err);
  }
});

// Create
leadsRouter.post('/', async (req, res, next) => {
  try {
    const input = createLeadSchema.parse(req.body);
    const lead = await prisma.lead.create({
      data: {
        googleProfileUrl: input.googleProfileUrl,
        notes: input.notes,
        leadStatus: 'new',
        siteStatus: 'not_started',
        createdByUserId: req.session?.sub,
      },
    });
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

// Detail
leadsRouter.get('/:leadId', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.leadId, ...leadOwnerWhere(req) },
      include: {
        sources: { orderBy: { createdAt: 'desc' } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 25 },
        generatedSites: { orderBy: { version: 'desc' } },
        salesPitches: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!lead) throw new HttpError(404, 'lead_not_found');
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// Generate editable design-direction fields synchronously.
// Kept for compatibility; the UI uses the queued endpoint below to avoid 504s.
leadsRouter.post('/:leadId/site-design-suggestions', async (req, res, next) => {
  try {
    await findAccessibleLead(req, req.params.leadId);
    let result;
    try {
      result = await buildDesignSuggestionForLead(req.params.leadId);
    } catch (err) {
      if (err instanceof AiGatewayError) {
        throw new HttpError(502, 'design_brief_failed', err.message);
      }
      throw err;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Queue AI design-direction refresh so logs appear in the normal Jobs UI.
leadsRouter.post('/:leadId/site-design-suggestions/queue', async (req, res, next) => {
  try {
    const lead = await findAccessibleLead(req, req.params.leadId);
    if (!lead.businessName || !lead.category) {
      throw new HttpError(
        400,
        'missing_lead_fields',
        'Lead is missing businessName or category. Edit the lead before refreshing design suggestions.',
      );
    }

    const job = await prisma.siteJob.create({
      data: {
        leadId: lead.id,
        jobType: 'refresh_site_design',
        status: 'queued',
        inputPayload: { source: 'lead_detail_ai_refresh' } as Prisma.InputJsonValue,
      },
    });
    await designRefreshQueue.add(
      'refresh-site-design',
      { siteJobId: job.id, leadId: lead.id },
      { attempts: 2, backoff: { type: 'exponential', delay: 5_000 } },
    );
    await appendJobLog(job.id, 'info', 'Queued AI design direction refresh from lead detail page', {
      businessName: lead.businessName,
      category: lead.category,
    });
    res.status(202).json({ jobId: job.id, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// Update
leadsRouter.patch('/:leadId', async (req, res, next) => {
  try {
    const input = updateLeadSchema.parse(req.body);
    await findAccessibleLead(req, req.params.leadId);
    const lead = await prisma.lead.update({
      where: { id: req.params.leadId },
      data: input,
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// Delete — permanently removes lead + all associated data and Vercel project(s)
leadsRouter.delete('/:leadId', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.leadId, ...leadOwnerWhere(req) },
      include: { generatedSites: { select: { vercelProjectId: true } } },
    });
    if (!lead) throw new HttpError(404, 'lead_not_found');

    // Best-effort: delete every distinct Vercel project. Never blocks the DB delete.
    const projectIds = [...new Set(
      lead.generatedSites.map((s) => s.vercelProjectId).filter(Boolean) as string[]
    )];
    const vercelErrors: string[] = [];
    await Promise.allSettled(
      projectIds.map((pid) =>
        deleteVercelProject(pid).catch(() => { vercelErrors.push(pid); })
      )
    );

    await prisma.lead.delete({ where: { id: req.params.leadId } });
    res.json({ ok: true, ...(vercelErrors.length ? { vercelErrors } : {}) });
  } catch (err) {
    next(err);
  }
});

// Pull info
leadsRouter.post('/:leadId/pull-info', async (req, res, next) => {
  try {
    const lead = await findAccessibleLead(req, req.params.leadId);

    const job = await prisma.siteJob.create({
      data: {
        leadId: lead.id,
        jobType: 'pull_lead_info',
        status: 'queued',
        inputPayload: { googleProfileUrl: lead.googleProfileUrl },
      },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { leadStatus: 'info_pull_queued' },
    });
    await leadEnrichmentQueue.add(
      'pull-info',
      { siteJobId: job.id, leadId: lead.id, googleProfileUrl: lead.googleProfileUrl },
      { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
    );
    res.status(202).json({ jobId: job.id, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// Shared helper: validates lead, creates the SiteJob, updates lead status, and enqueues the job.
async function queueSiteGeneration(
  leadId: string,
  jobType: 'generate_site' | 'generate_and_deploy_site',
  input: {
    stylePreference?: string;
    notes?: string;
    brandName?: string;
    siteDesignBrief?: unknown;
  },
  autoDeploy: boolean,
): Promise<string> {
  const job = await prisma.siteJob.create({
    data: {
      leadId,
      jobType,
      status: 'queued',
      inputPayload: input as Prisma.InputJsonValue,
    },
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: { siteStatus: 'queued', leadStatus: 'site_generation_queued' },
  });
  await siteGenerationQueue.add(
    'generate-site',
    {
      siteJobId: job.id,
      leadId,
      stylePreference: input.stylePreference,
      notes: input.notes,
      brandName: input.brandName || undefined,
      siteDesignBrief: input.siteDesignBrief,
      autoDeploy,
    },
    { attempts: 2, backoff: { type: 'exponential', delay: 10_000 } },
  );
  return job.id;
}

// Generate-and-deploy site (single button entry)
leadsRouter.post('/:leadId/generate-and-deploy-site', async (req, res, next) => {
  try {
    const input = generateSiteSchema.parse(req.body ?? {});
    const lead = await findAccessibleLead(req, req.params.leadId);
    await assertHasVercelConfig(lead.createdByUserId ?? req.session!.sub);
    if (!lead.businessName || !lead.category) {
      throw new HttpError(
        400,
        'missing_lead_fields',
        'Lead is missing businessName or category. Edit the lead first.',
      );
    }
    const jobId = await queueSiteGeneration(lead.id, 'generate_and_deploy_site', input, true);
    res.status(202).json({ jobId, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// Generate site only
leadsRouter.post('/:leadId/generate-site', async (req, res, next) => {
  try {
    const input = generateSiteSchema.parse(req.body ?? {});
    const lead = await findAccessibleLead(req, req.params.leadId);
    await assertCanQueueGeneration(lead.createdByUserId ?? req.session!.sub);
    if (!lead.businessName || !lead.category) {
      throw new HttpError(400, 'missing_lead_fields', 'Lead is missing businessName or category.');
    }
    const jobId = await queueSiteGeneration(lead.id, 'generate_site', input, false);
    res.status(202).json({ jobId, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// Deploy latest generated site
leadsRouter.post('/:leadId/deploy-site', async (req, res, next) => {
  try {
    const lead = await findAccessibleLead(req, req.params.leadId);
    const latest = await prisma.generatedSite.findFirst({
      where: { leadId: lead.id },
      orderBy: { version: 'desc' },
    });
    if (!latest) throw new HttpError(400, 'no_generated_site', 'No generated site to deploy');
    await assertCanQueueGeneration(lead.createdByUserId ?? req.session!.sub);

    const job = await prisma.siteJob.create({
      data: {
        leadId: lead.id,
        jobType: 'deploy_site',
        status: 'queued',
        inputPayload: { generatedSiteId: latest.id },
      },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { siteStatus: 'queued', leadStatus: 'site_deploying' },
    });
    await siteDeploymentQueue.add(
      'deploy-site',
      { siteJobId: job.id, leadId: lead.id, generatedSiteId: latest.id, brandName: lead.businessName ?? undefined },
      { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
    );
    res.status(202).json({ jobId: job.id, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// Delete a single generated-site deployment from Vercel and the database
leadsRouter.delete('/:leadId/generated-sites/:siteId', async (req, res, next) => {
  try {
    const site = await prisma.generatedSite.findFirst({
      where: {
        id: req.params.siteId,
        leadId: req.params.leadId,
        lead: leadOwnerWhere(req),
      },
    });
    if (!site) throw new HttpError(404, 'site_not_found');

    if (site.vercelProjectId) {
      try {
        await deleteVercelProject(site.vercelProjectId);
      } catch {
        // Best-effort — never block the DB delete on a Vercel failure
      }
    }

    await prisma.generatedSite.delete({ where: { id: site.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Generated sites for a lead
leadsRouter.get('/:leadId/generated-sites', async (req, res, next) => {
  try {
    const sites = await prisma.generatedSite.findMany({
      where: { leadId: req.params.leadId, lead: leadOwnerWhere(req) },
      orderBy: { version: 'desc' },
    });
    res.json(sites);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// Sales pitch endpoints
//
// POST /api/leads/:leadId/sales-pitches
//   Generates a tailored outreach pitch for the lead, anchored on either the
//   supplied generatedSiteId or the most recent generated site for the lead.
//   Persists the result to `sales_pitches` and returns the persisted record.
//   Never auto-sends email — the operator copy/pastes from the UI.
//
// GET /api/leads/:leadId/sales-pitches
//   Returns all persisted pitches for a lead, newest first.
// ----------------------------------------------------------------------------
leadsRouter.post('/:leadId/sales-pitches', async (req, res, next) => {
  try {
    const input = generateSalesPitchInputSchema.parse(req.body ?? {});
    const lead = await findAccessibleLead(req, req.params.leadId);
    if (!lead.businessName) {
      throw new HttpError(
        400,
        'missing_lead_fields',
        'Lead is missing businessName. Edit the lead before generating a pitch.',
      );
    }

    // Resolve which generated site this pitch is anchored on. If the operator
    // didn't pick one, default to the most recently created site for this lead.
    let demoSite = null as Awaited<ReturnType<typeof prisma.generatedSite.findFirst>>;
    if (input.generatedSiteId) {
      demoSite = await prisma.generatedSite.findFirst({
        where: { id: input.generatedSiteId, leadId: lead.id },
      });
      if (!demoSite) {
        throw new HttpError(
          404,
          'generated_site_not_found',
          'The supplied generatedSiteId is not associated with this lead.',
        );
      }
    } else {
      demoSite = await prisma.generatedSite.findFirst({
        where: { leadId: lead.id },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Fetch W1/W2 research sources stored during lead enrichment.
    const { researchSource, competitorSource } = await getLatestResearchForLead(lead.id);

    // Fetch W3 PageSpeed data stored in the demo site's generationMetadata.
    const pageSpeedMeta = demoSite?.generationMetadata as Record<string, unknown> | null;
    const pageSpeedData = (pageSpeedMeta?.pageSpeedAudit as {
      old: { performanceScore: number | null; seoScore: number | null } | null;
      new: { performanceScore: number | null; seoScore: number | null } | null;
    } | null) ?? null;

    let result;
    const openRouter = await getUserOpenRouterConfig(lead.createdByUserId ?? req.session!.sub);
    const owner = await prisma.user.findUnique({
      where: { id: lead.createdByUserId ?? req.session!.sub },
      select: { role: true },
    });
    try {
      result = await generateSalesPitch({
        lead: {
          businessName: lead.businessName,
          category: lead.category,
          city: lead.city,
          country: lead.country,
          existingWebsiteUrl: lead.existingWebsiteUrl,
          websiteStatus: lead.websiteStatus,
          notes: lead.notes,
        },
        demo: {
          vercelUrl: demoSite?.vercelUrl ?? lead.vercelUrl ?? null,
          siteTitle: demoSite?.siteTitle ?? null,
          siteSummary: demoSite?.siteSummary ?? null,
        },
        operatorNotes: input.operatorNotes,
        researchData: researchSource
          ? (researchSource.extractedData as {
              categoryInsights: string;
              typicalPainPoints: string[];
              webPresenceNotes: string;
            } | null)
          : null,
        competitorData: competitorSource
          ? (competitorSource.extractedData as {
              competitors: Array<{ name: string; url: string | null }>;
              marketContext: string;
            } | null)
          : null,
        pageSpeedData,
      }, openRouter
        ? {
            openRouterApiKey: openRouter.apiKey,
            openRouterKeySource: openRouter.source,
            disableAnthropic: owner?.role !== 'admin',
          }
        : { disableAnthropic: owner?.role !== 'admin' });
    } catch (err) {
      if (err instanceof AiGatewayError) {
        throw new HttpError(502, 'pitch_generation_failed', err.message);
      }
      throw err;
    }

    const created = await prisma.salesPitch.create({
      data: {
        leadId: lead.id,
        generatedSiteId: demoSite?.id ?? null,
        provider: result.usage.provider,
        model: result.usage.model,
        isMock: result.usage.provider === 'mock',
        subjectLine: result.pitch.subjectLine,
        openingLine: result.pitch.openingLine,
        painPoint: result.pitch.painPoint,
        valueProposition: result.pitch.valueProposition,
        demoReference: result.pitch.demoReference,
        callToAction: result.pitch.callToAction,
        fullEmailDraft: result.pitch.fullEmailDraft,
        linkedinMessage: result.pitch.linkedinMessage,
        operatorNotes: input.operatorNotes || null,
        rawResponse: {
          pitch: result.pitch,
          usage: result.usage,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

leadsRouter.get('/:leadId/sales-pitches', async (req, res, next) => {
  try {
    const pitches = await prisma.salesPitch.findMany({
      where: { leadId: req.params.leadId, lead: leadOwnerWhere(req) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(pitches);
  } catch (err) {
    next(err);
  }
});
