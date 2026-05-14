type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'warn' | 'error';

const toneClasses: Record<Tone, string> = {
  neutral:  'bg-ink-100 dark:bg-ink-700 text-ink-700 dark:text-ink-300 border-ink-200 dark:border-ink-600',
  info:     'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  progress: 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  success:  'bg-accent-50 dark:bg-accent-700/20 text-accent-700 dark:text-accent-400 border-accent-200 dark:border-accent-600',
  warn:     'bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  error:    'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
};

const leadStatusTone: Record<string, Tone> = {
  new: 'neutral',
  info_pull_queued: 'progress',
  info_pulled: 'info',
  needs_review: 'info',
  ready_for_site: 'info',
  site_generation_queued: 'progress',
  site_generating: 'progress',
  site_generated: 'info',
  site_deploying: 'progress',
  site_deployed: 'success',
  site_failed: 'error',
  contact_pending: 'info',
  contacted: 'success',
  discarded: 'neutral',
};

const siteStatusTone: Record<string, Tone> = {
  not_started: 'neutral',
  queued: 'progress',
  generating: 'progress',
  generated: 'info',
  deploying: 'progress',
  deployed: 'success',
  failed: 'error',
};

const jobStatusTone: Record<string, Tone> = {
  queued: 'progress',
  running: 'progress',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'neutral',
  retrying: 'warn',
};

const websiteStatusTone: Record<string, Tone> = {
  unknown: 'neutral',
  none_found: 'warn',
  has_site: 'success',
  bad_site: 'warn',
  social_only: 'info',
};

export function StatusBadge({
  value,
  kind,
}: {
  value: string;
  kind: 'lead' | 'site' | 'job' | 'website';
}) {
  const tone =
    (kind === 'lead' && leadStatusTone[value]) ||
    (kind === 'site' && siteStatusTone[value]) ||
    (kind === 'job' && jobStatusTone[value]) ||
    (kind === 'website' && websiteStatusTone[value]) ||
    'neutral';
  return (
    <span className={`badge ${toneClasses[tone]}`}>{value.replace(/_/g, ' ')}</span>
  );
}
