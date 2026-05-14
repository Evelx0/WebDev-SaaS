/**
 * Sales-pitch generation service.
 *
 * Given a lead and a generated demo site, produces a tailored outreach pitch
 * (email + LinkedIn copy) that the operator can review and send manually.
 *
 * Routing:
 *   - Defaults to OpenRouter (per product spec). Reasoning: this workflow is
 *     run frequently per lead and the cheap-model routing OpenRouter offers
 *     is a better fit than Anthropic's premium pricing.
 *   - When `OPENROUTER_API_KEY` is missing, falls back to a clearly-labelled
 *     mock generator so the full UI flow is exercisable in local development.
 *
 * The service does NOT send any email. It returns a structured pitch which
 * the route handler persists to `sales_pitches`. Sending is a separate,
 * future, manually-approved phase.
 */
import {
  AiGatewayError,
  aiCompleteOpenRouterRotate,
  extractJson,
  type AiCallOptions,
  type AiUsage,
} from './aiGateway.js';
import {
  SALES_PITCH_SYSTEM_PROMPT,
  buildSalesPitchUserPrompt,
  type SalesPitchPromptInput,
} from '../prompts/index.js';
import {
  salesPitchOutputSchema,
  type SalesPitchOutput,
} from '../schemas/index.js';

const PITCH_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'xiaomi/mimo-v2-flash:free',
  'xiaomi/mimo-v2-flash',
] as const;

export interface SalesPitchResult {
  pitch: SalesPitchOutput;
  usage: AiUsage;
}

/**
 * Deterministic mock pitch used when OPENROUTER_API_KEY is missing.
 * Clearly labelled so accidental production use is obvious.
 */
function mockSalesPitch(input: SalesPitchPromptInput): SalesPitchResult {
  const name = input.lead.businessName;
  const city = input.lead.city ?? 'your area';
  const category = input.lead.category ?? 'local business';
  const demoUrl = input.demo.vercelUrl ?? '(demo URL pending)';

  const pitch: SalesPitchOutput = {
    subjectLine: `[mock pitch] A quick site idea for ${name}`.slice(0, 200),
    openingLine: `Saw your ${category} listing in ${city} and put together a quick concept site for you.`,
    painPoint: `Most ${category}s in ${city} get found on a phone, and a clear, fast site beats a Facebook-only page every time.`,
    valueProposition: `Cleaner first impression, easier to update, and built to turn searches into phone calls — no jargon, no monthly bloat.`,
    demoReference: `You can preview the concept here: ${demoUrl}. No signup, nothing to install.`,
    callToAction: `If anything in there feels useful, reply and I'll tailor it further.`,
    fullEmailDraft: [
      `Hi,`,
      ``,
      `Saw your ${category} listing in ${city} and put together a quick concept site for you to look at — nothing to sign up for.`,
      ``,
      `Most owners I talk to want the same thing: a clean page that loads fast on a phone, makes the contact details obvious, and is easy to update later. That's what I tried to build.`,
      ``,
      `Have a look here: ${demoUrl}`,
      ``,
      `If it's useful, reply and I'll tailor it. If not, no worries.`,
      ``,
      `[mock pitch — generated locally because OPENROUTER_API_KEY was missing]`,
    ].join('\n'),
    linkedinMessage: [
      `Hi — I put together a quick concept site for ${name} (no signup, just a preview): ${demoUrl}.`,
      `Happy to tailor it if it's useful, otherwise feel free to ignore.`,
    ].join(' '),
  };

  return {
    pitch,
    usage: { provider: 'mock', model: 'mock-pitch-v0' },
  };
}

/**
 * Produce a sales pitch for a lead. Uses OpenRouter when the key is set,
 * else returns a labelled mock. Output is Zod-validated before return — any
 * malformed model response surfaces as an `AiGatewayError`.
 */
export async function generateSalesPitch(
  input: SalesPitchPromptInput,
  aiOptions: AiCallOptions = {},
): Promise<SalesPitchResult> {
  const systemPrompt = SALES_PITCH_SYSTEM_PROMPT;
  const userPrompt = buildSalesPitchUserPrompt(input);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const completion = await aiCompleteOpenRouterRotate(messages, PITCH_MODELS, {
    ...aiOptions,
    jsonMode: true,
    temperature: 0.7,
    maxTokens: 1200,
  });

  // If we got the mock provider back, build a deterministic mock pitch
  // ourselves. The mock completion text is not structured.
  if (completion.usage.provider === 'mock') {
    return mockSalesPitch(input);
  }

  let parsedJson: unknown;
  try {
    parsedJson = extractJson(completion.text);
  } catch (err) {
    throw new AiGatewayError(
      `Sales pitch model output was not valid JSON: ${(err as Error).message}`,
      err,
    );
  }
  const validated = salesPitchOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new AiGatewayError(
      `Sales pitch failed schema validation: ${validated.error.message}`,
    );
  }
  return { pitch: validated.data, usage: completion.usage };
}
