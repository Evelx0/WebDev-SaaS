import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type LeadList } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { relTime } from '../lib/format';
import { useDebounce } from '../hooks/useDebounce';

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  info_pull_queued: 'Info pull queued',
  info_pulled: 'Info pulled',
  needs_review: 'Needs review',
  ready_for_site: 'Ready for site',
  site_generation_queued: 'Site generation queued',
  site_generating: 'Site generating',
  site_generated: 'Site generated',
  site_deploying: 'Site deploying',
  site_deployed: 'Site deployed',
  site_failed: 'Site failed',
  contact_pending: 'Contact pending',
  contacted: 'Contacted',
  discarded: 'Discarded',
};

export function LeadsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const navigate = useNavigate();
  const debouncedQ = useDebounce(q, 250);

  const leads = useQuery({
    queryKey: ['leads', { q: debouncedQ, status }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQ) params.set('q', debouncedQ);
      if (status) params.set('status', status);
      const qs = params.toString();
      return api.get<LeadList>(`/leads${qs ? `?${qs}` : ''}`);
    },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Leads"
        subtitle="Pasted Google Business Profiles, enriched and tracked through demo-site delivery."
        actions={
          <button className="btn-primary" onClick={() => navigate('/leads/new')} data-testid="button-add-lead">
            + Add lead
          </button>
        }
      />
      <div className="px-8 py-4 border-b border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 flex items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search business name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="input-search-leads"
        />
        <select
          className="input max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          data-testid="select-lead-status-filter"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([s, label]) => (
            <option key={s} value={s}>{label}</option>
          ))}
        </select>
        <div className="ml-auto text-sm text-ink-500 dark:text-ink-400">
          {leads.data
            ? `Showing ${leads.data.leads.length} of ${leads.data.total}`
            : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {leads.isLoading ? (
          <SkeletonTable />
        ) : leads.isError ? (
          <ErrorState message="Failed to load leads." />
        ) : leads.data && leads.data.leads.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/60 dark:bg-ink-900/60 border-b border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 text-left">
                <tr>
                  <Th>Business</Th>
                  <Th>Lead status</Th>
                  <Th>Site status</Th>
                  <Th>Demo URL</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {leads.data!.leads.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-ink-100 dark:border-ink-700/50 hover:bg-ink-50/40 dark:hover:bg-ink-700/30 cursor-pointer"
                    onClick={() => navigate(`/leads/${l.id}`)}
                    data-testid={`link-lead-${l.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-100">
                      {l.businessName ?? <span className="text-ink-400 dark:text-ink-500 italic">unnamed</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={l.leadStatus} kind="lead" /></td>
                    <td className="px-4 py-3"><StatusBadge value={l.siteStatus} kind="site" /></td>
                    <td className="px-4 py-3">
                      {l.vercelUrl ? (
                        <a
                          href={l.vercelUrl}
                          target="_blank"
                          rel="noopener"
                          className="text-accent-500 hover:underline truncate inline-block max-w-[180px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {l.vercelUrl.replace(/^https?:\/\//, '')}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-500 dark:text-ink-400 text-xs">{relTime(l.updatedAt)}</td>
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

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">{children}</th>;
}

function SkeletonTable() {
  return (
    <div className="card p-6 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-8 bg-ink-100 dark:bg-ink-700 rounded animate-pulse" />
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <div className="card p-8 text-center text-red-700 dark:text-red-400">{message}</div>;
}

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <div className="text-ink-700 dark:text-ink-300 font-medium">No leads yet</div>
      <p className="text-ink-500 dark:text-ink-400 text-sm mt-1">Paste a Google Business Profile URL to add your first lead.</p>
      <button className="btn-primary mt-4 inline-flex" onClick={() => window.location.assign('/leads/new')}>Add lead</button>
    </div>
  );
}
