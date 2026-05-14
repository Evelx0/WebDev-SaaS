import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type LeadList, type SiteJob } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { relTime } from '../lib/format';

const ACTIVE_JOBS = new Set(['queued', 'running']);

export function DashboardPage() {
  const leads = useQuery({
    queryKey: ['dashboard', 'leads'],
    queryFn: () => api.get<LeadList>('/leads'),
    refetchInterval: 8_000,
  });
  const jobs = useQuery({
    queryKey: ['dashboard', 'jobs'],
    queryFn: () => api.get<SiteJob[]>('/jobs'),
    refetchInterval: 4_000,
  });

  const leadRows = leads.data?.leads ?? [];
  const jobRows = jobs.data ?? [];
  const activeJobs = jobRows.filter((job) => ACTIVE_JOBS.has(job.status));
  const deployedCount = leadRows.filter((lead) => lead.siteStatus === 'deployed' || Boolean(lead.vercelUrl)).length;
  const reviewCount = leadRows.filter((lead) => lead.leadStatus === 'needs_review' || lead.leadStatus === 'ready_for_site').length;
  const failedCount = jobRows.filter((job) => job.status === 'failed').length;
  const recentLeads = leadRows.slice(0, 5);
  const recentJobs = jobRows.slice(0, 5);

  const generationReady = leadRows.filter((lead) =>
    ['needs_review', 'ready_for_site', 'site_generated', 'site_deployed'].includes(lead.leadStatus),
  ).length;
  const completionPercent = leadRows.length ? Math.round((deployedCount / leadRows.length) * 100) : 0;
  const readyPercent = leadRows.length ? Math.round((generationReady / leadRows.length) * 100) : 0;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Dashboard"
        subtitle="A CoreUI-style operating view for enrichment, generation, deployment, and job health."
        actions={
          <>
            <Link to="/leads/new" className="btn-primary">Add lead</Link>
            <Link to="/jobs" className="btn-secondary">View jobs</Link>
          </>
        }
      />

      <div className="coreui-page">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <WidgetCard
            tone="primary"
            label="Total leads"
            value={leads.isLoading ? '...' : leadRows.length.toString()}
            helper={`${reviewCount} waiting for review`}
            iconPath="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h10v2H4v-2Z"
          />
          <WidgetCard
            tone="success"
            label="Live demos"
            value={leads.isLoading ? '...' : deployedCount.toString()}
            helper={`${completionPercent}% of visible leads deployed`}
            iconPath="M12 3 4 8v8l8 5 8-5V8l-8-5Zm0 2.35L17.76 9 12 12.65 6.24 9 12 5.35ZM6 10.73l5 3.17v4.45l-5-3.13v-4.49Zm7 7.62V13.9l5-3.17v4.49l-5 3.13Z"
          />
          <WidgetCard
            tone="warning"
            label="Active jobs"
            value={jobs.isLoading ? '...' : activeJobs.length.toString()}
            helper={activeJobs.length ? 'Worker activity in progress' : 'Queue is currently clear'}
            iconPath="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2Zm1 5h-2v6l5 3 .95-1.63L13 12.05V7Z"
          />
          <WidgetCard
            tone="danger"
            label="Failed jobs"
            value={jobs.isLoading ? '...' : failedCount.toString()}
            helper={failedCount ? 'Needs operator attention' : 'No failures in recent jobs'}
            iconPath="M11 7h2v7h-2V7Zm0 9h2v2h-2v-2Zm1-14 10 18H2L12 2Zm0 4.1L5.4 18h13.2L12 6.1Z"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <section className="card overflow-hidden">
            <div className="coreui-card-header">
              <div>
                <h2 className="coreui-card-title">Pipeline</h2>
                <p className="coreui-card-subtitle">Lead movement from raw enrichment to deployed demos.</p>
              </div>
            </div>
            <div className="p-5 space-y-5">
              <ProgressRow label="Ready for generation" value={readyPercent} />
              <ProgressRow label="Demo deployed" value={completionPercent} />
              <div className="grid gap-3 md:grid-cols-3">
                <MiniStat label="Needs review" value={reviewCount} />
                <MiniStat label="Generated" value={leadRows.filter((lead) => lead.siteStatus === 'generated').length} />
                <MiniStat label="Contact pending" value={leadRows.filter((lead) => lead.leadStatus === 'contact_pending').length} />
              </div>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="coreui-card-header">
              <div>
                <h2 className="coreui-card-title">Recent Jobs</h2>
                <p className="coreui-card-subtitle">Live worker visibility.</p>
              </div>
              <Link to="/jobs" className="text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline">All jobs</Link>
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-700/70">
              {recentJobs.length ? recentJobs.map((job) => (
                <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50 dark:hover:bg-ink-700/30">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">{job.jobType.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-ink-500 dark:text-ink-400">{job.lead?.businessName ?? 'No lead name'} · {relTime(job.createdAt)}</div>
                  </div>
                  <StatusBadge value={job.status} kind="job" />
                </Link>
              )) : (
                <div className="px-5 py-8 text-sm text-ink-500 dark:text-ink-400">No jobs yet.</div>
              )}
            </div>
          </section>
        </div>

        <section className="card overflow-hidden">
          <div className="coreui-card-header">
            <div>
              <h2 className="coreui-card-title">Recent Leads</h2>
              <p className="coreui-card-subtitle">Fast access to the newest visible leads.</p>
            </div>
            <Link to="/leads" className="text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline">Lead table</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="coreui-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Lead status</th>
                  <th>Site status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.length ? recentLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link to={`/leads/${lead.id}`} className="font-medium text-ink-900 dark:text-ink-100 hover:underline">
                        {lead.businessName ?? 'Unnamed lead'}
                      </Link>
                      <div className="text-xs text-ink-500 dark:text-ink-400">{lead.category ?? 'No category yet'}</div>
                    </td>
                    <td><StatusBadge value={lead.leadStatus} kind="lead" /></td>
                    <td><StatusBadge value={lead.siteStatus} kind="site" /></td>
                    <td className="text-xs text-ink-500 dark:text-ink-400">{relTime(lead.updatedAt)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="text-center text-ink-500 dark:text-ink-400">No leads yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function WidgetCard({
  label,
  value,
  helper,
  tone,
  iconPath,
}: {
  label: string;
  value: string;
  helper: string;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  iconPath: string;
}) {
  return (
    <div className={`coreui-widget coreui-widget-${tone}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-white/70">{label}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</div>
        </div>
        <div className="coreui-widget-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={iconPath} />
          </svg>
        </div>
      </div>
      <div className="mt-5 text-xs text-white/75">{helper}</div>
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-ink-700 dark:text-ink-200">{label}</span>
        <span className="text-ink-500 dark:text-ink-400">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-700">
        <div className="h-full rounded-full bg-accent-600" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-50 px-4 py-3 dark:border-ink-700 dark:bg-ink-900/40">
      <div className="text-2xl font-semibold text-ink-900 dark:text-ink-100">{value}</div>
      <div className="text-xs text-ink-500 dark:text-ink-400">{label}</div>
    </div>
  );
}
