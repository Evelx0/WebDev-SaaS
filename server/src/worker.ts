/**
 * Worker entry point. Started via `npm run worker` (dev: `npm run dev:worker`).
 * Boots all three BullMQ workers.
 */
import { logger } from './lib/logger.js';
import { startPullLeadInfoWorker } from './workers/pullLeadInfo.js';
import { startGenerateSiteWorker } from './workers/generateSite.js';
import { startDeploySiteWorker } from './workers/deploySite.js';
import { startRefreshSiteDesignWorker } from './workers/refreshSiteDesign.js';

logger.info('Starting lead-panel workers...');

const enrichment = startPullLeadInfoWorker();
const generation = startGenerateSiteWorker();
const deployment = startDeploySiteWorker();
const designRefresh = startRefreshSiteDesignWorker();

async function shutdown(signal: string) {
  logger.info({ signal }, 'Worker received shutdown signal — closing queues...');
  await Promise.all([enrichment.close(), generation.close(), deployment.close(), designRefresh.close()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
