import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { bullConnection } from '../lib/redis.js';
import { QUEUE_NAMES, type LeadEnrichmentJobData } from '../lib/queues.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { appendJobLog } from '../lib/jobLog.js';
import { enrichLeadFromUrl, isGenericCategory } from '../services/leadEnrichment.js';
import { scrapeCurrentWebsite } from '../services/currentWebsiteScraper.js';
import { researchBusiness, scoutCompetitors } from '../services/webResearch.js';
import { getUserOpenRouterConfig } from '../services/userSettings.js';

export function startPullLeadInfoWorker() {
  const worker = new Worker<LeadEnrichmentJobData>(
    QUEUE_NAMES.leadEnrichment,
    async (job) => {
      const { siteJobId, leadId, googleProfileUrl } = job.data;
      logger.info({ siteJobId, leadId }, 'pullLeadInfo: start');
      await prisma.siteJob.update({
        where: { id: siteJobId },
        data: { status: 'running', startedAt: new Date(), attemptCount: { increment: 1 } },
      });
      await appendJobLog(siteJobId, 'info', 'Starting lead enrichment', { googleProfileUrl });

      try {
        const result = await enrichLeadFromUrl(googleProfileUrl);
        await appendJobLog(siteJobId, 'info', `Enrichment source=${result.source}`, {
          extractedFields: Object.keys(result.extracted),
        });

        // Persist raw + extracted source data
        await prisma.leadSource.create({
          data: {
            leadId,
            sourceType: result.source,
            sourceUrl: googleProfileUrl,
            rawData: result.raw as Prisma.InputJsonValue,
            extractedData: result.extracted as Prisma.InputJsonValue,
          },
        });

        // Update canonical lead fields, but NEVER overwrite manually set values
        // unless they are still null/empty.
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) throw new Error(`Lead ${leadId} not found`);

        const e = result.extracted;
        const mergedBusinessName = lead.businessName ?? e.businessName;
        const mergedCategory = isGenericCategory(lead.category) ? e.category : lead.category;
        const merged = {
          businessName: mergedBusinessName,
          category: mergedCategory,
          googlePlaceId: lead.googlePlaceId ?? e.googlePlaceId,
          addressLine1: lead.addressLine1 ?? e.addressLine1,
          addressLine2: lead.addressLine2 ?? e.addressLine2,
          city: lead.city ?? e.city,
          postcode: lead.postcode ?? e.postcode,
          country: lead.country ?? e.country,
          phone: lead.phone ?? e.phone,
          existingWebsiteUrl: lead.existingWebsiteUrl ?? e.existingWebsiteUrl,
          websiteStatus: lead.websiteStatus === 'unknown' ? e.websiteStatus : lead.websiteStatus,
        };
        const openRouter = lead.createdByUserId
          ? await getUserOpenRouterConfig(lead.createdByUserId).catch(() => null)
          : null;
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            ...merged,
            leadStatus: 'needs_review',
            lastError: null,
          },
        });

        const currentWebsiteProfile = mergedBusinessName
          ? await scrapeCurrentWebsite({
              businessName: mergedBusinessName,
              category: mergedCategory,
              websiteUrl: merged.existingWebsiteUrl,
              openRouterApiKey: openRouter?.apiKey,
              openRouterKeySource: openRouter?.source,
            }).catch(() => null)
          : null;
        if (currentWebsiteProfile) {
          await prisma.leadSource.create({
            data: {
              leadId,
              sourceType: 'current_website_scrape',
              sourceUrl: merged.existingWebsiteUrl,
              rawData: currentWebsiteProfile.raw as Prisma.InputJsonValue,
              extractedData: currentWebsiteProfile.profile as Prisma.InputJsonValue,
            },
          });
          await appendJobLog(
            siteJobId,
            'info',
            `W0 current website scrape done (${currentWebsiteProfile.profile.services.length} services, ${currentWebsiteProfile.profile.products.length} products, ${currentWebsiteProfile.profile.courses.length} courses)`,
          );
        } else if (merged.existingWebsiteUrl) {
          await appendJobLog(siteJobId, 'warn', 'W0 current website scrape unavailable');
        }

        // W1 + W2: run web research and competitor scouting in parallel.
        // Both are best-effort — errors are logged but never fail the job.
        if (mergedBusinessName && mergedCategory) {
          const researchParams = {
            businessName: mergedBusinessName,
            category: mergedCategory,
            city: merged.city ?? null,
            country: merged.country ?? null,
          };
          await appendJobLog(siteJobId, 'info', 'Starting web research (W1+W2) in parallel');
          const [bizResearch, competitors] = await Promise.all([
            researchBusiness(researchParams, {
              openRouterApiKey: openRouter?.apiKey,
              openRouterKeySource: openRouter?.source,
            }).catch(() => null),
            scoutCompetitors(researchParams, {
              openRouterApiKey: openRouter?.apiKey,
              openRouterKeySource: openRouter?.source,
            }).catch(() => null),
          ]);
          if (bizResearch) {
            await prisma.leadSource.create({
              data: {
                leadId,
                sourceType: 'web_research',
                rawData: {
                  ...bizResearch.research,
                  usage: bizResearch.usage,
                } as unknown as Prisma.InputJsonValue,
                extractedData: bizResearch.research as unknown as Prisma.InputJsonValue,
              },
            });
            await appendJobLog(
              siteJobId,
              'info',
              `W1 business research done (source=${bizResearch.research.source}, model=${bizResearch.usage.model})`,
            );
          } else {
            await appendJobLog(siteJobId, 'warn', 'W1 business research unavailable');
          }
          if (competitors) {
            await prisma.leadSource.create({
              data: {
                leadId,
                sourceType: 'competitor_scout',
                rawData: {
                  ...competitors.competitors,
                  usage: competitors.usage,
                } as unknown as Prisma.InputJsonValue,
                extractedData: competitors.competitors as unknown as Prisma.InputJsonValue,
              },
            });
            await appendJobLog(
              siteJobId,
              'info',
              `W2 competitor scout done (${competitors.competitors.competitors.length} found, source=${competitors.competitors.source}, model=${competitors.usage.model})`,
            );
          } else {
            await appendJobLog(siteJobId, 'warn', 'W2 competitor scout unavailable');
          }
        }

        await prisma.siteJob.update({
          where: { id: siteJobId },
          data: {
            status: 'succeeded',
            completedAt: new Date(),
            outputPayload: { source: result.source, extracted: e } as Prisma.InputJsonValue,
          },
        });
        await appendJobLog(siteJobId, 'info', 'Enrichment complete');
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        logger.error({ err, siteJobId }, 'pullLeadInfo failed');
        await prisma.siteJob.update({
          where: { id: siteJobId },
          data: { status: 'failed', completedAt: new Date(), errorMessage: msg },
        });
        await prisma.lead.update({
          where: { id: leadId },
          data: { lastError: msg },
        });
        await appendJobLog(siteJobId, 'error', msg);
        throw err;
      }
    },
    { connection: { url: bullConnection.url }, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err?.message }, 'lead-enrichment worker job failed');
  });
  return worker;
}
