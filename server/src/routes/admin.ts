import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/error.js';
import { createUserSchema, updateUserSchema } from '../schemas/index.js';

export const adminRouter = Router();

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  usageLimitPer24h: true,
  vercelTeamId: true,
  vercelProjectPrefix: true,
  vercelApiTokenEnc: true,
  openrouterApiKeyEnc: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      leads: true,
    },
  },
} as const;

function presentUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  usageLimitPer24h: number;
  vercelTeamId: string | null;
  vercelProjectPrefix: string | null;
  vercelApiTokenEnc: string | null;
  openrouterApiKeyEnc: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { leads: number };
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    usageLimitPer24h: user.usageLimitPer24h,
    vercelTeamId: user.vercelTeamId,
    vercelProjectPrefix: user.vercelProjectPrefix,
    hasVercelConfig: user.role === 'admin' || Boolean(user.vercelApiTokenEnc && user.vercelProjectPrefix),
    hasOpenRouterKey: Boolean(user.openrouterApiKeyEnc),
    leadCount: user._count?.leads ?? 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

adminRouter.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: userSelect,
    });
    res.json(users.map(presentUser));
  } catch (err) {
    next(err);
  }
});

type UsageBucket = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reportedCostUsd: number;
  calls: number;
};

type UsageAccumulator = {
  platform: UsageBucket;
  userKeys: UsageBucket;
  byModel: Map<string, UsageBucket & { model: string; apiKeySource: 'platform' | 'user' }>;
};

function emptyUsageBucket(): UsageBucket {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, reportedCostUsd: 0, calls: 0 };
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function addUsage(acc: UsageAccumulator, usage: unknown) {
  if (!usage || typeof usage !== 'object') return;
  const u = usage as Record<string, unknown>;
  const nestedUsage = u.usage && typeof u.usage === 'object'
    ? u.usage as Record<string, unknown>
    : null;
  const source = (u.apiKeySource ?? nestedUsage?.apiKeySource) === 'user' ? 'user' : 'platform';
  const inputTokens = readNumber(u.inputTokens ?? nestedUsage?.inputTokens ?? nestedUsage?.prompt_tokens);
  const outputTokens = readNumber(u.outputTokens ?? nestedUsage?.outputTokens ?? nestedUsage?.completion_tokens);
  const reportedCostUsd = readNumber(u.costUsd ?? u.reportedCostUsd ?? u.cost ?? nestedUsage?.cost);
  const bucket = source === 'user' ? acc.userKeys : acc.platform;
  bucket.inputTokens += inputTokens;
  bucket.outputTokens += outputTokens;
  bucket.totalTokens += inputTokens + outputTokens;
  bucket.reportedCostUsd += reportedCostUsd;
  bucket.calls += 1;

  const provider = typeof (u.provider ?? nestedUsage?.provider) === 'string'
    ? String(u.provider ?? nestedUsage?.provider)
    : 'unknown';
  const modelName = typeof (u.model ?? nestedUsage?.model) === 'string'
    ? String(u.model ?? nestedUsage?.model)
    : 'unknown';
  const model = `${provider}/${modelName}`;
  const modelBucket = acc.byModel.get(`${source}:${model}`) ?? {
    ...emptyUsageBucket(),
    model,
    apiKeySource: source,
  };
  modelBucket.inputTokens += inputTokens;
  modelBucket.outputTokens += outputTokens;
  modelBucket.totalTokens += inputTokens + outputTokens;
  modelBucket.reportedCostUsd += reportedCostUsd;
  modelBucket.calls += 1;
  acc.byModel.set(`${source}:${model}`, modelBucket);
}

function addUsageFromGeneratedSite(acc: UsageAccumulator, meta: unknown) {
  const record = meta && typeof meta === 'object' ? meta as Record<string, unknown> : {};
  const usages = record.aiUsage && typeof record.aiUsage === 'object'
    ? Object.values(record.aiUsage as Record<string, unknown>)
    : [record.briefModelUsage, record.htmlModelUsage];
  usages.forEach((usage) => addUsage(acc, usage));
}

function addUsageFromRawRecord(acc: UsageAccumulator, raw: unknown) {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (record.usage) {
    addUsage(acc, record.usage);
    return;
  }
  addUsage(acc, record);
}

adminRouter.get('/logs', async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [jobs, sites, users, aiSources, salesPitches] = await Promise.all([
      prisma.siteJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          lead: {
            select: {
              id: true,
              businessName: true,
              createdBy: { select: { id: true, email: true, name: true, role: true } },
            },
          },
        },
      }),
      prisma.generatedSite.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          createdAt: true,
          generationMetadata: true,
          lead: {
            select: {
              createdBy: { select: { id: true, email: true, role: true } },
            },
          },
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          openrouterApiKeyEnc: true,
          vercelApiTokenEnc: true,
          vercelProjectPrefix: true,
          _count: { select: { leads: true } },
        },
      }),
      prisma.leadSource.findMany({
        where: {
          createdAt: { gte: since },
          sourceType: {
            in: [
              'site_design_suggestion',
              'current_website_scrape',
              'web_research',
              'competitor_scout',
            ],
          },
        },
        select: { rawData: true },
      }),
      prisma.salesPitch.findMany({
        where: { createdAt: { gte: since } },
        select: { rawResponse: true },
      }),
    ]);

    const usage: UsageAccumulator = {
      platform: emptyUsageBucket(),
      userKeys: emptyUsageBucket(),
      byModel: new Map(),
    };
    sites.forEach((site) => addUsageFromGeneratedSite(usage, site.generationMetadata));
    aiSources.forEach((source) => addUsageFromRawRecord(usage, source.rawData));
    salesPitches.forEach((pitch) => addUsageFromRawRecord(usage, pitch.rawResponse));

    const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
    const failedJobs = jobs.filter((job) => job.status === 'failed');

    res.json({
      generatedSince: since,
      summary: {
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.isActive).length,
        usersWithOwnOpenRouter: users.filter((u) => Boolean(u.openrouterApiKeyEnc)).length,
        usersWithVercel: users.filter((u) => u.role === 'admin' || (u.vercelApiTokenEnc && u.vercelProjectPrefix)).length,
        activeJobs: activeJobs.length,
        failedJobs: failedJobs.length,
        recentJobs: jobs.length,
        generatedSites30d: sites.length,
      },
      usage: {
        platform: usage.platform,
        userKeys: usage.userKeys,
        byModel: [...usage.byModel.values()]
          .sort((a, b) => b.totalTokens - a.totalTokens)
          .slice(0, 20),
      },
      activeJobs: activeJobs.map((job) => ({
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        attemptCount: job.attemptCount,
        modelProvider: job.modelProvider,
        modelName: job.modelName,
        lead: job.lead,
      })),
      recentJobs: jobs.map((job) => ({
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        attemptCount: job.attemptCount,
        modelProvider: job.modelProvider,
        modelName: job.modelName,
        errorMessage: job.errorMessage,
        lead: job.lead,
      })),
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        hasOpenRouterKey: Boolean(user.openrouterApiKeyEnc),
        hasVercelConfig: user.role === 'admin' || Boolean(user.vercelApiTokenEnc && user.vercelProjectPrefix),
        leadCount: user._count.leads,
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users', async (req, res, next) => {
  try {
    const input = createUserSchema.parse(req.body ?? {});
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name || null,
        role: input.role,
        isActive: input.isActive,
        usageLimitPer24h: input.usageLimitPer24h,
      },
      select: userSelect,
    });
    res.status(201).json(presentUser(user));
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/users/:userId', async (req, res, next) => {
  try {
    const input = updateUserSchema.parse(req.body ?? {});
    const data: {
      email?: string;
      passwordHash?: string;
      name?: string | null;
      role?: string;
      isActive?: boolean;
      usageLimitPer24h?: number;
    } = {};
    if (input.email !== undefined) data.email = input.email;
    if (input.password !== undefined) data.passwordHash = await bcrypt.hash(input.password, 12);
    if (input.name !== undefined) data.name = input.name || null;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.usageLimitPer24h !== undefined) data.usageLimitPer24h = input.usageLimitPer24h;

    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data,
      select: userSelect,
    });
    res.json(presentUser(user));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/users/:userId', async (req, res, next) => {
  try {
    if (req.params.userId === req.session?.sub) {
      throw new HttpError(400, 'cannot_delete_self', 'You cannot delete your own admin account.');
    }
    const leadCount = await prisma.lead.count({ where: { createdByUserId: req.params.userId } });
    if (leadCount > 0) {
      throw new HttpError(400, 'user_has_leads', 'Disable users with existing leads instead of deleting them.');
    }
    await prisma.user.delete({ where: { id: req.params.userId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
