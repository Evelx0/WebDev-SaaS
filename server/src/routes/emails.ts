import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/error.js';
import { emailThreadsQuerySchema, sendEmailReplySchema } from '../schemas/index.js';
import {
  sendReplyForThread,
  syncMailboxForUser,
} from '../services/emailMailbox.js';
import { hasUsableEmailConfig, hasUsableMailboxSync } from '../services/userSettings.js';

export const emailsRouter = Router();

async function getEmailCapability(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpUsername: true,
      smtpPasswordEnc: true,
      smtpFromEmail: true,
      imapHost: true,
      imapPort: true,
      emailLastSyncedAt: true,
    },
  });
  if (!user || !hasUsableEmailConfig(user)) {
    throw new HttpError(400, 'smtp_settings_required', 'Add SMTP details in account settings before using Emails.');
  }
  return {
    hasMailboxSync: hasUsableMailboxSync(user),
    emailLastSyncedAt: user.emailLastSyncedAt?.toISOString() ?? null,
  };
}

emailsRouter.get('/threads', async (req, res, next) => {
  try {
    const { folder, q } = emailThreadsQuerySchema.parse(req.query);
    const capability = await getEmailCapability(req.session!.sub);
    const where = {
      userId: req.session!.sub,
      messages: { some: { folder } },
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: 'insensitive' as const } },
              { participantEmail: { contains: q, mode: 'insensitive' as const } },
              { participantName: { contains: q, mode: 'insensitive' as const } },
              { lead: { businessName: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [threads, inboxCount, sentCount, outboxCount] = await Promise.all([
      prisma.emailThread.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take: 100,
        include: {
          lead: {
            select: {
              id: true,
              businessName: true,
              email: true,
            },
          },
          messages: {
            where: { folder },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              folder: true,
              direction: true,
              deliveryStatus: true,
              snippet: true,
              sentAt: true,
              receivedAt: true,
              deliveredAt: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.emailThread.count({ where: { userId: req.session!.sub, messages: { some: { folder: 'inbox' } } } }),
      prisma.emailThread.count({ where: { userId: req.session!.sub, messages: { some: { folder: 'sent' } } } }),
      prisma.emailThread.count({ where: { userId: req.session!.sub, messages: { some: { folder: 'outbox' } } } }),
    ]);

    res.json({
      folder,
      counts: {
        inbox: inboxCount,
        sent: sentCount,
        outbox: outboxCount,
      },
      hasMailboxSync: capability.hasMailboxSync,
      emailLastSyncedAt: capability.emailLastSyncedAt,
      threads: threads.map((thread) => ({
        id: thread.id,
        subject: thread.subject,
        participantEmail: thread.participantEmail,
        participantName: thread.participantName,
        lastMessageAt: thread.lastMessageAt,
        lastMessagePreview: thread.lastMessagePreview,
        lead: thread.lead,
        latestMessage: thread.messages[0] ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

emailsRouter.get('/threads/:threadId', async (req, res, next) => {
  try {
    await getEmailCapability(req.session!.sub);
    const thread = await prisma.emailThread.findFirst({
      where: { id: req.params.threadId, userId: req.session!.sub },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            email: true,
            city: true,
            phone: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!thread) throw new HttpError(404, 'email_thread_not_found', 'Email thread not found.');
    res.json(thread);
  } catch (err) {
    next(err);
  }
});

emailsRouter.post('/threads/:threadId/reply', async (req, res, next) => {
  try {
    const input = sendEmailReplySchema.parse(req.body ?? {});
    const message = await sendReplyForThread(req.session!.sub, req.params.threadId, input);
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

emailsRouter.post('/sync', async (req, res, next) => {
  try {
    const result = await syncMailboxForUser(req.session!.sub);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
