import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type AdminLogs } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { relTime } from '../lib/format';

export function LogsPage() {
  const logs = useQuery({
    queryKey: ['admin', 'logs'],
    queryFn: () => api.get<AdminLogs>('/admin/logs'),
    refetchInterval: 5_000,
  });

  const data = logs.data;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Logs" subtitle="Admin observability for user activity, generation jobs, and OpenRouter token usage." />
      <div className="coreui-page">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LogMetric label="Active jobs" value={data ? String(data.summary.activeJobs) : '...'} tone="primary" />
          <LogMetric label="Failed jobs" value={data ? String(data.summary.failedJobs) : '...'} tone="danger" />
          <LogMetric label="Generated 30d" value={data ? String(data.summary.generatedSites30d) : '...'} tone="success" />
          <LogMetric label="Users with keys" value={data ? `${data.summary.usersWithOwnOpenRouter}/${data.summary.totalUsers}` : '...'} tone="warning" />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <UsageCard title="Platform OpenRouter Usage" usage={data?.usage.platform} detail="Usage reported for calls made with the main .env OpenRouter key." />
          <UsageCard title="User OpenRouter Usage" usage={data?.usage.userKeys} detail="Usage reported for calls made with customer-supplied OpenRouter keys." />
        </div>

        <section className="card overflow-hidden">
          <div className="coreui-card-header">
            <div>
              <h2 className="coreui-card-title">Model Usage</h2>
              <p className="coreui-card-subtitle">Token and reported-cost breakdown across enrichment research, website, design, and pitch AI calls.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="coreui-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Key source</th>
                  <th>Calls</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Total</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data?.usage.byModel.map((row) => (
                  <tr key={`${row.apiKeySource}:${row.model}`}>
                    <td className="font-mono text-xs">{row.model}</td>
                    <td>{row.apiKeySource === 'user' ? 'User key' : 'Platform'}</td>
                    <td>{row.calls.toLocaleString()}</td>
                    <td>{row.inputTokens.toLocaleString()}</td>
                    <td>{row.outputTokens.toLocaleString()}</td>
                    <td>{row.totalTokens.toLocaleString()}</td>
                    <td>${row.reportedCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
                {data?.usage.byModel.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-ink-500 dark:text-ink-400">No reported AI usage yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="coreui-card-header">
            <div>
              <h2 className="coreui-card-title">Active Jobs</h2>
              <p className="coreui-card-subtitle">Who is currently generating, deploying, enriching, or refreshing.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="coreui-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>User</th>
                  <th>Lead</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                {data?.activeJobs.map((job) => (
                  <tr key={job.id}>
                    <td><Link to={`/jobs/${job.id}`} className="font-medium hover:underline">{job.jobType.replace(/_/g, ' ')}</Link></td>
                    <td>{job.lead?.createdBy?.email ?? '-'}</td>
                    <td>{job.lead?.businessName ?? '-'}</td>
                    <td><StatusBadge value={job.status} kind="job" /></td>
                    <td className="text-xs text-ink-500 dark:text-ink-400">{relTime(job.startedAt ?? job.createdAt)}</td>
                    <td className="font-mono text-xs">{job.modelProvider ? `${job.modelProvider}/${job.modelName}` : '-'}</td>
                  </tr>
                ))}
                {data?.activeJobs.length === 0 ? <tr><td colSpan={6} className="text-center text-ink-500 dark:text-ink-400">No active jobs.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="card overflow-hidden">
            <div className="coreui-card-header">
              <div>
                <h2 className="coreui-card-title">Recent Job Stream</h2>
                <p className="coreui-card-subtitle">Latest 100 jobs across all accounts.</p>
              </div>
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-700">
              {data?.recentJobs.slice(0, 12).map((job) => (
                <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-ink-50 dark:hover:bg-ink-700/30">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">{job.jobType.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-ink-500 dark:text-ink-400">
                      {job.lead?.createdBy?.email ?? 'Unknown user'} / {job.lead?.businessName ?? 'No lead'} / {relTime(job.createdAt)}
                    </div>
                    {job.errorMessage ? <div className="mt-1 text-xs text-red-600 dark:text-red-400">{job.errorMessage}</div> : null}
                  </div>
                  <StatusBadge value={job.status} kind="job" />
                </Link>
              ))}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="coreui-card-header">
              <div>
                <h2 className="coreui-card-title">Account Readiness</h2>
                <p className="coreui-card-subtitle">Deployment and AI key coverage.</p>
              </div>
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-700">
              {data?.users.map((user) => (
                <div key={user.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">{user.email}</div>
                      <div className="text-xs text-ink-500 dark:text-ink-400">{user.leadCount} leads · {user.role}</div>
                    </div>
                    <span className={user.isActive ? 'text-xs text-accent-700 dark:text-accent-400' : 'text-xs text-red-600 dark:text-red-400'}>
                      {user.isActive ? 'active' : 'disabled'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className={`rounded px-2 py-1 ${user.hasVercelConfig ? 'bg-accent-50 text-accent-700 dark:bg-accent-700/20 dark:text-accent-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                      {user.hasVercelConfig ? 'Vercel ready' : 'Vercel missing'}
                    </span>
                    <span className={`rounded px-2 py-1 ${user.hasOpenRouterKey || user.role === 'admin' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-300'}`}>
                      {user.role === 'admin' ? 'Platform AI' : user.hasOpenRouterKey ? 'Own AI key' : 'Platform capped'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LogMetric({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'success' | 'warning' | 'danger' }) {
  return (
    <div className={`coreui-widget coreui-widget-${tone}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-white/70">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
    </div>
  );
}

function UsageCard({
  title,
  detail,
  usage,
}: {
  title: string;
  detail: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; reportedCostUsd: number; calls: number };
}) {
  return (
    <section className="card overflow-hidden">
      <div className="coreui-card-header">
        <div>
          <h2 className="coreui-card-title">{title}</h2>
          <p className="coreui-card-subtitle">{detail}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-5">
        <Mini label="Input" value={usage ? usage.inputTokens.toLocaleString() : '...'} />
        <Mini label="Output" value={usage ? usage.outputTokens.toLocaleString() : '...'} />
        <Mini label="Total" value={usage ? usage.totalTokens.toLocaleString() : '...'} />
        <Mini label="Cost" value={usage ? `$${usage.reportedCostUsd.toFixed(4)}` : '...'} />
        <Mini label="Calls" value={usage ? usage.calls.toLocaleString() : '...'} />
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-50 p-3 dark:border-ink-700 dark:bg-ink-900/40">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-100">{value}</div>
    </div>
  );
}
