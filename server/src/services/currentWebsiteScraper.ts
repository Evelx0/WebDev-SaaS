/**
 * Current website scraper — best-effort W0 enrichment.
 *
 * Fetches the lead's existing website, samples likely service/product pages,
 * and asks a cheap extraction model to return structured services/products.
 * Results are persisted as LeadSource.sourceType = 'current_website_scrape'.
 */
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import {
  aiCompleteOpenRouterRotate,
  extractJson,
  type AiCallOptions,
} from './aiGateway.js';

const SCRAPE_MODELS = [
  'qwen/qwen3.5-flash-02-23',
  'meta-llama/llama-3.2-3b-instruct',
  'meta-llama/llama-3.2-3b-instruct:free',
] as const;

const LINK_KEYWORDS = [
  'service',
  'services',
  'product',
  'products',
  'course',
  'courses',
  'training',
  'what-we-do',
  'solutions',
  'treatments',
  'menu',
  'gallery',
  'projects',
  'about',
];

const currentWebsiteProfileSchema = z.object({
  overview: z.string().max(800),
  services: z.array(z.string().min(1).max(120)).max(12),
  products: z.array(z.string().min(1).max(120)).max(12),
  courses: z.array(z.string().min(1).max(120)).max(12),
  trustSignals: z.array(z.string().min(1).max(140)).max(10),
  serviceAreas: z.array(z.string().min(1).max(100)).max(10),
  callsToAction: z.array(z.string().min(1).max(100)).max(8),
  usefulDesignNotes: z.string().max(800),
  sourceUrls: z.array(z.string().url()).min(1).max(6),
  model: z.string().optional(),
});

export type CurrentWebsiteProfile = z.infer<typeof currentWebsiteProfileSchema>;

interface ScrapedPage {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
}

function safeUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function sameOriginLink(base: URL, href: string): URL | null {
  try {
    const url = new URL(href, base);
    if (url.origin !== base.origin) return null;
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractTag(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1] ? decodeEntities(match[1].replace(/\s+/g, ' ').trim()) : null;
}

function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}

function extractLinks(base: URL, html: string): URL[] {
  const seen = new Set<string>();
  const links: URL[] = [];
  const matches = html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi);
  for (const match of matches) {
    const href = match[1];
    if (!href) continue;
    const url = sameOriginLink(base, href);
    if (!url) continue;
    const normalised = url.toString().replace(/\/$/, '');
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    links.push(url);
  }
  return links;
}

function scoreLink(url: URL): number {
  const haystack = `${url.pathname} ${url.search}`.toLowerCase();
  return LINK_KEYWORDS.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

async function fetchPage(url: URL): Promise<{ page: ScrapedPage; links: URL[] } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'LeadPanelBot/1.0 (+https://example.com/lead-panel; business demo enrichment)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return null;
    const html = await res.text();
    const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = extractTag(
      html,
      /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    );
    return {
      page: {
        url: url.toString(),
        title,
        description,
        text: htmlToText(html).slice(0, 7000),
      },
      links: extractLinks(url, html),
    };
  } catch (err) {
    logger.warn({ url: url.toString(), err }, 'currentWebsiteScraper: fetch failed');
    return null;
  }
}

async function scrapePages(websiteUrl: string): Promise<ScrapedPage[]> {
  const base = safeUrl(websiteUrl);
  if (!base) return [];

  const home = await fetchPage(base);
  if (!home) return [];

  const rankedLinks = home.links
    .map((url) => ({ url, score: scoreLink(url) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.url);

  const subPages = await Promise.all(rankedLinks.map((url) => fetchPage(url)));
  return [
    home.page,
    ...subPages.flatMap((result) => (result ? [result.page] : [])),
  ].slice(0, 5);
}

function buildExtractionPrompt(params: {
  businessName: string;
  category: string | null;
  websiteUrl: string;
  pages: ScrapedPage[];
}): string {
  return [
    'Extract the current real services/products/courses offered by this business from scraped website text.',
    'Return JSON matching this exact shape:',
    '{ "overview": string, "services": string[], "products": string[], "courses": string[], "trustSignals": string[], "serviceAreas": string[], "callsToAction": string[], "usefulDesignNotes": string, "sourceUrls": string[] }',
    '',
    'Rules:',
    '- Only use facts present in the scraped text.',
    '- Do not invent reviews, scores, accreditations, prices, course durations, guarantees, or service areas.',
    '- Prefer specific service/product names over generic category words.',
    '- Keep arrays concise and deduplicated.',
    '- sourceUrls must list the pages used.',
    '',
    `Business name: ${params.businessName}`,
    `Known category: ${params.category ?? 'unknown'}`,
    `Website: ${params.websiteUrl}`,
    '',
    'SCRAPED PAGES:',
    ...params.pages.map((p, index) => [
      `--- PAGE ${index + 1}: ${p.url}`,
      `Title: ${p.title ?? 'none'}`,
      `Description: ${p.description ?? 'none'}`,
      p.text,
    ].join('\n')),
    '',
    'Output JSON only.',
  ].join('\n\n');
}

export async function scrapeCurrentWebsite(params: {
  businessName: string;
  category: string | null;
  websiteUrl: string | null;
  openRouterApiKey?: string;
  openRouterKeySource?: 'platform' | 'user';
}): Promise<{ profile: CurrentWebsiteProfile; raw: unknown } | null> {
  if (!params.websiteUrl) return null;
  const pages = await scrapePages(params.websiteUrl);
  if (pages.length === 0) return null;

  try {
    const completion = await aiCompleteOpenRouterRotate(
      [
        {
          role: 'system',
          content: 'You extract structured business facts from website text. Return only valid JSON.',
        },
        {
          role: 'user',
          content: buildExtractionPrompt({
            businessName: params.businessName,
            category: params.category,
            websiteUrl: params.websiteUrl,
            pages,
          }),
        },
      ],
      SCRAPE_MODELS,
      {
        openRouterApiKey: params.openRouterApiKey,
        openRouterKeySource: params.openRouterKeySource,
        maxTokens: 1000,
        temperature: 0.1,
        jsonMode: true,
      } satisfies Pick<AiCallOptions, 'openRouterApiKey' | 'openRouterKeySource'> & {
        maxTokens: number;
        temperature: number;
        jsonMode: boolean;
      },
    );
    if (completion.usage.provider === 'mock' || !completion.text) return null;

    const extracted = extractJson(completion.text);
    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) return null;
    const parsed = currentWebsiteProfileSchema.safeParse({
      ...extracted,
      model: `${completion.usage.provider}/${completion.usage.model}`,
    });
    if (!parsed.success) return null;
    return {
      profile: parsed.data,
      raw: {
        pages,
        usage: completion.usage,
      },
    };
  } catch (err) {
    logger.warn({ websiteUrl: params.websiteUrl, err }, 'currentWebsiteScraper: extraction failed');
    return null;
  }
}
