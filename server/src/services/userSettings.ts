import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { decryptSecret } from '../lib/secretBox.js';

export type UserRole = 'admin' | 'user';

export type UserVercelConfig = {
  token: string;
  teamId: string | null;
  projectPrefix: string;
  source: 'platform' | 'user';
};

export type UserOpenRouterConfig = {
  apiKey: string;
  source: 'platform' | 'user';
};

export type UserSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string | null;
  fromEmail: string;
};

export type UserMailboxConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

export type UserEmailConfig = {
  smtp: UserSmtpConfig;
  mailbox: UserMailboxConfig | null;
  lastSyncedAt: string | null;
};

export function hasUsableVercelConfig(user: {
  vercelApiTokenEnc: string | null;
  vercelProjectPrefix: string | null;
}): boolean {
  return Boolean(user.vercelApiTokenEnc && user.vercelProjectPrefix?.trim());
}

export function hasUsableEmailConfig(user: {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordEnc: string | null;
  smtpFromEmail: string | null;
}): boolean {
  return Boolean(
    user.smtpHost?.trim()
    && user.smtpPort
    && user.smtpUsername?.trim()
    && user.smtpPasswordEnc
    && user.smtpFromEmail?.trim(),
  );
}

export function hasUsableMailboxSync(user: {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordEnc: string | null;
  smtpFromEmail: string | null;
  imapHost: string | null;
  imapPort: number | null;
}): boolean {
  return Boolean(hasUsableEmailConfig(user) && user.imapHost?.trim() && user.imapPort);
}

export async function getUserVercelConfig(userId: string): Promise<UserVercelConfig | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      vercelApiTokenEnc: true,
      vercelTeamId: true,
      vercelProjectPrefix: true,
    },
  });
  if (user?.role === 'admin' && env.VERCEL_API_TOKEN) {
    return {
      token: env.VERCEL_API_TOKEN,
      teamId: env.VERCEL_TEAM_ID || null,
      projectPrefix: env.VERCEL_PROJECT_PREFIX,
      source: 'platform',
    };
  }
  if (!user || !hasUsableVercelConfig(user)) return null;
  return {
    token: decryptSecret(user.vercelApiTokenEnc!),
    teamId: user.vercelTeamId?.trim() || null,
    projectPrefix: user.vercelProjectPrefix!.trim(),
    source: 'user',
  };
}

export async function getUserOpenRouterConfig(userId: string): Promise<UserOpenRouterConfig | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, openrouterApiKeyEnc: true },
  });
  if (user?.role === 'admin' && env.OPENROUTER_API_KEY) {
    return { apiKey: env.OPENROUTER_API_KEY, source: 'platform' };
  }
  if (user?.openrouterApiKeyEnc) {
    return { apiKey: decryptSecret(user.openrouterApiKeyEnc), source: 'user' };
  }
  if (env.OPENROUTER_API_KEY) {
    return { apiKey: env.OPENROUTER_API_KEY, source: 'platform' };
  }
  return null;
}

export async function getUserEmailConfig(userId: string): Promise<UserEmailConfig | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUsername: true,
      smtpPasswordEnc: true,
      smtpFromName: true,
      smtpFromEmail: true,
      imapHost: true,
      imapPort: true,
      imapSecure: true,
      imapUsername: true,
      imapPasswordEnc: true,
      emailLastSyncedAt: true,
    },
  });
  if (!user || !hasUsableEmailConfig(user)) return null;

  const smtp = {
    host: user.smtpHost!.trim(),
    port: user.smtpPort!,
    secure: user.smtpSecure,
    username: user.smtpUsername!.trim(),
    password: decryptSecret(user.smtpPasswordEnc!),
    fromName: user.smtpFromName?.trim() || null,
    fromEmail: user.smtpFromEmail!.trim(),
  };

  const mailbox = hasUsableMailboxSync(user)
    ? {
        host: user.imapHost!.trim(),
        port: user.imapPort!,
        secure: user.imapSecure,
        username: user.imapUsername?.trim() || smtp.username,
        password: user.imapPasswordEnc ? decryptSecret(user.imapPasswordEnc) : smtp.password,
      }
    : null;

  return {
    smtp,
    mailbox,
    lastSyncedAt: user.emailLastSyncedAt?.toISOString() ?? null,
  };
}

export async function getGenerationUsage(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, usageLimitPer24h: true, openrouterApiKeyEnc: true },
  });
  if (!user) return { used: 0, limit: 0, remaining: 0 };
  if (user.role === 'admin' || user.openrouterApiKeyEnc) {
    return { used: 0, limit: null, remaining: null };
  }

  const used = await prisma.siteJob.count({
    where: {
      createdAt: { gte: since },
      jobType: { in: ['generate_site', 'generate_and_deploy_site'] },
      status: { in: ['queued', 'running', 'succeeded'] },
      lead: { createdByUserId: userId },
    },
  });

  return {
    used,
    limit: user.usageLimitPer24h,
    remaining: Math.max(0, user.usageLimitPer24h - used),
  };
}
