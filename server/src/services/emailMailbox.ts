import { randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
// @ts-expect-error mailparser ships without bundled types in this project setup.
import { simpleParser } from 'mailparser';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../middleware/error.js';
import { getUserEmailConfig } from './userSettings.js';

export type MailFolder = 'inbox' | 'sent' | 'outbox';

type MailAddress = {
  address: string;
  name: string | null;
};

type MailboxSyncResult = {
  synced: boolean;
  inboxImported: number;
  sentImported: number;
  lastSyncedAt: string | null;
};

type ThreadSeed = {
  userId: string;
  leadId: string | null;
  participantEmail: string;
  participantName: string | null;
  subject: string;
  normalizedSubject: string;
  preview: string | null;
  happenedAt: Date;
  referenceHeaders: string[];
};

type ParsedMessage = {
  syncKey: string;
  folder: MailFolder;
  direction: 'incoming' | 'outgoing';
  deliveryStatus: 'received' | 'delivered';
  externalMessageId: string | null;
  messageIdHeader: string | null;
  inReplyToHeader: string | null;
  referenceHeaders: string[];
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  participant: MailAddress | null;
  textBody: string | null;
  htmlBody: string | null;
  snippet: string | null;
  happenedAt: Date;
  leadId: string | null;
};

type ParsedMailLike = {
  subject?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | string[] | null;
  date?: Date | null;
  text?: string | null;
  html?: string | false | null;
  from?: { value?: Array<{ address?: string | null; name?: string | null }> } | null;
  to?: { value?: Array<{ address?: string | null; name?: string | null }> } | null;
  cc?: { value?: Array<{ address?: string | null; name?: string | null }> } | null;
  bcc?: { value?: Array<{ address?: string | null; name?: string | null }> } | null;
};

type ImapMailboxListEntry = {
  path?: string;
  specialUse?: string | null;
};

type ImapEnvelopeAddress = {
  address?: string | null;
  name?: string | null;
};

type ImapEnvelope = {
  subject?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  from?: ImapEnvelopeAddress[];
  to?: ImapEnvelopeAddress[];
  cc?: ImapEnvelopeAddress[];
  bcc?: ImapEnvelopeAddress[];
};

type ImapFetchMessage = {
  uid?: number;
  envelope?: ImapEnvelope;
  source?: Buffer;
  internalDate?: Date;
  size?: number;
};

const MAX_SYNC_MESSAGE_BYTES = 2 * 1024 * 1024;

function isPrivateIpv4(address: string) {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb');
}

function isPublicIp(address: string) {
  const version = net.isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version === 6) return !isPrivateIpv6(address);
  return false;
}

async function assertPublicMailHost(host: string) {
  if (net.isIP(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new HttpError(400, 'invalid_mail_host', 'Mail host must be a public hostname.');
  }

  const resolved = await dns.lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!resolved.length || resolved.some((record) => !isPublicIp(record.address))) {
    throw new HttpError(400, 'invalid_mail_host', 'Mail host must resolve only to public IP addresses.');
  }
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function normalizeSubject(value: string | null | undefined): string {
  const raw = value?.trim() || '(no subject)';
  return raw.replace(/^(re|fw|fwd)\s*:\s*/gi, '').trim().toLowerCase() || '(no subject)';
}

function buildSnippet(value: string | null | undefined): string | null {
  if (!value) return null;
  const squashed = value.replace(/\s+/g, ' ').trim();
  if (!squashed) return null;
  return squashed.slice(0, 180);
}

function mapAddress(address: { address?: string | null; name?: string | null } | null | undefined): MailAddress | null {
  const normalized = normalizeEmail(address?.address);
  if (!normalized) return null;
  return {
    address: normalized,
    name: address?.name?.trim() || null,
  };
}

function mapAddressList(
  source:
    | { value?: Array<{ address?: string | null; name?: string | null }> }
    | Array<{ address?: string | null; name?: string | null }>
    | null
    | undefined,
): MailAddress[] {
  const items = Array.isArray(source)
    ? source
    : Array.isArray(source?.value)
      ? source.value
      : [];
  return items
    .map((item) => mapAddress(item))
    .filter((item): item is MailAddress => Boolean(item));
}

function uniqueAddresses(addresses: MailAddress[]): MailAddress[] {
  const seen = new Set<string>();
  const unique: MailAddress[] = [];
  for (const address of addresses) {
    if (seen.has(address.address)) continue;
    seen.add(address.address);
    unique.push(address);
  }
  return unique;
}

function chooseParticipant(
  direction: 'incoming' | 'outgoing',
  ownEmail: string,
  from: MailAddress | null,
  to: MailAddress[],
  cc: MailAddress[],
): MailAddress | null {
  const candidates = direction === 'incoming'
    ? [from, ...to, ...cc]
    : [...to, ...cc, from];
  return candidates.find((candidate) => candidate && candidate.address !== ownEmail) ?? null;
}

async function findLeadForParticipant(userId: string, participantEmail: string | null): Promise<string | null> {
  if (!participantEmail) return null;
  const lead = await prisma.lead.findFirst({
    where: {
      createdByUserId: userId,
      email: { equals: participantEmail, mode: 'insensitive' },
    },
    select: { id: true },
  });
  return lead?.id ?? null;
}

async function resolveThread(seed: ThreadSeed) {
  if (seed.referenceHeaders.length > 0) {
    const related = await prisma.emailMessage.findFirst({
      where: {
        userId: seed.userId,
        messageIdHeader: { in: seed.referenceHeaders },
      },
      select: { threadId: true },
    });
    if (related) {
      return prisma.emailThread.update({
        where: { id: related.threadId },
        data: {
          leadId: seed.leadId ?? undefined,
          participantName: seed.participantName ?? undefined,
          lastMessageAt: seed.happenedAt,
          lastMessagePreview: seed.preview,
          subject: seed.subject,
        },
      });
    }
  }

  return prisma.emailThread.upsert({
    where: {
      email_threads_user_participant_subject_key: {
        userId: seed.userId,
        participantEmail: seed.participantEmail,
        normalizedSubject: seed.normalizedSubject,
      },
    },
    create: {
      userId: seed.userId,
      leadId: seed.leadId,
      participantEmail: seed.participantEmail,
      participantName: seed.participantName,
      subject: seed.subject,
      normalizedSubject: seed.normalizedSubject,
      lastMessageAt: seed.happenedAt,
      lastMessagePreview: seed.preview,
    },
    update: {
      leadId: seed.leadId ?? undefined,
      participantName: seed.participantName ?? undefined,
      lastMessageAt: seed.happenedAt,
      lastMessagePreview: seed.preview,
      subject: seed.subject,
    },
  });
}

function extractParsedText(parsed: ParsedMailLike): { textBody: string | null; htmlBody: string | null; snippet: string | null } {
  const textBody = parsed.text?.trim() || null;
  const htmlBody = typeof parsed.html === 'string' ? parsed.html : null;
  return {
    textBody,
    htmlBody,
    snippet: buildSnippet(textBody ?? parsed.subject),
  };
}

function extractReferenceHeaders(parsed: ParsedMailLike, envelope: ImapEnvelope | undefined): string[] {
  const raw = [
    parsed.inReplyTo,
    ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []),
    envelope?.inReplyTo,
  ];
  return [...new Set(raw.map((value) => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value)))];
}

async function parseMailboxMessage(
  userId: string,
  ownEmail: string,
  folder: MailFolder,
  message: ImapFetchMessage,
): Promise<ParsedMessage | null> {
  const parsed = message.source ? await simpleParser(message.source) : null;
  const envelope = message.envelope;
  const from = mapAddressList(parsed?.from ?? envelope?.from)[0] ?? null;
  const to = uniqueAddresses(mapAddressList(parsed?.to ?? envelope?.to));
  const cc = uniqueAddresses(mapAddressList(parsed?.cc ?? envelope?.cc));
  const bcc = uniqueAddresses(mapAddressList(parsed?.bcc ?? envelope?.bcc));
  const subject = parsed?.subject?.trim() || envelope?.subject?.trim() || '(no subject)';
  const messageIdHeader = normalizeEmailLikeHeader(parsed?.messageId ?? envelope?.messageId ?? null);
  const inReplyToHeader = normalizeEmailLikeHeader(parsed?.inReplyTo ?? envelope?.inReplyTo ?? null);
  const referenceHeaders = extractReferenceHeaders((parsed ?? {}) as ParsedMailLike, envelope);
  const participant = chooseParticipant(folder === 'inbox' ? 'incoming' : 'outgoing', ownEmail, from, to, cc);
  if (!participant) return null;
  const leadId = await findLeadForParticipant(userId, participant.address);
  const happenedAt = parsed?.date ?? message.internalDate ?? new Date();
  const body = parsed ? extractParsedText(parsed) : { textBody: null, htmlBody: null, snippet: buildSnippet(subject) };
  const syncKey = messageIdHeader ? `msgid:${messageIdHeader}` : `imap:${folder}:${message.uid ?? randomUUID()}`;

  return {
    syncKey,
    folder,
    direction: folder === 'inbox' ? 'incoming' : 'outgoing',
    deliveryStatus: folder === 'inbox' ? 'received' : 'delivered',
    externalMessageId: messageIdHeader,
    messageIdHeader,
    inReplyToHeader,
    referenceHeaders,
    subject,
    from,
    to,
    cc,
    bcc,
    participant,
    textBody: body.textBody,
    htmlBody: body.htmlBody,
    snippet: body.snippet,
    happenedAt,
    leadId,
  };
}

function normalizeEmailLikeHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

async function persistSyncedMessage(userId: string, parsed: ParsedMessage): Promise<void> {
  const thread = await resolveThread({
    userId,
    leadId: parsed.leadId,
    participantEmail: parsed.participant!.address,
    participantName: parsed.participant!.name,
    subject: parsed.subject,
    normalizedSubject: normalizeSubject(parsed.subject),
    preview: parsed.snippet,
    happenedAt: parsed.happenedAt,
    referenceHeaders: [parsed.inReplyToHeader, ...parsed.referenceHeaders].filter((value): value is string => Boolean(value)),
  });

  await prisma.emailMessage.upsert({
    where: {
      email_messages_user_sync_key: {
        userId,
        syncKey: parsed.syncKey,
      },
    },
    create: {
      userId,
      threadId: thread.id,
      leadId: parsed.leadId,
      syncKey: parsed.syncKey,
      folder: parsed.folder,
      direction: parsed.direction,
      deliveryStatus: parsed.deliveryStatus,
      externalMessageId: parsed.externalMessageId,
      messageIdHeader: parsed.messageIdHeader,
      inReplyToHeader: parsed.inReplyToHeader,
      referenceHeaders: parsed.referenceHeaders,
      fromEmail: parsed.from?.address ?? parsed.participant!.address,
      fromName: parsed.from?.name ?? parsed.participant!.name,
      toEmails: parsed.to.map((address) => address.address),
      ccEmails: parsed.cc.map((address) => address.address),
      bccEmails: parsed.bcc.map((address) => address.address),
      subject: parsed.subject,
      snippet: parsed.snippet,
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
      sentAt: parsed.direction === 'outgoing' ? parsed.happenedAt : null,
      receivedAt: parsed.direction === 'incoming' ? parsed.happenedAt : null,
      deliveredAt: parsed.direction === 'outgoing' ? parsed.happenedAt : null,
    },
    update: {
      threadId: thread.id,
      leadId: parsed.leadId,
      folder: parsed.folder,
      direction: parsed.direction,
      deliveryStatus: parsed.deliveryStatus,
      externalMessageId: parsed.externalMessageId,
      messageIdHeader: parsed.messageIdHeader,
      inReplyToHeader: parsed.inReplyToHeader,
      referenceHeaders: parsed.referenceHeaders,
      fromEmail: parsed.from?.address ?? parsed.participant!.address,
      fromName: parsed.from?.name ?? parsed.participant!.name,
      toEmails: parsed.to.map((address) => address.address),
      ccEmails: parsed.cc.map((address) => address.address),
      bccEmails: parsed.bcc.map((address) => address.address),
      subject: parsed.subject,
      snippet: parsed.snippet,
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
      sentAt: parsed.direction === 'outgoing' ? parsed.happenedAt : null,
      receivedAt: parsed.direction === 'incoming' ? parsed.happenedAt : null,
      deliveredAt: parsed.direction === 'outgoing' ? parsed.happenedAt : null,
      errorMessage: null,
    },
  });
}

async function syncFolder(
  client: ImapFlow,
  userId: string,
  ownEmail: string,
  remotePath: string,
  folder: Extract<MailFolder, 'inbox' | 'sent'>,
): Promise<number> {
  const lock = await client.getMailboxLock(remotePath);
  try {
    const ids = await client.search({ all: true });
    const recentIds = Array.isArray(ids) ? ids.slice(-30) : [];
    if (recentIds.length === 0) return 0;

    let imported = 0;
    for await (const message of client.fetch(recentIds, {
      uid: true,
      envelope: true,
      size: true,
      source: true,
      internalDate: true,
    })) {
      if (typeof message.size === 'number' && message.size > MAX_SYNC_MESSAGE_BYTES) {
        logger.warn({
          userId,
          remotePath,
          uid: message.uid,
          size: message.size,
        }, 'skipping oversized email during mailbox sync');
        continue;
      }
      const parsed = await parseMailboxMessage(userId, ownEmail, folder, message as ImapFetchMessage);
      if (!parsed) continue;
      await persistSyncedMessage(userId, parsed);
      imported += 1;
    }
    return imported;
  } finally {
    lock.release();
  }
}

function resolveSentMailbox(mailboxes: ImapMailboxListEntry[]): string | null {
  const sentBySpecialUse = mailboxes.find((mailbox) => mailbox.specialUse === '\\Sent')?.path;
  if (sentBySpecialUse) return sentBySpecialUse;

  const commonNames = ['Sent', 'Sent Messages', 'INBOX.Sent', 'INBOX/Sent'];
  const sentByName = mailboxes.find((mailbox) => mailbox.path && commonNames.includes(mailbox.path))?.path;
  return sentByName ?? null;
}

export async function syncMailboxForUser(userId: string): Promise<MailboxSyncResult> {
  const config = await getUserEmailConfig(userId);
  if (!config) {
    throw new HttpError(400, 'smtp_settings_required', 'Add SMTP details in account settings before using Emails.');
  }
  if (!config.mailbox) {
    throw new HttpError(400, 'mailbox_sync_not_configured', 'Add mailbox sync details to load Inbox and Sent.');
  }

  await assertPublicMailHost(config.mailbox.host);

  const client = new ImapFlow({
    host: config.mailbox.host,
    port: config.mailbox.port,
    secure: config.mailbox.secure,
    auth: {
      user: config.mailbox.username,
      pass: config.mailbox.password,
    },
    logger: false,
  });

  try {
    await client.connect();
    const mailboxes = (await client.list()) as ImapMailboxListEntry[];
    const sentMailbox = resolveSentMailbox(mailboxes);
    const inboxImported = await syncFolder(client, userId, config.smtp.fromEmail.toLowerCase(), 'INBOX', 'inbox');
    const sentImported = sentMailbox
      ? await syncFolder(client, userId, config.smtp.fromEmail.toLowerCase(), sentMailbox, 'sent')
      : 0;

    const syncedAt = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { emailLastSyncedAt: syncedAt },
    });

    return {
      synced: true,
      inboxImported,
      sentImported,
      lastSyncedAt: syncedAt.toISOString(),
    };
  } catch (error) {
    logger.error({ err: error, userId }, 'email mailbox sync failed');
    throw new HttpError(502, 'mailbox_sync_failed', 'Unable to sync the mailbox with the saved settings.');
  } finally {
    await client.logout().catch(() => {
      client.close();
      return undefined;
    });
  }
}

function buildReplySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export async function sendReplyForThread(
  userId: string,
  threadId: string,
  input: {
    to?: string[];
    cc: string[];
    bcc: string[];
    subject?: string;
    body: string;
  },
) {
  const config = await getUserEmailConfig(userId);
  if (!config) {
    throw new HttpError(400, 'smtp_settings_required', 'Add SMTP details in account settings before sending email.');
  }
  await assertPublicMailHost(config.smtp.host);

  const thread = await prisma.emailThread.findFirst({
    where: { id: threadId, userId },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      lead: {
        select: { id: true, businessName: true, email: true },
      },
    },
  });
  if (!thread) throw new HttpError(404, 'email_thread_not_found', 'Email thread not found.');

  const recipients = input.to?.length
    ? input.to
    : [thread.participantEmail];
  const subject = input.subject?.trim() || buildReplySubject(thread.subject);
  const latestReferencedMessage = thread.messages.find((message) => message.messageIdHeader);
  const referenceHeaders = [
    latestReferencedMessage?.messageIdHeader ?? null,
    ...(latestReferencedMessage?.referenceHeaders ?? []),
  ].filter((value): value is string => Boolean(value));
  const draftSyncKey = `draft:${randomUUID()}`;
  const happenedAt = new Date();

  const draft = await prisma.emailMessage.create({
    data: {
      userId,
      threadId: thread.id,
      leadId: thread.leadId,
      syncKey: draftSyncKey,
      folder: 'outbox',
      direction: 'outgoing',
      deliveryStatus: 'queued',
      fromEmail: config.smtp.fromEmail,
      fromName: config.smtp.fromName,
      toEmails: recipients,
      ccEmails: input.cc,
      bccEmails: input.bcc,
      subject,
      snippet: buildSnippet(input.body),
      textBody: input.body,
      sentAt: happenedAt,
    },
  });

  await prisma.emailThread.update({
    where: { id: thread.id },
    data: {
      lastMessageAt: happenedAt,
      lastMessagePreview: buildSnippet(input.body),
      subject,
    },
  });

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.username,
      pass: config.smtp.password,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: config.smtp.fromName
        ? `${config.smtp.fromName} <${config.smtp.fromEmail}>`
        : config.smtp.fromEmail,
      to: recipients,
      cc: input.cc.length ? input.cc : undefined,
      bcc: input.bcc.length ? input.bcc : undefined,
      subject,
      text: input.body,
      inReplyTo: latestReferencedMessage?.messageIdHeader ?? undefined,
      references: referenceHeaders.length ? referenceHeaders : undefined,
    }) as { messageId?: string };
    const deliveredAt = new Date();
    const normalizedInfoMessageId = normalizeEmailLikeHeader(info.messageId);
    const messageIdHeader = normalizedInfoMessageId ?? normalizeEmailLikeHeader(latestReferencedMessage?.messageIdHeader) ?? `sent:${draft.id}`;
    const syncKey = normalizedInfoMessageId ? `msgid:${normalizedInfoMessageId}` : `sent:${draft.id}`;

    const updated = await prisma.emailMessage.update({
      where: { id: draft.id },
      data: {
        syncKey,
        folder: 'sent',
        deliveryStatus: 'delivered',
        externalMessageId: info.messageId ?? null,
        messageIdHeader,
        inReplyToHeader: latestReferencedMessage?.messageIdHeader ?? null,
        referenceHeaders,
        deliveredAt,
        errorMessage: null,
      },
    });

    return updated;
  } catch (error) {
    logger.error({ err: error, userId, threadId }, 'email send failed');
    await prisma.emailMessage.update({
      where: { id: draft.id },
      data: {
        deliveryStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown SMTP error',
      },
    });
    throw new HttpError(502, 'email_send_failed', 'Unable to send the email with the saved SMTP settings.');
  }
}
