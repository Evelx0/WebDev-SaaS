import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SiteJob } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { relTime } from '../lib/format';

const ACTIVE = new Set(['queued', 'running']);

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const job = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => api.get<SiteJob>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: 3_000,
  });

  const retry = useMutation({
    mutationFn: () => api.post(`/jobs/${jobId}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', jobId] }),
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/jobs/${jobId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', jobId] }),
  });
  const removeFromHistory = useMutation({
    mutationFn: () => api.del(`/jobs/${jobId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      navigate('/jobs');
    },
  });

  if (job.isLoading) return <div className="p-8 text-sm text-ink-500 dark:text-ink-400">Loading job…</div>;
  if (job.isError || !job.data) return <div className="p-8 text-red-700 dark:text-red-400">Job not found.</div>;
  const j = job.data;
  const isActive = ACTIVE.has(j.status);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={j.jobType.replace(/_/g, ' ')}
        subtitle={`Job · ${j.id}`}
        actions={
          <>
            <Link to="/jobs" className="btn-secondary">← All jobs</Link>
            {j.lead ? (
              <Link to={`/leads/${j.lead.id}`} className="btn-secondary">Open lead</Link>
            ) : null}
            <button
              className="btn-secondary"
              disabled={retry.isPending || isActive}
              onClick={() => retry.mutate()}
              data-testid="button-retry"
            >
              Retry
            </button>
            {isActive ? (
              <button
                className="btn-ghost text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
                data-testid="button-cancel"
              >
                Cancel
              </button>
            ) : (
              <button
                className="btn-ghost text-ink-500 dark:text-ink-400 hover:text-red-600 dark:hover:text-red-400"
                disabled={removeFromHistory.isPending}
                onClick={() => removeFromHistory.mutate()}
                data-testid="button-remove-history"
              >
                Remove from history
              </button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-auto p-8 grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-5">
            <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">Logs</h2>
            <div className="mt-3 bg-ink-950 text-ink-100 rounded-md p-3 font-mono text-xs max-h-[60vh] overflow-auto" data-testid="job-log-panel">
              {j.logs && j.logs.length > 0 ? (
                j.logs.map((l) => (
                  <div key={l.id} className="flex gap-3 py-0.5">
                    <span className="text-ink-400 shrink-0">{new Date(l.createdAt).toLocaleTimeString()}</span>
                    <span className={`shrink-0 ${l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-300' : 'text-accent-400'}`}>
                      {l.level.padEnd(5)}
                    </span>
                    <span className="whitespace-pre-wrap break-words">{l.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-ink-400">No log entries yet.</div>
              )}
            </div>
          </section>
        </div>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">Summary</h2>
            <dl className="mt-3 text-sm space-y-2">
              <Row label="Status"><StatusBadge value={j.status} kind="job" /></Row>
              <Row label="Attempts">{j.attemptCount}</Row>
              <Row label="Model">{j.modelProvider ? `${j.modelProvider} / ${j.modelName}` : '—'}</Row>
              <Row label="Created">{relTime(j.createdAt)}</Row>
              <Row label="Started">{relTime(j.startedAt)}</Row>
              <Row label="Completed">{relTime(j.completedAt)}</Row>
            </dl>
            {j.errorMessage ? (
              <div className="mt-4 bg-red-900/20 border border-red-800/50 rounded-md p-3 text-xs text-red-300 font-mono whitespace-pre-wrap">
                {j.errorMessage}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</dt>
      <dd className="text-ink-800 dark:text-ink-200 text-sm">{children}</dd>
    </div>
  );
}
