import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),

  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),

  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-latest'),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_MODEL: z.string().default('openrouter/auto'),

  GOOGLE_PLACES_API_KEY: z.string().optional().default(''),
  SERPAPI_API_KEY: z.string().optional().default(''),

  VERCEL_API_TOKEN: z.string().optional().default(''),
  VERCEL_TEAM_ID: z.string().optional().default(''),
  VERCEL_PROJECT_PREFIX: z.string().default('lead-demo'),

  EMAIL_PROVIDER: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),
  POSTMARK_SERVER_TOKEN: z.string().optional().default(''),
  FROM_EMAIL: z.string().optional().default(''),

  GENERATED_SITES_DIR: z.string().default('/app/generated-sites'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: AppEnv = parsed.data;

export const flags = {
  hasAnthropic: !!env.ANTHROPIC_API_KEY,
  hasOpenRouter: !!env.OPENROUTER_API_KEY,
  hasAnyAi: !!env.ANTHROPIC_API_KEY || !!env.OPENROUTER_API_KEY,
  hasGooglePlaces: !!env.GOOGLE_PLACES_API_KEY,
  hasSerpApi: !!env.SERPAPI_API_KEY,
  hasVercel: !!env.VERCEL_API_TOKEN,
};
