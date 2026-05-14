import { z } from 'zod';
import net from 'node:net';

export const LEAD_STATUSES = [
  'new',
  'info_pull_queued',
  'info_pulled',
  'needs_review',
  'ready_for_site',
  'site_generation_queued',
  'site_generating',
  'site_generated',
  'site_deploying',
  'site_deployed',
  'site_failed',
  'contact_pending',
  'contacted',
  'discarded',
] as const;

export const SITE_STATUSES = [
  'not_started',
  'queued',
  'generating',
  'generated',
  'deploying',
  'deployed',
  'failed',
] as const;

export const JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'retrying',
] as const;

export const JOB_TYPES = [
  'pull_lead_info',
  'refresh_site_design',
  'generate_site',
  'deploy_site',
  'generate_and_deploy_site',
] as const;

export const WEBSITE_STATUSES = [
  'unknown',
  'none_found',
  'has_site',
  'bad_site',
  'social_only',
] as const;

export const EMAIL_FOLDERS = ['inbox', 'sent', 'outbox'] as const;

const googleMapsRegex = /^https?:\/\/(?:[a-z0-9-]+\.)*google\.[a-z.]+\/(maps|search|maps\/place)/i;
const googleShortRegex = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)\//i;

function isAllowedMailHostname(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  if (net.isIP(trimmed)) return false;
  if (trimmed === 'localhost' || trimmed.endsWith('.localhost') || trimmed.endsWith('.local')) return false;
  if (!/^[a-z0-9.-]+$/.test(trimmed)) return false;
  if (!trimmed.includes('.')) return false;
  return true;
}

const smtpPortSchema = z.coerce
  .number()
  .int()
  .refine((value) => [25, 465, 587, 2525].includes(value), 'Use a standard SMTP port');
const imapPortSchema = z.coerce
  .number()
  .int()
  .refine((value) => [143, 993].includes(value), 'Use a standard IMAP port');
const mailHostnameSchema = z
  .string()
  .max(255)
  .refine((value) => isAllowedMailHostname(value), 'Use a public mail server hostname');

export const googleProfileUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => googleMapsRegex.test(url) || googleShortRegex.test(url),
    'URL must be a Google Maps / Business Profile link',
  );

export const createLeadSchema = z.object({
  googleProfileUrl: googleProfileUrlSchema,
  notes: z.string().max(2000).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  businessName: z.string().min(1).max(200).optional().nullable(),
  category: z.string().max(200).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  postcode: z.string().max(40).optional().nullable(),
  country: z.string().max(60).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().email().optional().nullable(),
  existingWebsiteUrl: z.string().url().optional().nullable(),
  websiteStatus: z.enum(WEBSITE_STATUSES).optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().max(4000).optional().nullable(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// eslint-disable-next-line no-control-regex
const stripControlChars = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

export const generateSiteSchema = z.object({
  stylePreference: z.string().max(500).transform(stripControlChars).optional().default('modern local service business'),
  notes: z.string().max(2000).transform(stripControlChars).optional().default(''),
  brandName: z.string().max(80).transform(stripControlChars).optional().default(''),
  siteDesignBrief: z
    .object({
      designArchetype: z.string().min(1).max(80).transform(stripControlChars),
      visualMood: z.string().min(1).max(240).transform(stripControlChars),
      heroAngle: z.string().min(1).max(280).transform(stripControlChars),
      trustSignalPlan: z.string().min(1).max(320).transform(stripControlChars),
      trustpilotMode: z.enum(['placeholder', 'real_profile', 'omit']).default('placeholder'),
      trustpilotUrl: z.string().url().nullable().optional(),
      trustpilotRating: z.string().max(20).transform(stripControlChars).nullable().optional(),
      trustpilotReviewCount: z.string().max(40).transform(stripControlChars).nullable().optional(),
      servicesToEmphasise: z.array(z.string().min(1).max(80).transform(stripControlChars)).min(1).max(8),
      localPositioning: z.string().min(1).max(280).transform(stripControlChars),
      galleryStyle: z.string().min(1).max(240).transform(stripControlChars),
      ctaWording: z.string().min(1).max(100).transform(stripControlChars),
      avoidClaims: z.string().min(1).max(320).transform(stripControlChars),
    })
    .optional(),
});
export type GenerateSiteInput = z.infer<typeof generateSiteSchema>;

export const siteDesignBriefSchema = z.object({
  designArchetype: z.string().min(1).max(80),
  visualMood: z.string().min(1).max(240),
  heroAngle: z.string().min(1).max(280),
  trustSignalPlan: z.string().min(1).max(320),
  trustpilotMode: z.enum(['placeholder', 'real_profile', 'omit']),
  trustpilotUrl: z.string().url().nullable(),
  trustpilotRating: z.string().max(20).nullable(),
  trustpilotReviewCount: z.string().max(40).nullable(),
  servicesToEmphasise: z.array(z.string().min(1).max(80)).min(1).max(8),
  localPositioning: z.string().min(1).max(280),
  galleryStyle: z.string().min(1).max(240),
  ctaWording: z.string().min(1).max(100),
  avoidClaims: z.string().min(1).max(320),
});
export type SiteDesignBrief = z.infer<typeof siteDesignBriefSchema>;

export const leadsQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  q: z.string().max(200).optional(),
});

export const jobsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  leadId: z.string().uuid().optional(),
});

export const retryPayloadSchema = z.object({
  stylePreference: z.string().optional(),
  notes: z.string().optional(),
  generatedSiteId: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(12).max(200),
  name: z.string().max(120).optional().nullable(),
  role: z.enum(['admin', 'user']).optional().default('user'),
  isActive: z.boolean().optional().default(true),
  usageLimitPer24h: z.coerce.number().int().min(0).max(100).optional().default(3),
});

export const updateUserSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()).optional(),
  password: z.string().min(12).max(200).optional(),
  name: z.string().max(120).optional().nullable(),
  role: z.enum(['admin', 'user']).optional(),
  isActive: z.boolean().optional(),
  usageLimitPer24h: z.coerce.number().int().min(0).max(100).optional(),
});

export const updateAccountSettingsSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  vercelApiToken: z.string().min(1).max(300).optional(),
  clearVercelApiToken: z.boolean().optional().default(false),
  vercelTeamId: z.string().max(120).optional().nullable(),
  vercelProjectPrefix: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/i, 'Use letters, numbers, and hyphens only')
    .optional()
    .nullable(),
  openrouterApiKey: z.string().min(1).max(300).optional(),
  clearOpenrouterApiKey: z.boolean().optional().default(false),
  smtpHost: mailHostnameSchema.optional().nullable(),
  smtpPort: smtpPortSchema.nullable().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: z.string().max(320).optional().nullable(),
  smtpPassword: z.string().min(1).max(300).optional(),
  clearSmtpPassword: z.boolean().optional().default(false),
  smtpFromName: z.string().max(120).optional().nullable(),
  smtpFromEmail: z.string().email().optional().nullable(),
  imapHost: mailHostnameSchema.optional().nullable(),
  imapPort: imapPortSchema.nullable().optional(),
  imapSecure: z.boolean().optional(),
  imapUsername: z.string().max(320).optional().nullable(),
  imapPassword: z.string().min(1).max(300).optional(),
  clearImapPassword: z.boolean().optional().default(false),
}).superRefine((input, ctx) => {
  const hasSmtpFields = Boolean(
    input.smtpHost
    || input.smtpPort != null
    || input.smtpUsername
    || input.smtpPassword
    || input.smtpFromEmail,
  );
  if (hasSmtpFields) {
    if (!input.smtpHost) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpHost'], message: 'SMTP host is required when configuring email' });
    }
    if (input.smtpPort == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpPort'], message: 'SMTP port is required when configuring email' });
    }
    if (!input.smtpUsername) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpUsername'], message: 'SMTP username is required when configuring email' });
    }
    if (!input.smtpFromEmail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpFromEmail'], message: 'From email is required when configuring email' });
    }
  }

  const hasImapFields = Boolean(
    input.imapHost
    || input.imapPort != null
    || input.imapUsername
    || input.imapPassword,
  );
  if (hasImapFields) {
    if (!input.imapHost) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['imapHost'], message: 'Mailbox host is required when mailbox sync is configured' });
    }
    if (input.imapPort == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['imapPort'], message: 'Mailbox port is required when mailbox sync is configured' });
    }
  }
});

export const emailThreadsQuerySchema = z.object({
  folder: z.enum(EMAIL_FOLDERS).optional().default('inbox'),
  q: z.string().max(200).optional(),
});
export type EmailThreadsQuery = z.infer<typeof emailThreadsQuerySchema>;

export const sendEmailReplySchema = z.object({
  to: z.array(z.string().email()).max(10).optional(),
  cc: z.array(z.string().email()).max(10).optional().default([]),
  bcc: z.array(z.string().email()).max(10).optional().default([]),
  subject: z.string().min(1).max(300).transform(stripControlChars).optional(),
  body: z.string().min(1).max(20000).transform(stripControlChars),
});
export type SendEmailReplyInput = z.infer<typeof sendEmailReplySchema>;

/**
 * Sales-pitch generation: input + output schemas.
 *
 * The output schema is the structural contract enforced on every model
 * response before it is persisted to `sales_pitches`. Field length caps are
 * deliberately permissive to handle different providers' verbosity, but
 * generous enough to catch obvious garbage.
 */
export const generateSalesPitchInputSchema = z.object({
  /** Optional generated site to anchor the pitch around. If omitted the
   *  most recently created site for the lead is used (when present). */
  generatedSiteId: z.string().uuid().optional(),
  /** Free-text operator-supplied angle to bias the pitch. */
  operatorNotes: z.string().max(2000).optional().default(''),
});
export type GenerateSalesPitchInput = z.infer<typeof generateSalesPitchInputSchema>;

export const salesPitchOutputSchema = z.object({
  subjectLine: z.string().min(1).max(200),
  openingLine: z.string().min(1).max(500),
  painPoint: z.string().min(1).max(800),
  valueProposition: z.string().min(1).max(800),
  demoReference: z.string().min(1).max(800),
  callToAction: z.string().min(1).max(500),
  fullEmailDraft: z.string().min(1).max(4000),
  linkedinMessage: z.string().min(1).max(800),
});
export type SalesPitchOutput = z.infer<typeof salesPitchOutputSchema>;

export const websiteBriefSchema = z.object({
  businessName: z.string(),
  businessCategory: z.string(),
  targetCustomer: z.string(),
  primaryCTA: z.string(),
  brandTone: z.string(),
  colourDirection: z.string(),
  sections: z
    .array(
      z.object({
        title: z.string(),
        purpose: z.string(),
        contentNotes: z.string(),
      }),
    )
    .min(1),
});
export type WebsiteBrief = z.infer<typeof websiteBriefSchema>;
