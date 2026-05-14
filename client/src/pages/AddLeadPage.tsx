import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, type Lead } from '../lib/api';
import { PageHeader } from '../components/PageHeader';

export function AddLeadPage() {
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [pullNow, setPullNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: async () => {
      const lead = await api.post<Lead>('/leads', { googleProfileUrl: url, notes: notes || undefined });
      if (pullNow) {
        await api.post(`/leads/${lead.id}/pull-info`);
      }
      return lead;
    },
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      navigate(`/leads/${lead.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create lead'),
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Add lead"
        subtitle="Create a lead from a Google Business Profile or Google Maps URL."
        actions={<Link to="/leads" className="btn-secondary">Cancel</Link>}
      />
      <div className="p-8">
        <form
          className="card p-6 max-w-xl space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
        >
          <div>
            <label className="label" htmlFor="url">Google Business Profile URL</label>
            <input
              id="url"
              data-testid="input-google-url"
              required
              type="url"
              placeholder="https://www.google.com/maps/place/…"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
              Paste a link from Google Maps or a Google Business Profile. Short links (maps.app.goo.gl) are accepted.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              data-testid="input-notes"
              rows={4}
              placeholder="Anything the operator should remember about this lead…"
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
            <input
              type="checkbox"
              checked={pullNow}
              onChange={(e) => setPullNow(e.target.checked)}
              data-testid="checkbox-pull-now"
            />
            Pull business info immediately after creating
          </label>
          {error ? (
            <div className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">{error}</div>
          ) : null}
          <div className="flex items-center gap-2 pt-2">
            <button type="submit" disabled={create.isPending} className="btn-primary" data-testid="button-create-lead">
              {create.isPending ? 'Creating…' : 'Create lead'}
            </button>
            <Link to="/leads" className="btn-ghost">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
