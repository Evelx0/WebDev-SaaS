import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { bullConnection } from '../lib/redis.js';
import { QUEUE_NAMES, siteDeploymentQueue, type GenerateSiteJobData } from '../lib/queues.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { appendJobLog } from '../lib/jobLog.js';
import { generateWebsiteBrief, generateSiteHtml } from '../services/aiGateway.js';
import { writeGeneratedSite } from '../services/siteGenerator.js';
import { getHtmlGenerationSystemPrompt, buildHtmlGenerationPrompt } from '../prompts/index.js';
import { generateImage, buildHeroImagePrompt } from '../services/imageGenerator.js';
import { siteDesignBriefSchema } from '../schemas/index.js';
import { getUserOpenRouterConfig } from '../services/userSettings.js';

export function startGenerateSiteWorker() {
  const worker = new Worker<GenerateSiteJobData>(
    QUEUE_NAMES.siteGeneration,
    async (job) => {
      const { siteJobId, leadId, stylePreference, notes, brandName, autoDeploy } = job.data;
      const parsedDesignBrief = siteDesignBriefSchema.safeParse(job.data.siteDesignBrief);
      const siteDesignBrief = parsedDesignBrief.success ? parsedDesignBrief.data : undefined;
      logger.info({ siteJobId, leadId }, 'generateSite: start');
      await prisma.siteJob.update({
        where: { id: siteJobId },
        data: { status: 'running', startedAt: new Date(), attemptCount: { increment: 1 } },
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { siteStatus: 'generating', leadStatus: 'site_generating', lastError: null },
      });
      await appendJobLog(siteJobId, 'info', 'Starting site generation');

      try {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) throw new Error('Lead not found');
        if (!lead.businessName || !lead.category) {
          throw new Error('Lead is missing businessName or category. Edit the lead first.');
        }
        if (!lead.createdByUserId) throw new Error('Lead has no owning user for AI generation');
        const owner = await prisma.user.findUnique({
          where: { id: lead.createdByUserId },
          select: { role: true },
        });
        const openRouter = await getUserOpenRouterConfig(lead.createdByUserId);
        const aiOpts = openRouter
          ? {
              openRouterApiKey: openRouter.apiKey,
              openRouterKeySource: openRouter.source,
              disableAnthropic: owner?.role !== 'admin',
            }
          : { disableAnthropic: owner?.role !== 'admin' };

        const { brief, usage } = await generateWebsiteBrief({
          businessName: lead.businessName,
          category: lead.category,
          city: lead.city,
          country: lead.country,
          notes,
          stylePreference,
        }, aiOpts);
        await appendJobLog(siteJobId, 'info', `Brief generated (${usage.provider}/${usage.model})`);

        // Generate hero image and HTML concurrently — image generation is
        // independent of HTML model selection so both can start immediately.
        const leadData = {
          businessName: lead.businessName,
          category: lead.category,
          addressLine1: lead.addressLine1,
          city: lead.city,
          postcode: lead.postcode,
          country: lead.country,
          phone: lead.phone,
          existingWebsiteUrl: lead.existingWebsiteUrl,
        };

        // Run image + HTML generation concurrently.
        await appendJobLog(siteJobId, 'info', 'Starting image and HTML generation in parallel');

        const imagePrompt = buildHeroImagePrompt(brief);
        const [heroImage, htmlResult] = await Promise.all([
          generateImage(imagePrompt, {
            filename: 'hero.jpg',
            onAttempt: (model, outcome, detail) => {
              const msg = detail
                ? `IMG [${outcome}] ${model} — ${detail}`
                : `IMG [${outcome}] ${model}`;
              appendJobLog(siteJobId, outcome === 'error' ? 'warn' : 'info', msg).catch(() => {});
            },
          }),
          generateSiteHtml(
            getHtmlGenerationSystemPrompt(),
            buildHtmlGenerationPrompt(brief, lead.city, stylePreference, brandName, siteDesignBrief),
            (modelId, outcome, detail) => {
              const msg = detail
                ? `HTML [${outcome}] ${modelId} — ${detail}`
                : `HTML [${outcome}] ${modelId}`;
              appendJobLog(siteJobId, outcome === 'error' ? 'warn' : 'info', msg).catch(() => {});
            },
            aiOpts,
          ),
        ]);

        if (heroImage) {
          await appendJobLog(siteJobId, 'info', `Hero image ready (${heroImage.model}, ${heroImage.data.length} bytes)`);
        } else {
          await appendJobLog(siteJobId, 'warn', 'Hero image unavailable — HTML will use CSS background');
        }

        if (htmlResult.htmlSource === 'ai') {
          await appendJobLog(
            siteJobId,
            'info',
            `HTML generated via ${htmlResult.usage.model} (tried ${htmlResult.modelsAttempted.length} model(s))`,
          );
        } else {
          await appendJobLog(siteJobId, 'warn', 'AI HTML generation unavailable — using deterministic fallback');
        }

        // Replace image placeholders with the co-located filename so both
        // index.html and gallery.html reference the image via a relative URL.
        const imageUrl = heroImage?.filename ?? '';
        const processedHtml = (htmlResult.html ?? '')
          .replace(/___HERO_IMAGE___/g, imageUrl)
          .replace(/___ABOUT_IMAGE___/g, imageUrl);

        // Determine version: count existing sites for this lead.
        const existingCount = await prisma.generatedSite.count({ where: { leadId } });
        const version = existingCount + 1;
        const generatedSiteId = uuidv4();

        const result = await writeGeneratedSite({
          leadId,
          generatedSiteId,
          brief,
          lead: leadData,
          preGeneratedHtml: processedHtml || undefined,
          preGeneratedImages: heroImage ? [heroImage] : [],
        });
        await appendJobLog(
          siteJobId,
          'info',
          `Site written: ${result.files.length} files (${result.htmlSource})`,
        );

        const generated = await prisma.generatedSite.create({
          data: {
            id: generatedSiteId,
            leadId,
            siteJobId,
            version,
            siteTitle: result.title,
            siteSummary: result.summary,
            sourceFilesPath: result.outputDir,
            generationPrompt: JSON.stringify({ stylePreference, notes, brandName, siteDesignBrief }),
            generationMetadata: {
              brief,
              siteDesignBrief: siteDesignBrief ?? null,
              briefModelUsage: usage,
              htmlModelUsage: htmlResult.usage,
              aiUsage: {
                brief: usage,
                html: htmlResult.usage,
              },
              aiKeySource: htmlResult.usage.apiKeySource ?? usage.apiKeySource ?? null,
              htmlSource: result.htmlSource,
              htmlValidation: result.htmlSource === 'ai' ? 'passed' : 'deterministic_fallback',
              htmlModelsAttempted: htmlResult.modelsAttempted,
              imageModel: heroImage?.model ?? null,
              imageGenerated: !!heroImage,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        // Record the model that actually produced the HTML (or brief model on fallback).
        const htmlModel = result.htmlSource === 'ai' ? htmlResult.usage : usage;
        await prisma.siteJob.update({
          where: { id: siteJobId },
          data: {
            status: 'succeeded',
            completedAt: new Date(),
            modelProvider: htmlModel.provider,
            modelName: htmlModel.model,
            outputPayload: {
              generatedSiteId: generated.id,
              files: result.files,
              htmlSource: result.htmlSource,
              modelsAttempted: htmlResult.modelsAttempted,
              aiUsage: {
                brief: usage,
                html: htmlResult.usage,
              },
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await prisma.lead.update({
          where: { id: leadId },
          data: { siteStatus: 'generated', leadStatus: 'site_generated' },
        });

        if (autoDeploy) {
          // Create a follow-up deploy_site job and enqueue it.
          const deployJob = await prisma.siteJob.create({
            data: {
              leadId,
              jobType: 'deploy_site',
              status: 'queued',
              inputPayload: { generatedSiteId: generated.id } as Prisma.InputJsonValue,
            },
          });
          await siteDeploymentQueue.add(
            'deploy-site',
            { siteJobId: deployJob.id, leadId, generatedSiteId: generated.id, brandName },
            { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
          );
          await appendJobLog(siteJobId, 'info', `Queued deploy job ${deployJob.id}`);
          await prisma.lead.update({
            where: { id: leadId },
            data: { siteStatus: 'queued', leadStatus: 'site_deploying' },
          });
        }

        return { ok: true, generatedSiteId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        logger.error({ err, siteJobId }, 'generateSite failed');
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
    logger.error({ jobId: job?.id, err: err?.message }, 'site-generation worker job failed');
  });
  return worker;
}
