/**
 * AI gateway — single server-side module for all model calls.
 *
 * Supports:
 *   - Anthropic Messages API (claude-3-5-sonnet by default)
 *   - OpenRouter chat completions API
 *
 * Both providers are called over plain fetch using their public REST
 * endpoints. Both keys may be absent during local development; in that case
 * a clearly-labelled mock generator is used so the full workflow can be
 * exercised without external services.
 *
 * References:
 *   Anthropic   — https://docs.anthropic.com/en/api/messages
 *   OpenRouter  — https://openrouter.ai/docs
 */
import { env, flags } from '../lib/env.js';
import {
  siteDesignBriefSchema,
  websiteBriefSchema,
  type SiteDesignBrief,
  type WebsiteBrief,
} from '../schemas/index.js';
import {
  SITE_DESIGN_BRIEF_SYSTEM_PROMPT,
  WEBSITE_BRIEF_SYSTEM_PROMPT,
  buildSiteDesignBriefPrompt,
  buildWebsiteBriefUserPrompt,
  type SiteDesignBriefPromptInput,
  type WebsitePromptInput,
} from '../prompts/index.js';

// ---------------------------------------------------------------------------
// Free HTML-generation model rotation
// ---------------------------------------------------------------------------

/**
 * Ordered list of free OpenRouter models for brief + pitch generation (JSON/structured output).
 * Verified available as of 2026-05. Re-check openrouter.ai/api/v1/models periodically.
 */
const FREE_BRIEF_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',  // 1M ctx, large NVIDIA model
  'meta-llama/llama-3.3-70b-instruct:free',  // 131K ctx, very reliable JSON output
  'openai/gpt-oss-120b:free',                // 131K ctx, proven working
  'qwen/qwen3-coder:free',                   // 1M ctx, Qwen3 full coder
  'minimax/minimax-m2.5:free',               // 204K ctx
  'qwen/qwen3-next-80b-a3b-instruct:free',   // 262K ctx
  'google/gemma-4-31b-it:free',              // 262K ctx
  'google/gemma-4-26b-a4b-it:free',          // 262K ctx
  'openai/gpt-oss-20b:free',                 // 131K ctx, fast fallback
  'nvidia/nemotron-3-nano-30b-a3b:free',     // 256K ctx, last resort
] as const;

/**
 * Ordered list of models for HTML/CSS/JS generation.
 * Paid mimo-v2-flash is first — extremely cheap and fast for code generation.
 * Free models follow as fallbacks if mimo is unavailable.
 * disableReasoning: inject reasoning:{effort:'none'} for hybrid reasoning models (Qwen3, MiMo)
 * to suppress thinking tokens on this pure-generation task.
 */
const FREE_HTML_MODELS = [
  { id: 'xiaomi/mimo-v2-flash',      contextK: 131  },
  { id: 'qwen/qwen3-coder:free',     contextK: 1048 },
  { id: 'xiaomi/mimo-v2-flash:free', contextK: 131  },
  { id: 'poolside/laguna-m.1:free',  contextK: 131  },
] as const;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type HtmlGenerationOutcome = 'try' | 'success' | 'rate-limited' | 'partial' | 'repair' | 'error';

export interface HtmlGenerationResult {
  /** Complete (or best-effort) HTML string. Empty string means all models failed. */
  html: string;
  usage: AiUsage;
  modelsAttempted: string[];
  /** 'ai' when at least one model contributed; 'mock' when none were available. */
  htmlSource: 'ai' | 'mock';
}

async function callOpenRouterModel(
  modelId: string,
  messages: ChatMessage[],
  maxTokens = 8192,
  extraBody: Record<string, unknown> = {},
  opts: Pick<AiCallOptions, 'openRouterApiKey' | 'openRouterKeySource'> = {},
): Promise<{ text: string; status?: number; errorDetail?: string; inputTokens?: number; outputTokens?: number; costUsd?: number; apiKeySource?: 'platform' | 'user' }> {
  const apiKey = opts.openRouterApiKey ?? env.OPENROUTER_API_KEY;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': env.APP_BASE_URL,
      'X-Title': 'Lead Panel',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      temperature: 0.4,
      provider: { sort: { by: 'price' } },
      messages,
      ...extraBody,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) return { text: '', status: res.status };

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    error?: { message?: string; code?: number };
  };

  // OpenRouter sometimes returns a 200 with an error body instead of choices
  // (e.g. model unavailable, no credits for this model, upstream timeout).
  if (json.error) {
    const code = typeof json.error.code === 'number' ? json.error.code : 503;
    return { text: '', status: code, errorDetail: json.error.message ?? 'provider error' };
  }

  // Strip DeepSeek R1 <think>...</think> reasoning preamble before returning.
  const text = (json.choices?.[0]?.message?.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();

  return {
    text,
    inputTokens: json.usage?.prompt_tokens,
    outputTokens: json.usage?.completion_tokens,
    costUsd: json.usage?.cost,
    apiKeySource: opts.openRouterKeySource ?? (opts.openRouterApiKey ? 'user' : 'platform'),
  };
}

const HTML_DELIMITER = '===GALLERY===';

export function validateGeneratedHtml(html: string): string[] {
  const errors: string[] = [];
  const trimmed = html.trim();
  if (!trimmed) return ['empty output'];
  if (/```/.test(trimmed)) errors.push('contains markdown code fences');
  if (!trimmed.startsWith('<!doctype html>')) errors.push('index.html must start with <!doctype html>');
  if (!trimmed.includes(HTML_DELIMITER)) errors.push('missing ===GALLERY=== delimiter');

  const parts = trimmed.split(HTML_DELIMITER);
  if (parts.length !== 2) {
    errors.push('output must contain exactly one ===GALLERY=== delimiter');
  } else {
    const [indexHtml, galleryHtml] = parts.map((p) => p.trim());
    if (!/^<!doctype html>/i.test(indexHtml)) errors.push('index.html part must start with <!doctype html>');
    if (!/<\/html\s*>$/i.test(indexHtml)) errors.push('index.html part must end with </html>');
    if (!/^<!doctype html>/i.test(galleryHtml)) errors.push('gallery.html part must start with <!doctype html>');
    if (!/<\/html\s*>$/i.test(galleryHtml)) errors.push('gallery.html part must end with </html>');
  }

  if (/___(?!HERO_IMAGE___|ABOUT_IMAGE___)[A-Z0-9_]+___/.test(trimmed)) {
    errors.push('contains unresolved placeholder other than approved image placeholders');
  }
  if (/\b(5\s*★|5-star|five-star|trusted by thousands|voted best|award-winning|fully insured|years in business|projects completed)\b/i.test(trimmed)) {
    errors.push('contains unverifiable proof claim');
  }
  return errors;
}

function isHtmlComplete(html: string): boolean {
  return validateGeneratedHtml(html).length === 0;
}

async function repairGeneratedHtml(
  html: string,
  errors: string[],
  onAttempt?: (
    modelId: string,
    outcome: HtmlGenerationOutcome,
    detail?: string,
  ) => void,
  opts: Pick<AiCallOptions, 'openRouterApiKey' | 'openRouterKeySource'> = {},
): Promise<{ html: string; usage: AiUsage } | null> {
  const repairPrompt = [
    'Repair this generated website output so it passes validation.',
    'Return TWO complete HTML files only, separated by ===GALLERY=== on its own line.',
    'No markdown fences. No commentary.',
    'Do not invent review scores, testimonials, project counts, awards, certifications, years in business, or insurance claims.',
    '',
    'Validation errors:',
    errors.map((e) => `- ${e}`).join('\n'),
    '',
    'Current output:',
    html.slice(0, 60_000),
  ].join('\n');

  for (const model of FREE_HTML_MODELS) {
    onAttempt?.(model.id, 'repair', errors.join('; '));
    try {
      const result = await callOpenRouterModel(
        model.id,
        [{ role: 'user', content: repairPrompt }],
        16000,
        {
          temperature: 0.1,
          ...(model.id.includes('qwen')
            ? { reasoning: { effort: 'none' } }
            : model.id.includes('mimo')
            ? { reasoning: { enabled: false } }
            : {}),
        },
        opts,
      );
      if (!result.text || (result.status ?? 200) >= 400) continue;
      const repaired = result.text.trim();
      const repairedErrors = validateGeneratedHtml(repaired);
      if (repairedErrors.length === 0) {
        return {
          html: repaired,
          usage: {
            provider: 'openrouter',
            model: model.id,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            apiKeySource: result.apiKeySource,
          },
        };
      }
      errors = repairedErrors;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Generate site HTML by rotating through free OpenRouter models.
 *
 * Maintains a shared message history so a partial response from one model
 * can be continued by the next — generation never starts from scratch on
 * failure. Returns an empty `html` string when no models are available or
 * all attempts fail; the caller is responsible for falling back.
 *
 * @param onAttempt - Optional callback fired on each model attempt for logging.
 */
export async function generateSiteHtml(
  systemPrompt: string,
  userPrompt: string,
  onAttempt?: (
    modelId: string,
    outcome: HtmlGenerationOutcome,
    detail?: string,
  ) => void,
  opts: Pick<AiCallOptions, 'openRouterApiKey' | 'openRouterKeySource'> = {},
): Promise<HtmlGenerationResult> {
  const hasOpenRouter = Boolean(opts.openRouterApiKey || env.OPENROUTER_API_KEY);
  if (!hasOpenRouter) {
    return { html: '', usage: { provider: 'mock', model: 'mock-html-v0' }, modelsAttempted: [], htmlSource: 'mock' };
  }

  const modelsAttempted: string[] = [];
  let accumulated = '';
  let lastUsage: AiUsage = { provider: 'openrouter', model: FREE_HTML_MODELS[0].id };

  let messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  for (const model of FREE_HTML_MODELS) {
    modelsAttempted.push(model.id);
    onAttempt?.(model.id, 'try');

    let result: Awaited<ReturnType<typeof callOpenRouterModel>>;
    try {
      result = await callOpenRouterModel(
        model.id,
        messages,
        16000,
        {
          temperature: 0.3,
          top_p: 0.95,
          ...(model.id.includes('qwen')
            ? { reasoning: { effort: 'none' } }
            : model.id.includes('mimo')
            ? { reasoning: { enabled: false } }
            : {}),
        },
        opts,
      );
    } catch (err) {
      onAttempt?.(model.id, 'error', err instanceof Error ? err.message : 'network error');
      continue;
    }

    if (result.status === 429) {
      onAttempt?.(model.id, 'rate-limited');
      continue;
    }
    if ((result.status ?? 200) >= 400) {
      onAttempt?.(model.id, 'error', result.errorDetail ?? `HTTP ${result.status}`);
      continue;
    }
    if (!result.text) {
      onAttempt?.(model.id, 'error', 'empty response');
      continue;
    }

    accumulated += result.text;
    lastUsage = {
      provider: 'openrouter',
      model: model.id,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      apiKeySource: result.apiKeySource,
    };

    if (isHtmlComplete(accumulated)) {
      onAttempt?.(model.id, 'success');
      return { html: accumulated, usage: lastUsage, modelsAttempted, htmlSource: 'ai' };
    }

    // Partial output — chain context into the next model.
    onAttempt?.(model.id, 'partial', `${accumulated.length} chars so far`);
    messages = [
      ...messages,
      { role: 'assistant', content: result.text },
      {
        role: 'user',
        content:
          'Continue from exactly where you left off. You must finish index.html, output ===GALLERY=== on its own line, then output complete gallery.html. ' +
          'Do not repeat content already written. Output only the continuation.',
      },
    ];
  }

  const validationErrors = validateGeneratedHtml(accumulated);
  if (accumulated && validationErrors.length > 0) {
    const repaired = await repairGeneratedHtml(accumulated, validationErrors, onAttempt, opts);
    if (repaired) {
      return { html: repaired.html, usage: repaired.usage, modelsAttempted, htmlSource: 'ai' };
    }
    onAttempt?.(lastUsage.model, 'error', `HTML validation failed: ${validationErrors.join('; ')}`);
  }

  return { html: '', usage: { provider: 'mock', model: 'none' }, modelsAttempted, htmlSource: 'mock' };
}

export type AiProvider = 'anthropic' | 'openrouter' | 'mock';

export interface AiUsage {
  provider: AiProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  apiKeySource?: 'platform' | 'user';
}

export interface AiCompletion {
  text: string;
  usage: AiUsage;
}

export interface AiCallOptions {
  /** Preferred provider. Falls back to whichever is configured. */
  prefer?: 'anthropic' | 'openrouter';
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** When true, instructs the provider to return JSON. */
  jsonMode?: boolean;
  openRouterApiKey?: string;
  openRouterKeySource?: 'platform' | 'user';
  disableAnthropic?: boolean;
}

export class AiGatewayError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

async function callAnthropic(prompt: string, opts: AiCallOptions): Promise<AiCompletion> {
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model: env.ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.4,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new AiGatewayError(`Anthropic ${res.status}: ${errBody.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (json.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();
  return {
    text,
    usage: {
      provider: 'anthropic',
      model: env.ANTHROPIC_MODEL,
      inputTokens: json.usage?.input_tokens,
      outputTokens: json.usage?.output_tokens,
    },
  };
}

async function callOpenRouter(
  prompt: string,
  opts: AiCallOptions,
  modelOverride?: string,
): Promise<AiCompletion> {
  const model = modelOverride ?? env.OPENROUTER_MODEL;
  const apiKey = opts.openRouterApiKey ?? env.OPENROUTER_API_KEY;
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 1500,
    temperature: opts.temperature ?? 0.3,
    provider: { sort: { by: 'price' } },
    messages: [
      ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
      { role: 'user', content: prompt },
    ],
  };
  if (opts.jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': env.APP_BASE_URL,
      'X-Title': 'Lead Panel',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new AiGatewayError(`OpenRouter ${res.status}: ${errBody.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? '';
  return {
    text,
    usage: {
      provider: 'openrouter',
      model,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
      costUsd: json.usage?.cost,
      apiKeySource: opts.openRouterKeySource ?? (opts.openRouterApiKey ? 'user' : 'platform'),
    },
  };
}

function mockCompletion(prompt: string, opts: AiCallOptions): AiCompletion {
  // Returns deterministic mock content based on the system prompt.
  // Clearly labelled so accidental production use is obvious.
  const isBrief = (opts.systemPrompt ?? '').toLowerCase().includes('website brief');
  const isDesignBrief = (opts.systemPrompt ?? '').toLowerCase().includes('design-direction');
  const isHtml = (opts.systemPrompt ?? '').toLowerCase().includes('html');
  if (isDesignBrief) {
    const designBrief: SiteDesignBrief = {
      designArchetype: 'Premium Trade',
      visualMood: 'Bold local-service layout with strong photography, deep green accents, and clear conversion panels.',
      heroAngle: 'Show the business as the obvious local upgrade: professional, easy to contact, and ready for serious enquiries.',
      trustSignalPlan: 'Use labelled review placeholders, local service badges, and a clear quote CTA without inventing proof.',
      trustpilotMode: 'placeholder',
      trustpilotUrl: null,
      trustpilotRating: null,
      trustpilotReviewCount: null,
      servicesToEmphasise: ['Core service', 'Repairs', 'Maintenance', 'Local callouts'],
      localPositioning: 'Position the business as a practical local option for customers in the surrounding area.',
      galleryStyle: 'Project-style gallery tiles with local captions and clearly demo-only imagery.',
      ctaWording: 'Get a Free Quote',
      avoidClaims: 'Do not claim review scores, insurance, certifications, project counts, years in business, or guarantees unless supplied.',
    };
    return {
      text: JSON.stringify(designBrief, null, 2),
      usage: { provider: 'mock', model: 'mock-design-brief-v0' },
    };
  }
  if (isBrief) {
    const brief: WebsiteBrief = {
      businessName: 'Sample Local Business (mock)',
      businessCategory: 'local service',
      targetCustomer: 'Local residents seeking a trusted nearby provider.',
      primaryCTA: 'Call now for a free quote',
      brandTone: 'Friendly, professional, local-first',
      colourDirection: 'Warm neutrals with a single accent green',
      sections: [
        { title: 'Hero', purpose: 'Introduce business and primary CTA', contentNotes: 'Lead with the location and service.' },
        { title: 'Services', purpose: 'List core offerings', contentNotes: 'Three to five short bullets.' },
        { title: 'Why us', purpose: 'Build trust without inventing claims', contentNotes: 'Use generic trust phrasing.' },
        { title: 'Contact', purpose: 'Conversion section', contentNotes: 'Phone, address, opening hours if known.' },
      ],
    };
    return {
      text: JSON.stringify(brief, null, 2),
      usage: { provider: 'mock', model: 'mock-brief-v0' },
    };
  }
  if (isHtml) {
    return {
      text: '<!-- mock html — see deterministic generator -->',
      usage: { provider: 'mock', model: 'mock-html-v0' },
    };
  }
  return {
    text: `[mock-ai] ${prompt.slice(0, 120)}`,
    usage: { provider: 'mock', model: 'mock-text-v0' },
  };
}

export async function aiComplete(prompt: string, opts: AiCallOptions = {}): Promise<AiCompletion> {
  const prefer = opts.prefer;
  // Routing: respect explicit preference; else Anthropic for higher-quality
  // generation, OpenRouter for cheap classification, mock if neither.
  const hasOpenRouter = Boolean(opts.openRouterApiKey || env.OPENROUTER_API_KEY);
  if (prefer === 'anthropic' && flags.hasAnthropic && !opts.disableAnthropic) return callAnthropic(prompt, opts);
  if (prefer === 'openrouter' && hasOpenRouter) return callOpenRouter(prompt, opts);
  if (flags.hasAnthropic && !opts.disableAnthropic) return callAnthropic(prompt, opts);
  if (hasOpenRouter) return callOpenRouter(prompt, opts);
  return mockCompletion(prompt, opts);
}

/**
 * OpenRouter-only completion. Used by the sales-pitch workflow which is
 * defined to default to OpenRouter regardless of whether Anthropic is also
 * configured. Falls through to a clearly-labelled mock when no key is set.
 */
export async function aiCompleteOpenRouter(
  prompt: string,
  opts: Omit<AiCallOptions, 'prefer'> = {},
): Promise<AiCompletion> {
  const hasOpenRouter = Boolean(opts.openRouterApiKey || env.OPENROUTER_API_KEY);
  if (!hasOpenRouter) return mockCompletion(prompt, opts);
  try {
    return await callOpenRouter(prompt, opts);
  } catch {
    // Paid fallback — only reached when configured model fails or is rate-limited.
    return callOpenRouter(prompt, opts, 'xiaomi/mimo-v2-flash');
  }
}

/**
 * OpenRouter completion with explicit model rotation. Tries each model in order,
 * skipping on error or non-OK response. Returns the first successful result.
 * Falls through to a mock signal when no key is set so callers can branch on
 * `usage.provider === 'mock'`.
 */
export async function aiCompleteOpenRouterRotate(
  messages: ChatMessage[],
  models: readonly string[],
  opts: Pick<AiCallOptions, 'openRouterApiKey' | 'openRouterKeySource'> & {
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
  } = {},
): Promise<AiCompletion> {
  const hasOpenRouter = Boolean(opts.openRouterApiKey || env.OPENROUTER_API_KEY);
  if (!hasOpenRouter) {
    return { text: '', usage: { provider: 'mock', model: 'mock-rotate-v0' } };
  }

  const extraBody: Record<string, unknown> = {};
  if (opts.temperature !== undefined) extraBody.temperature = opts.temperature;
  if (opts.jsonMode) extraBody.response_format = { type: 'json_object' };

  for (const modelId of models) {
    try {
      const result = await callOpenRouterModel(modelId, messages, opts.maxTokens ?? 4096, extraBody, opts);
      if (!result.text || (result.status ?? 200) >= 400) continue;
      return {
        text: result.text,
        usage: {
          provider: 'openrouter',
          model: modelId,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          apiKeySource: result.apiKeySource,
        },
      };
    } catch {
      continue;
    }
  }

  throw new AiGatewayError('All models in rotation failed to produce a response.');
}

/** Extract a JSON object embedded in a model response. Tolerates code fences. */
export function extractJson<T = unknown>(text: string): T {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  if (!candidate) throw new AiGatewayError('No JSON content in model output');
  // Find first { ... last } to be tolerant of preamble
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new AiGatewayError('Model output did not contain a JSON object');
  }
  const slice = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice) as T;
  } catch (err) {
    throw new AiGatewayError('Failed to parse JSON from model output', err);
  }
}

export async function generateWebsiteBrief(
  input: WebsitePromptInput,
  opts: AiCallOptions = {},
): Promise<{ brief: WebsiteBrief; usage: AiUsage }> {
  const systemPrompt = WEBSITE_BRIEF_SYSTEM_PROMPT;
  const userPrompt = buildWebsiteBriefUserPrompt(input);

  // Try Anthropic first — best JSON compliance. Falls through on error or bad output.
  if (flags.hasAnthropic && !opts.disableAnthropic) {
    try {
      const res = await callAnthropic(userPrompt, {
        systemPrompt,
        jsonMode: true,
        temperature: 0.5,
        maxTokens: 1500,
      });
      const parsed = websiteBriefSchema.safeParse(extractJson(res.text));
      if (parsed.success) return { brief: parsed.data, usage: res.usage };
    } catch {
      // Fall through to OpenRouter rotation.
    }
  }

  // Rotate through free OpenRouter models until one produces a valid brief.
  const hasOpenRouter = Boolean(opts.openRouterApiKey || env.OPENROUTER_API_KEY);
  if (hasOpenRouter) {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    for (const modelId of FREE_BRIEF_MODELS) {
      try {
        const result = await callOpenRouterModel(modelId, messages, 800, { temperature: 0.1 }, opts);
        if (!result.text || (result.status ?? 200) >= 400) continue;
        const parsed = websiteBriefSchema.safeParse(extractJson(result.text));
        if (parsed.success) {
          return {
            brief: parsed.data,
            usage: {
              provider: 'openrouter',
              model: modelId,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costUsd: result.costUsd,
              apiKeySource: result.apiKeySource,
            },
          };
        }
      } catch {
        continue;
      }
    }
    throw new AiGatewayError('All brief generation models failed to produce a valid response.');
  }

  // Mock fallback for local dev with no keys.
  const mock = mockCompletion(userPrompt, { systemPrompt });
  const parsed = websiteBriefSchema.safeParse(extractJson(mock.text));
  if (!parsed.success) throw new AiGatewayError(`Mock brief failed schema validation: ${parsed.error.message}`);
  return { brief: parsed.data, usage: mock.usage };
}

export async function generateSiteDesignBrief(
  input: SiteDesignBriefPromptInput,
  opts: AiCallOptions = {},
): Promise<{ designBrief: SiteDesignBrief; usage: AiUsage }> {
  const systemPrompt = SITE_DESIGN_BRIEF_SYSTEM_PROMPT;
  const userPrompt = buildSiteDesignBriefPrompt(input);

  if (flags.hasAnthropic && !opts.disableAnthropic) {
    try {
      const res = await callAnthropic(userPrompt, {
        systemPrompt,
        jsonMode: true,
        temperature: 0.35,
        maxTokens: 1200,
      });
      const parsed = siteDesignBriefSchema.safeParse(extractJson(res.text));
      if (parsed.success) return { designBrief: parsed.data, usage: res.usage };
    } catch {
      // Fall through to OpenRouter rotation.
    }
  }

  const hasOpenRouter = Boolean(opts.openRouterApiKey || env.OPENROUTER_API_KEY);
  if (hasOpenRouter) {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    for (const modelId of FREE_BRIEF_MODELS) {
      try {
        const result = await callOpenRouterModel(modelId, messages, 1000, {
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }, opts);
        if (!result.text || (result.status ?? 200) >= 400) continue;
        const parsed = siteDesignBriefSchema.safeParse(extractJson(result.text));
        if (parsed.success) {
          return {
            designBrief: parsed.data,
            usage: {
              provider: 'openrouter',
              model: modelId,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costUsd: result.costUsd,
              apiKeySource: result.apiKeySource,
            },
          };
        }
      } catch {
        continue;
      }
    }
    throw new AiGatewayError('All design brief models failed to produce a valid response.');
  }

  const mock = mockCompletion(userPrompt, { systemPrompt });
  const parsed = siteDesignBriefSchema.safeParse(extractJson(mock.text));
  if (!parsed.success) throw new AiGatewayError(`Mock design brief failed schema validation: ${parsed.error.message}`);
  return { designBrief: parsed.data, usage: mock.usage };
}
