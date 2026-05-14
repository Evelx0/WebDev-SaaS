import { Queue, QueueEvents } from 'bullmq';
import { bullConnection } from './redis.js';

export const QUEUE_NAMES = {
  leadEnrichment: 'lead-enrichment',
  siteGeneration: 'site-generation',
  siteDeployment: 'site-deployment',
  designRefresh: 'design-refresh',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type LeadEnrichmentJobData = {
  siteJobId: string;
  leadId: string;
  googleProfileUrl: string;
};

export type GenerateSiteJobData = {
  siteJobId: string;
  leadId: string;
  stylePreference?: string;
  notes?: string;
  brandName?: string;
  siteDesignBrief?: unknown;
  /** When true, queues a deploy_site job after generation succeeds. */
  autoDeploy?: boolean;
};

export type DesignRefreshJobData = {
  siteJobId: string;
  leadId: string;
};

export type DeploySiteJobData = {
  siteJobId: string;
  leadId: string;
  generatedSiteId: string;
  brandName?: string;
};

const sharedOpts = { connection: { url: bullConnection.url } } as const;

export const leadEnrichmentQueue = new Queue<LeadEnrichmentJobData>(
  QUEUE_NAMES.leadEnrichment,
  sharedOpts,
);

export const siteGenerationQueue = new Queue<GenerateSiteJobData>(
  QUEUE_NAMES.siteGeneration,
  sharedOpts,
);

export const designRefreshQueue = new Queue<DesignRefreshJobData>(
  QUEUE_NAMES.designRefresh,
  sharedOpts,
);

export const siteDeploymentQueue = new Queue<DeploySiteJobData>(
  QUEUE_NAMES.siteDeployment,
  sharedOpts,
);

export const leadEnrichmentEvents = new QueueEvents(QUEUE_NAMES.leadEnrichment, sharedOpts);
export const siteGenerationEvents = new QueueEvents(QUEUE_NAMES.siteGeneration, sharedOpts);
export const siteDeploymentEvents = new QueueEvents(QUEUE_NAMES.siteDeployment, sharedOpts);
