import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SiteJob } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { relTime } from '../lib/format';

const ACTIVE = new Set(['queued', 'running']);

export function JobsPage() {
  const qc = useQueryClient();

  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get<SiteJob[]>('/jobs'),
    refetchInterval: 4_000,
  });

  const clearAll = useMutation({
    mutationFn: () => api.del<{ ok: boolean; count: number }>('/jobs'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const clearOne = useMutation({
    mutationFn: (jobId: string) => api.del(`/jobs/${jobId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const hasCompleted = jobs.data?.some((j) => !ACTIVE.has(j.status)) ?? false;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="My Jobs"
        subtitle="Background work — enrichment, generation, deployment."
        actions={
          hasCompleted ? (
            <button
              className="btn-ghost text-sm"
              disabled={clearAll.isPending}
              onClick={() => clearAll.mutate()}
            >
              {clearAll.isPending ? 'Clearing…' : 'Clear completed'}
            </button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-auto p-8">
        {jobs.isLoading ? (
          <div className="card p-8 text-sm text-ink-500 dark:text-ink-400">Loading…</div>
        ) : jobs.data && jobs.data.length === 0 ? (
          <div className="card p-12 text-center text-ink-500 dark:text-ink-400">
            No jobs yet — actions on a lead will create background jobs.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/60 dark:bg-ink-900/60 border-b border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 text-left">
                <tr>
                  <Th>Type</Th>
                  <Th>Lead</Th>
                  <Th>Status</Th>
                  <Th>Attempts</Th>
                  <Th>Model</Th>
                  <Th>Created</Th>
                  <Th>Completed</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {jobs.data?.map((j) => (
                  <tr key={j.id} className="border-b border-ink-100 dark:border-ink-700/50 hover:bg-ink-50/40 dark:hover:bg-ink-700/30">
                    <td className="px-4 py-3 font-mono text-xs text-ink-700 dark:text-ink-300">{j.jobType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      {j.lead?.businessName ? (
                        <Link to={`/leads/${j.lead.id}`} className="hover:underline text-ink-800 dark:text-ink-200">
                          {j.lead.businessName}
                        </Link>
                      ) : (
                        <span className="text-ink-400 dark:text-ink-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={j.status} kind="job" /></td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-300">{j.attemptCount}</td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-300 text-xs font-mono">{j.modelProvider ? `${j.modelProvider}/${j.modelName}` : '—'}</td>
                    <td className="px-4 py-3 text-ink-500 dark:text-ink-400 text-xs">{relTime(j.createdAt)}</td>
                    <td className="px-4 py-3 text-ink-500 dark:text-ink-400 text-xs">{relTime(j.completedAt)}</td>
                    <td className="px-4 py-3 text-right flex items-center justify-end gap-3">
                      <Link to={`/jobs/${j.id}`} className="text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 hover:underline text-xs">View</Link>
                      {!ACTIVE.has(j.status) && (
                        <button
                          title="Remove from history"
                          className="text-ink-400 dark:text-ink-500 hover:text-red-600 dark:hover:text-red-400 text-xs leading-none"
                          disabled={clearOne.isPending}
                          onClick={() => clearOne.mutate(j.id)}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">{children}</th>;
}
