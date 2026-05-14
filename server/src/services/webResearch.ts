/**
 * Web research service — W1 (business research) + W2 (competitor scout).
 *
 * Uses Perplexity Sonar via OpenRouter (built-in live web search) as the
 * primary model. Falls back to a free model for training-knowledge analysis
 * when Sonar is unavailable. Both functions return null on any error so the
 * callers (pullLeadInfo worker) can degrade gracefully without failing the job.
 *
 * Results are stored as LeadSource records with sourceType 'web_research' and
 * 'competitor_scout' and are later consumed by the sales-pitch prompt builder.
 */
import { flags } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import {
  AiGatewayError,
  aiCompleteOpenRouterRotate,
  type AiCallOptions,
  type AiUsage,
} from './aiGateway.js';

const WEB_SEARCH_MODEL = 'perplexity/sonar';
const FALLBACK_MODEL = 'qwen/qwen3-235b-a22b:free';
const RESEARCH_MODELS = [WEB_SEARCH_MODEL, FALLBACK_MODEL] as const;
const RESEARCH_SYSTEM =
  'You are a business analyst. Return ONLY valid JSON — no prose, no code fences, no explanation.';

type ResearchAiOptions = Pick<AiCallOptions, 'openRouterApiKey' | 'openRouterKeySource'>;

async function callWithFallback(
  userPrompt: string,
  aiOptions: ResearchAiOptions = {},
): Promise<{ text: string; source: 'web' | 'training'; usage: AiUsage } | null> {
  try {
    const completion = await aiCompleteOpenRouterRotate(
      [
        { role: 'system', content: RESEARCH_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      RESEARCH_MODELS,
      {
        ...aiOptions,
        maxTokens: 800,
        temperature: 0.3,
      },
    );
    if (completion.usage.provider === 'mock' || !completion.text) return null;

    return {
      text: completion.text,
      source: completion.usage.model === WEB_SEARCH_MODEL ? 'web' : 'training',
      usage: completion.usage,
    };
  } catch (err) {
    logger.warn(
      {
        err: err instanceof AiGatewayError ? err.message : err,
      },
      'webResearch: request failed',
    );
    return null;
  }
}

function extractJson<T>(text: string): T | null {
  try {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    return JSON.parse(text.slice(first, last + 1)) as T;
  } catch {
    return null;
  }
}

export interface BusinessResearch {
  categoryInsights: string;
  typicalPainPoints: string[];
  webPresenceNotes: string;
  source: 'web' | 'training';
}

export interface BusinessResearchResult {
  research: BusinessResearch;
  usage: AiUsage;
}

export interface CompetitorLandscape {
  competitors: Array<{ name: string; url: string | null }>;
  marketContext: string;
  source: 'web' | 'training';
}

export interface CompetitorLandscapeResult {
  competitors: CompetitorLandscape;
  usage: AiUsage;
}

export async function researchBusiness(
  params: {
    businessName: string;
    category: string;
    city: string | null;
    country: string | null;
  },
  aiOptions: ResearchAiOptions = {},
): Promise<BusinessResearchResult | null> {
  if (!flags.hasOpenRouter && !aiOptions.openRouterApiKey) return null;

  const location = [params.city, params.country].filter(Boolean).join(', ') || 'unknown location';
  const userPrompt = [
    `Research "${params.businessName}", a ${params.category} business in ${location}.`,
    '',
    'Return JSON matching this exact shape:',
    '{ "categoryInsights": string, "typicalPainPoints": string[], "webPresenceNotes": string }',
    '',
    '- categoryInsights: 1-2 sentences about what this type of business does and who it serves.',
    '- typicalPainPoints: 2-3 short strings — real pain points for owners of this business type.',
    '- webPresenceNotes: 1 sentence about what matters most for online presence in this category.',
    'Output JSON only.',
  ].join('\n');

  const result = await callWithFallback(userPrompt, aiOptions);
  if (!result) return null;

  const parsed = extractJson<Omit<BusinessResearch, 'source'>>(result.text);
  if (!parsed || typeof parsed.categoryInsights !== 'string') return null;

  return {
    research: {
      categoryInsights: parsed.categoryInsights,
      typicalPainPoints: Array.isArray(parsed.typicalPainPoints) ? parsed.typicalPainPoints : [],
      webPresenceNotes: parsed.webPresenceNotes ?? '',
      source: result.source,
    },
    usage: result.usage,
  };
}

export async function scoutCompetitors(
  params: {
    businessName: string;
    category: string;
    city: string | null;
    country: string | null;
  },
  aiOptions: ResearchAiOptions = {},
): Promise<CompetitorLandscapeResult | null> {
  if (!flags.hasOpenRouter && !aiOptions.openRouterApiKey) return null;

  const location = [params.city, params.country].filter(Boolean).join(', ') || 'unknown location';
  const userPrompt = [
    `Find competitors for "${params.businessName}", a ${params.category} business in ${location}.`,
    '',
    'Return JSON matching this exact shape:',
    '{ "competitors": [{ "name": string, "url": string | null }], "marketContext": string }',
    '',
    '- competitors: up to 5 named competitors that exist in this area. Include their URL if known.',
    '  If you cannot identify real competitors with confidence, return an empty array.',
    '  Do NOT invent business names.',
    '- marketContext: 1 sentence describing how competitive this local market is.',
    'Output JSON only.',
  ].join('\n');

  const result = await callWithFallback(userPrompt, aiOptions);
  if (!result) return null;

  const parsed = extractJson<Omit<CompetitorLandscape, 'source'>>(result.text);
  if (!parsed || typeof parsed.marketContext !== 'string') return null;

  return {
    competitors: {
      competitors: Array.isArray(parsed.competitors)
        ? parsed.competitors.filter((c) => c && typeof c.name === 'string')
        : [],
      marketContext: parsed.marketContext,
      source: result.source,
    },
    usage: result.usage,
  };
}
