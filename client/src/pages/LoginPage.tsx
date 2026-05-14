import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api.post<{ id: string; email: string }>('/auth/login', vars),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      navigate('/dashboard');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    },
  });

  return (
    <div className="login-splash min-h-full p-4 text-ink-900 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-lg border border-white/15 bg-white shadow-2xl shadow-ink-950/25 sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden bg-[#212631] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-10 text-white" />
            <div>
              <div className="text-sm font-semibold tracking-tight">Tomlinsn</div>
              <div className="text-xs text-white/50">Lead generation workspace</div>
            </div>
          </div>
          <div className="max-w-md">
            <div className="mb-4 h-1 w-16 rounded-full bg-accent-500" />
            <h2 className="text-4xl font-semibold tracking-tight">Build sharper demo sites for better-fit leads.</h2>
            <p className="mt-4 text-sm leading-6 text-white/62">
              Enrich leads, generate tailored websites, deploy previews, and manage outreach from one focused workspace.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-white/55">
            <div className="rounded-md border border-white/10 bg-white/5 p-3">Leads</div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">Demos</div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">Pitches</div>
          </div>
        </section>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Logo className="h-10 w-10 text-ink-900" />
              <div className="text-sm font-semibold tracking-tight">Tomlinsn</div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Login to Tomlinsn</h1>
            <form
              className="mt-7 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                m.mutate({ email, password });
              }}
            >
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  required
                  autoComplete="username"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={m.isPending}
                className="btn-primary w-full"
                data-testid="button-login-submit"
              >
                {m.isPending ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-label="Tomlinsn logo" fill="none" className={className}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="6" stroke="currentColor" />
      <path d="M9 22V10h3v9h7v3z" fill="currentColor" />
    </svg>
  );
}
