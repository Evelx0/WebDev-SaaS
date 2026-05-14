/**
 * Image generator — free, server-side image generation via Pollinations.ai.
 *
 * Pollinations.ai is a free REST API that requires no API key. Models are
 * rotated in quality-first order; on rate-limit or error the next model is
 * tried. Returns null when all models fail so the caller can degrade
 * gracefully (CSS background instead of a generated image).
 *
 * Comparable free models to Puter.js (browser-only) but usable from Node:
 *   flux         — FLUX.1, best quality, default
 *   flux-realism — photorealistic scenes
 *   turbo        — fastest, ~1–2s per image
 *   flux-3d      — stylised 3-D renders
 *   flux-anime   — illustrated/artistic style
 *
 * API reference: https://image.pollinations.ai/prompt/{prompt}?model=...
 */

export type ImageModel = 'flux' | 'flux-realism' | 'turbo' | 'flux-3d' | 'flux-anime';
export type ImageGenerationOutcome = 'try' | 'success' | 'rate-limited' | 'error';

const IMAGE_MODELS: ReadonlyArray<{ id: ImageModel; label: string }> = [
  { id: 'flux', label: 'FLUX.1' },
  { id: 'flux-realism', label: 'FLUX Realism' },
  { id: 'turbo', label: 'FLUX Turbo' },
  { id: 'flux-3d', label: 'FLUX 3D' },
  { id: 'flux-anime', label: 'FLUX Anime' },
];

export interface GeneratedImage {
  data: Buffer;
  model: ImageModel;
  filename: string;
}

export interface ImageGenerationOptions {
  width?: number;
  height?: number;
  filename?: string;
  onAttempt?: (model: ImageModel, outcome: ImageGenerationOutcome, detail?: string) => void;
}

/**
 * Generate an image via Pollinations.ai with model rotation.
 * Returns null when all models fail — caller must handle gracefully.
 */
export async function generateImage(
  prompt: string,
  opts: ImageGenerationOptions = {},
): Promise<GeneratedImage | null> {
  const { width = 1200, height = 630, filename = 'hero.jpg', onAttempt } = opts;
  const seed = Math.floor(Math.random() * 999_999);

  for (const model of IMAGE_MODELS) {
    onAttempt?.(model.id, 'try');

    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?model=${model.id}&width=${width}&height=${height}&seed=${seed}&nologo=true`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });

      if (res.status === 429) {
        onAttempt?.(model.id, 'rate-limited');
        continue;
      }
      if (!res.ok) {
        onAttempt?.(model.id, 'error', `HTTP ${res.status}`);
        continue;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        onAttempt?.(model.id, 'error', `unexpected content-type: ${contentType}`);
        continue;
      }

      const data = Buffer.from(await res.arrayBuffer());
      if (data.length < 2_000) {
        // Suspiciously small — likely an error page masquerading as an image.
        onAttempt?.(model.id, 'error', `response too small (${data.length} bytes)`);
        continue;
      }

      onAttempt?.(model.id, 'success');
      return { data, model: model.id, filename };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'network error';
      onAttempt?.(model.id, 'error', detail);
    }
  }

  return null;
}

/**
 * Build a hero image prompt from a website brief.
 * Deliberately avoids text/logos — Pollinations can render illegible text.
 */
export function buildHeroImagePrompt(brief: {
  businessCategory: string;
  brandTone: string;
  colourDirection: string;
}): string {
  return [
    `Professional ${brief.businessCategory} business`,
    brief.colourDirection,
    'clean modern photography',
    'high quality, sharp focus',
    'no text, no words, no logos, no watermarks',
    'wide hero banner composition',
  ].join(', ');
}
