import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { encryptSecret } from '../lib/secretBox.js';
import { updateAccountSettingsSchema } from '../schemas/index.js';
import {
  getGenerationUsage,
  hasUsableEmailConfig,
  hasUsableMailboxSync,
} from '../services/userSettings.js';

export const accountRouter = Router();

accountRouter.get('/settings', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session!.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        usageLimitPer24h: true,
        vercelTeamId: true,
        vercelProjectPrefix: true,
        vercelApiTokenEnc: true,
        openrouterApiKeyEnc: true,
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
    const usage = await getGenerationUsage(req.session!.sub);
    res.json({
      id: user?.id,
      email: user?.email,
      name: user?.name,
      role: user?.role,
      usageLimitPer24h: user?.usageLimitPer24h ?? 0,
      usage,
      vercelTeamId: user?.vercelTeamId ?? '',
      vercelProjectPrefix: user?.vercelProjectPrefix ?? '',
      hasVercelConfig: user?.role === 'admin' || Boolean(user?.vercelApiTokenEnc && user.vercelProjectPrefix),
      hasOpenRouterKey: Boolean(user?.openrouterApiKeyEnc),
      hasEmailConfig: Boolean(user && hasUsableEmailConfig(user)),
      hasMailboxSync: Boolean(user && hasUsableMailboxSync(user)),
      smtpHost: user?.smtpHost ?? '',
      smtpPort: user?.smtpPort ?? 587,
      smtpSecure: user?.smtpSecure ?? true,
      smtpUsername: user?.smtpUsername ?? '',
      smtpFromName: user?.smtpFromName ?? '',
      smtpFromEmail: user?.smtpFromEmail ?? '',
      hasSmtpPassword: Boolean(user?.smtpPasswordEnc),
      imapHost: user?.imapHost ?? '',
      imapPort: user?.imapPort ?? 993,
      imapSecure: user?.imapSecure ?? true,
      imapUsername: user?.imapUsername ?? '',
      hasImapPassword: Boolean(user?.imapPasswordEnc),
      emailLastSyncedAt: user?.emailLastSyncedAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

accountRouter.patch('/settings', async (req, res, next) => {
  try {
    const input = updateAccountSettingsSchema.parse(req.body ?? {});
    const data: {
      name?: string | null;
      vercelApiTokenEnc?: string | null;
      vercelTeamId?: string | null;
      vercelProjectPrefix?: string | null;
      openrouterApiKeyEnc?: string | null;
      smtpHost?: string | null;
      smtpPort?: number | null;
      smtpSecure?: boolean;
      smtpUsername?: string | null;
      smtpPasswordEnc?: string | null;
      smtpFromName?: string | null;
      smtpFromEmail?: string | null;
      imapHost?: string | null;
      imapPort?: number | null;
      imapSecure?: boolean;
      imapUsername?: string | null;
      imapPasswordEnc?: string | null;
    } = {};
    if (input.name !== undefined) data.name = input.name || null;
    if (input.clearVercelApiToken) data.vercelApiTokenEnc = null;
    if (input.vercelApiToken) data.vercelApiTokenEnc = encryptSecret(input.vercelApiToken);
    if (input.vercelTeamId !== undefined) data.vercelTeamId = input.vercelTeamId?.trim() || null;
    if (input.vercelProjectPrefix !== undefined) {
      data.vercelProjectPrefix = input.vercelProjectPrefix?.toLowerCase().trim() || null;
    }
    if (input.clearOpenrouterApiKey) data.openrouterApiKeyEnc = null;
    if (input.openrouterApiKey) data.openrouterApiKeyEnc = encryptSecret(input.openrouterApiKey);
    if (input.smtpHost !== undefined) data.smtpHost = input.smtpHost?.trim() || null;
    if (input.smtpPort !== undefined) data.smtpPort = input.smtpPort ?? null;
    if (input.smtpSecure !== undefined) data.smtpSecure = input.smtpSecure;
    if (input.smtpUsername !== undefined) data.smtpUsername = input.smtpUsername?.trim() || null;
    if (input.clearSmtpPassword) data.smtpPasswordEnc = null;
    if (input.smtpPassword) data.smtpPasswordEnc = encryptSecret(input.smtpPassword);
    if (input.smtpFromName !== undefined) data.smtpFromName = input.smtpFromName?.trim() || null;
    if (input.smtpFromEmail !== undefined) data.smtpFromEmail = input.smtpFromEmail?.trim().toLowerCase() || null;
    if (input.imapHost !== undefined) data.imapHost = input.imapHost?.trim() || null;
    if (input.imapPort !== undefined) data.imapPort = input.imapPort ?? null;
    if (input.imapSecure !== undefined) data.imapSecure = input.imapSecure;
    if (input.imapUsername !== undefined) data.imapUsername = input.imapUsername?.trim() || null;
    if (input.clearImapPassword) data.imapPasswordEnc = null;
    if (input.imapPassword) data.imapPasswordEnc = encryptSecret(input.imapPassword);

    const user = await prisma.user.update({
      where: { id: req.session!.sub },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        usageLimitPer24h: true,
        vercelTeamId: true,
        vercelProjectPrefix: true,
        vercelApiTokenEnc: true,
        openrouterApiKeyEnc: true,
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
    const usage = await getGenerationUsage(req.session!.sub);
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      usageLimitPer24h: user.usageLimitPer24h,
      usage,
      vercelTeamId: user.vercelTeamId ?? '',
      vercelProjectPrefix: user.vercelProjectPrefix ?? '',
      hasVercelConfig: user.role === 'admin' || Boolean(user.vercelApiTokenEnc && user.vercelProjectPrefix),
      hasOpenRouterKey: Boolean(user.openrouterApiKeyEnc),
      hasEmailConfig: hasUsableEmailConfig(user),
      hasMailboxSync: hasUsableMailboxSync(user),
      smtpHost: user.smtpHost ?? '',
      smtpPort: user.smtpPort ?? 587,
      smtpSecure: user.smtpSecure,
      smtpUsername: user.smtpUsername ?? '',
      smtpFromName: user.smtpFromName ?? '',
      smtpFromEmail: user.smtpFromEmail ?? '',
      hasSmtpPassword: Boolean(user.smtpPasswordEnc),
      imapHost: user.imapHost ?? '',
      imapPort: user.imapPort ?? 993,
      imapSecure: user.imapSecure,
      imapUsername: user.imapUsername ?? '',
      hasImapPassword: Boolean(user.imapPasswordEnc),
      emailLastSyncedAt: user.emailLastSyncedAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});
