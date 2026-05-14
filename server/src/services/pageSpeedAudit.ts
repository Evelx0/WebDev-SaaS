/**
 * Google PageSpeed Insights audit — W3 in the research pipeline.
 *
 * Uses the public PageSpeed Insights v5 API (no key required for low volume,
 * ~25 req/100s). Returns null on any error so the caller (deploySite worker)
 * can degrade gracefully without failing the deployment job.
 *
 * Scores are normalised to 0–100 integers. Results are stored in
 * generatedSite.generationMetadata under the key "pageSpeedAudit".
 */
import { logger } from '../lib/logger.js';

export interface PageSpeedResult {
  url: string;
  performanceScore: number | null;
  seoScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  fetchedAt: string;
}

function toPercent(score: number | null | undefined): number | null {
  return typeof score === 'number' ? Math.round(score * 100) : null;
}

export async function auditUrl(url: string): Promise<PageSpeedResult | null> {
  try {
    const endpoint =
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
      `?url=${encodeURIComponent(url)}&strategy=mobile`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'pageSpeedAudit: non-OK response');
      return null;
    }
    const json = (await res.json()) as {
      lighthouseResult?: {
        categories?: {
          performance?: { score?: number };
          seo?: { score?: number };
          accessibility?: { score?: number };
          'best-practices'?: { score?: number };
        };
      };
    };
    const cats = json.lighthouseResult?.categories;
    return {
      url,
      performanceScore: toPercent(cats?.performance?.score),
      seoScore: toPercent(cats?.seo?.score),
      accessibilityScore: toPercent(cats?.accessibility?.score),
      bestPracticesScore: toPercent(cats?.['best-practices']?.score),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn({ url, err }, 'pageSpeedAudit: request failed');
    return null;
  }
}

export async function auditBothSites(
  oldUrl: string | null,
  newUrl: string,
): Promise<{ old: PageSpeedResult | null; new: PageSpeedResult | null }> {
  const [oldResult, newResult] = await Promise.all([
    oldUrl ? auditUrl(oldUrl) : Promise.resolve(null),
    auditUrl(newUrl),
  ]);
  return { old: oldResult, new: newResult };
}
