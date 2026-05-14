/**
 * Re-exports for the prompt templates.
 *
 * All centralised prompt strings live in `server/src/prompts/`. Edit the
 * individual files (websitePrompt.ts, salesPitchPrompt.ts) to retune voice,
 * style, or guardrails for the corresponding LLM workflow.
 */
export {
  WEBSITE_BRIEF_SYSTEM_PROMPT,
  WEBSITE_BRIEF_JSON_SHAPE,
  SITE_DESIGN_BRIEF_SYSTEM_PROMPT,
  SITE_DESIGN_BRIEF_JSON_SHAPE,
  buildWebsiteBriefUserPrompt,
  buildSiteDesignBriefPrompt,
  HTML_GENERATION_SYSTEM_PROMPT,
  getHtmlGenerationSystemPrompt,
  buildHtmlGenerationPrompt,
  type WebsitePromptInput,
  type SiteDesignBriefPromptInput,
  type HtmlGenerationInput,
} from './websitePrompt.js';

export {
  SALES_PITCH_SYSTEM_PROMPT,
  SALES_PITCH_JSON_SHAPE,
  buildSalesPitchUserPrompt,
  type SalesPitchPromptInput,
} from './salesPitchPrompt.js';
