import { prisma } from '../lib/prisma.js';
import { generateSiteDesignBrief } from './aiGateway.js';
import { getUserOpenRouterConfig } from './userSettings.js';

export async function buildDesignSuggestionForLead(leadId: string) {
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

  const sources = await prisma.leadSource.findMany({
    where: {
      leadId,
      sourceType: { in: ['web_research', 'competitor_scout', 'current_website_scrape'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  const researchSource = sources.find((s) => s.sourceType === 'web_research');
  const competitorSource = sources.find((s) => s.sourceType === 'competitor_scout');
  const currentWebsiteSource = sources.find((s) => s.sourceType === 'current_website_scrape');

  return generateSiteDesignBrief({
    businessName: lead.businessName,
    category: lead.category,
    city: lead.city,
    country: lead.country,
    websiteStatus: lead.websiteStatus,
    existingWebsiteUrl: lead.existingWebsiteUrl,
    notes: lead.notes,
    researchData: researchSource
      ? (researchSource.extractedData as {
          categoryInsights?: string;
          typicalPainPoints?: string[];
          webPresenceNotes?: string;
        } | null)
      : null,
    competitorData: competitorSource
      ? (competitorSource.extractedData as {
          competitors?: Array<{ name: string; url: string | null }>;
          marketContext?: string;
        } | null)
      : null,
    currentWebsiteData: currentWebsiteSource
      ? (currentWebsiteSource.extractedData as {
          overview?: string;
          services?: string[];
          products?: string[];
          courses?: string[];
          trustSignals?: string[];
          serviceAreas?: string[];
          callsToAction?: string[];
          usefulDesignNotes?: string;
          sourceUrls?: string[];
        } | null)
      : null,
  }, aiOpts);
}
