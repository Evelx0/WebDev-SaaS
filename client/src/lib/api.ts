export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'message' in parsed && typeof (parsed as Record<string, unknown>).message === 'string'
        ? (parsed as Record<string, string>).message
        : undefined) ??
      (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as Record<string, unknown>).error === 'string'
        ? (parsed as Record<string, string>).error
        : undefined) ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, parsed, message);
  }
  return parsed as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};

// ---- Domain types (kept thin to avoid frontend↔backend drift) ----
export interface Lead {
  id: string;
  businessName: string | null;
  category: string | null;
  googleProfileUrl: string;
  googlePlaceId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  existingWebsiteUrl: string | null;
  websiteStatus: string;
  leadStatus: string;
  siteStatus: string;
  vercelUrl: string | null;
  lastError: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  isActive: boolean;
  usageLimitPer24h: number;
  hasVercelConfig: boolean;
  hasOpenRouterKey: boolean;
  hasEmailConfig: boolean;
  hasMailboxSync: boolean;
}

export interface AccountSettings extends CurrentUser {
  usage: { used: number; limit: number | null; remaining: number | null };
  vercelTeamId: string;
  vercelProjectPrefix: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpFromName: string;
  smtpFromEmail: string;
  hasSmtpPassword: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  hasImapPassword: boolean;
  emailLastSyncedAt: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  isActive: boolean;
  usageLimitPer24h: number;
  hasVercelConfig: boolean;
  hasOpenRouterKey: boolean;
  vercelTeamId: string | null;
  vercelProjectPrefix: string | null;
  leadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLogs {
  generatedSince: string;
  summary: {
    totalUsers: number;
    activeUsers: number;
    usersWithOwnOpenRouter: number;
    usersWithVercel: number;
    activeJobs: number;
    failedJobs: number;
    recentJobs: number;
    generatedSites30d: number;
  };
  usage: {
    platform: { inputTokens: number; outputTokens: number; totalTokens: number; reportedCostUsd: number; calls: number };
    userKeys: { inputTokens: number; outputTokens: number; totalTokens: number; reportedCostUsd: number; calls: number };
    byModel: Array<{
      model: string;
      apiKeySource: 'platform' | 'user';
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      reportedCostUsd: number;
      calls: number;
    }>;
  };
  activeJobs: SiteJob[];
  recentJobs: SiteJob[];
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: 'admin' | 'user';
    isActive: boolean;
    hasOpenRouterKey: boolean;
    hasVercelConfig: boolean;
    leadCount: number;
  }>;
}

export interface JobLog {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata: unknown;
  createdAt: string;
}

export interface SiteJob {
  id: string;
  leadId: string;
  jobType: string;
  status: string;
  attemptCount: number;
  modelProvider: string | null;
  modelName: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  lead?: {
    id: string;
    businessName: string | null;
    createdBy?: { id: string; email: string; name: string | null; role: 'admin' | 'user' } | null;
  };
  logs?: JobLog[];
}

export interface GeneratedSite {
  id: string;
  leadId: string;
  siteJobId: string | null;
  version: number;
  siteTitle: string | null;
  siteSummary: string | null;
  vercelUrl: string | null;
  vercelDeploymentId: string | null;
  vercelProjectId: string | null;
  createdAt: string;
}

export interface SalesPitch {
  id: string;
  leadId: string;
  generatedSiteId: string | null;
  provider: string;
  model: string;
  isMock: boolean;
  subjectLine: string;
  openingLine: string;
  painPoint: string;
  valueProposition: string;
  demoReference: string;
  callToAction: string;
  fullEmailDraft: string;
  linkedinMessage: string;
  operatorNotes: string | null;
  createdAt: string;
}

export interface SiteDesignBrief {
  designArchetype: string;
  visualMood: string;
  heroAngle: string;
  trustSignalPlan: string;
  trustpilotMode: 'placeholder' | 'real_profile' | 'omit';
  trustpilotUrl: string | null;
  trustpilotRating: string | null;
  trustpilotReviewCount: string | null;
  servicesToEmphasise: string[];
  localPositioning: string;
  galleryStyle: string;
  ctaWording: string;
  avoidClaims: string;
}

export interface SiteDesignSuggestionResponse {
  designBrief: SiteDesignBrief;
  usage: { provider: string; model: string; inputTokens?: number; outputTokens?: number };
}

export interface QueuedJobResponse {
  jobId: string;
  status: 'queued';
}

export interface LeadList {
  leads: Lead[];
  total: number;
}

export interface LeadDetail extends Lead {
  sources: Array<{ id: string; sourceType: string; createdAt: string; extractedData: unknown }>;
  jobs: SiteJob[];
  generatedSites: GeneratedSite[];
  salesPitches: SalesPitch[];
}

export type EmailFolder = 'inbox' | 'sent' | 'outbox';

export interface EmailThreadListItem {
  id: string;
  subject: string;
  participantEmail: string;
  participantName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lead: {
    id: string;
    businessName: string | null;
    email: string | null;
  } | null;
  latestMessage: {
    id: string;
    folder: EmailFolder;
    direction: 'incoming' | 'outgoing';
    deliveryStatus: string;
    snippet: string | null;
    sentAt: string | null;
    receivedAt: string | null;
    deliveredAt: string | null;
    createdAt: string;
  } | null;
}

export interface EmailThreadListResponse {
  folder: EmailFolder;
  counts: Record<EmailFolder, number>;
  hasMailboxSync: boolean;
  emailLastSyncedAt: string | null;
  threads: EmailThreadListItem[];
}

export interface EmailMessage {
  id: string;
  threadId: string;
  leadId: string | null;
  folder: EmailFolder;
  direction: 'incoming' | 'outgoing';
  deliveryStatus: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  snippet: string | null;
  textBody: string | null;
  htmlBody: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface EmailThreadDetail {
  id: string;
  subject: string;
  participantEmail: string;
  participantName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lead: {
    id: string;
    businessName: string | null;
    email: string | null;
    city: string | null;
    phone: string | null;
  } | null;
  messages: EmailMessage[];
}

export interface MailboxSyncResult {
  synced: boolean;
  inboxImported: number;
  sentImported: number;
  lastSyncedAt: string | null;
}
