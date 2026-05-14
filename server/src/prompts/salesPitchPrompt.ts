/**
 * Centralised prompts for the sales-pitch generation workflow.
 *
 * The pitch agent runs *after* a demo site has been generated for a lead.
 * Its job is to produce tailored outreach content (email + LinkedIn) that
 * references the actual lead and the actual generated demo site.
 *
 * Output is consumed by `services/salesPitch.ts -> generateSalesPitch()`
 * and validated by `schemas/index.ts -> salesPitchOutputSchema`.
 *
 * Tuning rules baked into these prompts:
 *   - The pitch must be honest about what the demo is: a free, no-obligation
 *     concept created speculatively for the business.
 *   - It must avoid spammy, hyperbolic, or fake-urgency language.
 *   - It must never invent testimonials, awards, statistics, or guarantees.
 *   - It must reference one or two concrete, plausible benefits framed in the
 *     business owner's language, not marketing-agency jargon.
 *   - All copy must be plain text suitable for direct paste into an email
 *     client or LinkedIn — no Markdown, no HTML, no asterisks.
 */

export interface SalesPitchPromptInput {
  /** The lead the pitch is for. */
  lead: {
    businessName: string;
    category: string | null;
    city: string | null;
    country: string | null;
    existingWebsiteUrl: string | null;
    websiteStatus: string;
    notes: string | null;
  };
  /** The generated demo site we want to point the lead to. */
  demo: {
    /** Public URL of the deployed demo, or null if not yet deployed. */
    vercelUrl: string | null;
    siteTitle: string | null;
    siteSummary: string | null;
  };
  /** Operator-supplied free text to influence the angle of the pitch. */
  operatorNotes?: string;
  /** W1: category insights from web research (optional enrichment). */
  researchData?: {
    categoryInsights: string;
    typicalPainPoints: string[];
    webPresenceNotes: string;
  } | null;
  /** W2: competitor landscape (optional enrichment). */
  competitorData?: {
    competitors: Array<{ name: string; url: string | null }>;
    marketContext: string;
  } | null;
  /** W3: PageSpeed scores comparing old site vs new demo (optional enrichment). */
  pageSpeedData?: {
    old: { performanceScore: number | null; seoScore: number | null } | null;
    new: { performanceScore: number | null; seoScore: number | null } | null;
  } | null;
}

export const SALES_PITCH_SYSTEM_PROMPT = `You are a senior sales director with 20 years of experience selling to trades, hospitality, and local service businesses. You have personally closed hundreds of deals with plumbers, landscapers, restaurants, garages, and similar owner-run operations. You understand these owners deeply:

- They work with their hands. Admin is a distraction, not a priority.
- They get cold-called and cold-emailed constantly. They delete most of it in seconds.
- They are not impressed by agency speak, growth hacking, or digital transformation language.
- Their real problem is simple: the phone isn't ringing as much as it should, and they know it.
- They trust word of mouth and concrete specifics — not promises, not statistics.

Your outreach philosophy:
You never pitch. You show up with something already done, explain what it is in one sentence, and let them decide. You write like a person, not a company. You reference something specific about their business to prove you actually looked. You name the one real pain — the thing keeping them up at night — without dramatising it. You then show, briefly, how the demo site addresses exactly that. One clear next step. Done.

Voice rules:
- Write in first person, as yourself, not "our team" or "we at [company]".
- Sentences under 20 words. Paragraphs under 4 lines.
- No adjectives that aren't doing work ("amazing", "incredible", "cutting-edge", "game-changing" — bin them all).
- No passive voice. No weasel words ("solutions", "leverage", "synergy", "optimise").
- Sound like a person who respects the recipient's time, not a person who needs the sale.
- Warmth without sycophancy. Direct without being blunt.

What to focus on (in order of priority):
1. The gap between where their customers search and where the business currently appears.
2. The specific friction their current online presence creates (no site, hard-to-find number, looks dated on a phone).
3. What the demo already solves — concretely, not abstractly.
4. The ease of the next step — no commitment, no form, no signup.

Hard rules — never break these:
- Do not invent testimonials, statistics, client names, or case studies.
- Do not claim specific results ("3x more leads") unless supplied in the input data.
- Do not invent awards, certifications, or accreditations.
- Do not create fake urgency ("limited slots", "offer expires", "only 3 spots left").
- Do not pretend to know facts not in the input — if unsure, omit it.
- Plain text only in all fields. No HTML, Markdown, asterisks, bullet points, or hashes.
- fullEmailDraft must be under 130 words. Every word must earn its place.
- linkedinMessage must be under 280 characters. Conversational, not formal.

Output STRICT JSON only matching the supplied shape — no prose, no Markdown, no code fences.`;


/**
 * Exact JSON output shape — keep in sync with `salesPitchOutputSchema`.
 */
export const SALES_PITCH_JSON_SHAPE = `{
  "subjectLine": string,
  "openingLine": string,
  "painPoint": string,
  "valueProposition": string,
  "demoReference": string,
  "callToAction": string,
  "fullEmailDraft": string,
  "linkedinMessage": string
}`;

export function buildSalesPitchUserPrompt(input: SalesPitchPromptInput): string {
  const { lead, demo, operatorNotes, researchData, competitorData, pageSpeedData } = input;
  const location = [lead.city, lead.country].filter(Boolean).join(', ') || 'unknown';
  const websiteState = lead.existingWebsiteUrl
    ? `existing site: ${lead.existingWebsiteUrl} (status: ${lead.websiteStatus})`
    : `no website found (status: ${lead.websiteStatus})`;
  const demoLine = demo.vercelUrl
    ? `Demo URL: ${demo.vercelUrl}`
    : 'Demo URL: (not yet deployed — write demoReference assuming the URL will be supplied separately)';

  const lines: string[] = [
    'Produce a tailored outreach pitch as strict JSON. Output JSON only — no code fences, no commentary.',
    '',
    'Lead context:',
    `- Business name: ${lead.businessName}`,
    `- Category: ${lead.category ?? 'unknown'}`,
    `- Location: ${location}`,
    `- Website state: ${websiteState}`,
    `- Operator notes on the lead: ${lead.notes ?? 'none'}`,
    '',
    'Demo site context:',
    `- ${demoLine}`,
    `- Site title: ${demo.siteTitle ?? 'unknown'}`,
    `- Site summary: ${demo.siteSummary ?? 'unknown'}`,
  ];

  if (researchData) {
    lines.push(
      '',
      'Business research (use to personalise the pitch):',
      `- Category insights: ${researchData.categoryInsights}`,
      `- Typical owner pain points: ${researchData.typicalPainPoints.join('; ')}`,
      `- Web presence notes: ${researchData.webPresenceNotes}`,
    );
  }

  if (competitorData && (competitorData.competitors.length > 0 || competitorData.marketContext)) {
    lines.push('', 'Competitive landscape:');
    lines.push(`- Market context: ${competitorData.marketContext}`);
    if (competitorData.competitors.length > 0) {
      const names = competitorData.competitors.map((c) => c.name).join(', ');
      lines.push(`- Known competitors in area: ${names}`);
      lines.push(
        '  (You may reference the competitive landscape in general terms, but do NOT name',
        '  specific competitors in the pitch copy — this is outreach to the business owner.)',
      );
    }
  }

  if (pageSpeedData?.new) {
    const newPerf = pageSpeedData.new.performanceScore;
    const oldPerf = pageSpeedData.old?.performanceScore;
    if (newPerf != null) {
      const delta =
        oldPerf != null ? ` vs ${oldPerf} for their existing site` : ' (no existing site to compare)';
      lines.push(
        '',
        'PageSpeed scores (mobile, 0–100):',
        `- New demo site: performance ${newPerf}${delta}`,
        '  If the new score is meaningfully better than the old, you may reference that the',
        '  demo loads faster on phones — but only if the gap is at least 15 points.',
      );
    }
  }

  if (operatorNotes?.trim()) {
    lines.push('', 'Operator pitch notes:', operatorNotes.trim());
  }

  lines.push(
    '',
    'Field guidance:',
    '- subjectLine: under 60 chars. Reference the business or its category — never "Re:" tricks.',
    '- openingLine: one sentence. Show you have looked at the business.',
    '- painPoint: one sentence in the owner\'s language about a real, plausible problem',
    '  (no website, hard-to-find phone number, looks dated on a phone, etc.).',
    '- valueProposition: one sentence. Outcome-led, plain English.',
    '- demoReference: one sentence pointing to the demo URL with no signup language.',
    '- callToAction: one short imperative ("Reply if it looks useful").',
    '- fullEmailDraft: exactly 3 short paragraphs, under 130 words total. Plain text only. No sign-off, no "Best regards", no name.',
    '- linkedinMessage: STRICT 280 char maximum. Count carefully. Friendlier register, no fake urgency.',
    '',
    'Output JSON only. No code fences. No commentary.',
  );

  return lines.join('\n');
}
