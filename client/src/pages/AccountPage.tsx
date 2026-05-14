import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AccountSettings } from '../lib/api';
import { PageHeader } from '../components/PageHeader';

export function AccountPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['account', 'settings'],
    queryFn: () => api.get<AccountSettings>('/account/settings'),
  });
  const [name, setName] = useState('');
  const [vercelApiToken, setVercelApiToken] = useState('');
  const [vercelTeamId, setVercelTeamId] = useState('');
  const [vercelProjectPrefix, setVercelProjectPrefix] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [clearOpenrouterKey, setClearOpenrouterKey] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [clearSmtpPassword, setClearSmtpPassword] = useState(false);
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapSecure, setImapSecure] = useState(true);
  const [imapUsername, setImapUsername] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [clearImapPassword, setClearImapPassword] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setName(settings.data.name ?? '');
    setVercelTeamId(settings.data.vercelTeamId);
    setVercelProjectPrefix(settings.data.vercelProjectPrefix);
    setSmtpHost(settings.data.smtpHost);
    setSmtpPort(String(settings.data.smtpPort));
    setSmtpSecure(settings.data.smtpSecure);
    setSmtpUsername(settings.data.smtpUsername);
    setSmtpFromName(settings.data.smtpFromName);
    setSmtpFromEmail(settings.data.smtpFromEmail);
    setImapHost(settings.data.imapHost);
    setImapPort(String(settings.data.imapPort));
    setImapSecure(settings.data.imapSecure);
    setImapUsername(settings.data.imapUsername);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch<AccountSettings>('/account/settings', {
        name,
        vercelApiToken: vercelApiToken || undefined,
        clearVercelApiToken: clearToken,
        vercelTeamId: vercelTeamId || null,
        vercelProjectPrefix: vercelProjectPrefix || null,
        openrouterApiKey: openrouterApiKey || undefined,
        clearOpenrouterApiKey: clearOpenrouterKey,
        smtpHost: smtpHost || null,
        smtpPort: smtpPort ? Number(smtpPort) : null,
        smtpSecure,
        smtpUsername: smtpUsername || null,
        smtpPassword: smtpPassword || undefined,
        clearSmtpPassword,
        smtpFromName: smtpFromName || null,
        smtpFromEmail: smtpFromEmail || null,
        imapHost: imapHost || null,
        imapPort: imapPort ? Number(imapPort) : null,
        imapSecure,
        imapUsername: imapUsername || null,
        imapPassword: imapPassword || undefined,
        clearImapPassword,
      }),
    onSuccess: () => {
      setVercelApiToken('');
      setClearToken(false);
      setOpenrouterApiKey('');
      setClearOpenrouterKey(false);
      setSmtpPassword('');
      setClearSmtpPassword(false);
      setImapPassword('');
      setClearImapPassword(false);
      qc.invalidateQueries({ queryKey: ['account', 'settings'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Account"
        subtitle="Manage your deployment, AI, and mailbox settings."
      />
      <div className="coreui-page">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="24h usage" value={settings.data ? (settings.data.usage.limit == null ? 'Unlimited' : `${settings.data.usage.used}/${settings.data.usage.limit}`) : '...'} />
          <Metric label="Remaining" value={settings.data ? (settings.data.usage.remaining == null ? 'Unlimited' : String(settings.data.usage.remaining)) : '...'} />
          <Metric label="Vercel" value={settings.data?.hasVercelConfig ? 'Configured' : 'Required'} />
          <Metric label="Email workspace" value={settings.data?.hasEmailConfig ? 'Unlocked' : 'Locked'} />
          <Metric label="Mailbox sync" value={settings.data?.hasMailboxSync ? 'Enabled' : 'SMTP only'} />
        </div>

        <section className="card overflow-hidden max-w-4xl">
          <div className="coreui-card-header">
            <div>
              <h2 className="coreui-card-title">Profile, Vercel, and AI</h2>
              <p className="coreui-card-subtitle">A Vercel token and project prefix are required before demo generation can be queued.</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="label">Display name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Vercel API token</label>
                <input
                  className="input"
                  type="password"
                  value={vercelApiToken}
                  onChange={(e) => setVercelApiToken(e.target.value)}
                  placeholder={settings.data?.hasVercelConfig ? 'Token saved; enter a new one to replace' : 'Required'}
                />
              </div>
              <div>
                <label className="label">Vercel team ID</label>
                <input className="input" value={vercelTeamId} onChange={(e) => setVercelTeamId(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div>
              <label className="label">Vercel project prefix</label>
              <input className="input" value={vercelProjectPrefix} onChange={(e) => setVercelProjectPrefix(e.target.value.toLowerCase())} placeholder="e.g. lead-demo" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 border-t border-ink-100 pt-4 dark:border-ink-700">
              <div>
                <label className="label">OpenRouter API key</label>
                <input
                  className="input"
                  type="password"
                  value={openrouterApiKey}
                  onChange={(e) => setOpenrouterApiKey(e.target.value)}
                  placeholder={settings.data?.hasOpenRouterKey ? 'Key saved; enter a new one to replace' : 'Optional: removes 24h generation cap'}
                />
              </div>
              <div className="rounded-md border border-ink-100 bg-ink-50 p-3 text-sm text-ink-600 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
                {settings.data?.hasOpenRouterKey
                  ? 'Your AI generations use your OpenRouter key and are not capped by the 24-hour platform limit.'
                  : 'Without your own OpenRouter key, generation uses the platform key and follows your 24-hour allowance.'}
              </div>
            </div>
            {settings.data?.hasVercelConfig ? (
              <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
                <input type="checkbox" checked={clearToken} onChange={(e) => setClearToken(e.target.checked)} />
                Clear saved Vercel token
              </label>
            ) : null}
            {settings.data?.hasOpenRouterKey ? (
              <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
                <input type="checkbox" checked={clearOpenrouterKey} onChange={(e) => setClearOpenrouterKey(e.target.checked)} />
                Clear saved OpenRouter key
              </label>
            ) : null}
          </div>
        </section>

        <section className="card overflow-hidden max-w-5xl">
          <div className="coreui-card-header">
            <div>
              <h2 className="coreui-card-title">Email Workspace</h2>
              <p className="coreui-card-subtitle">SMTP unlocks the Emails area. Add IMAP-compatible mailbox sync to load Inbox and Sent like a webmail client.</p>
            </div>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">SMTP host</label>
                    <input className="input" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.your-provider.com" />
                  </div>
                  <div>
                    <label className="label">SMTP port</label>
                    <input className="input" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">SMTP username</label>
                    <input className="input" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} placeholder="Mailbox login" />
                  </div>
                  <div>
                    <label className="label">SMTP password</label>
                    <input
                      className="input"
                      type="password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder={settings.data?.hasSmtpPassword ? 'Password saved; enter a new one to replace' : 'Required'}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">From name</label>
                    <input className="input" value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="Your team name" />
                  </div>
                  <div>
                    <label className="label">From email</label>
                    <input className="input" type="email" value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="you@your-domain.com" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
                  <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
                  Use secure SMTP/TLS
                </label>
                {settings.data?.hasSmtpPassword ? (
                  <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
                    <input type="checkbox" checked={clearSmtpPassword} onChange={(e) => setClearSmtpPassword(e.target.checked)} />
                    Clear saved SMTP password
                  </label>
                ) : null}
              </div>

              <aside className="rounded-lg border border-ink-100 bg-ink-50 p-4 text-sm text-ink-600 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">What this unlocks</div>
                <div className="mt-3 space-y-3">
                  <p>Once SMTP is saved, the `Emails` workspace appears in navigation and the app can send replies with CC and BCC.</p>
                  <p>Add mailbox sync below if you want Inbox and Sent to populate from the same mailbox.</p>
                  <p>Last sync: {settings.data?.emailLastSyncedAt ? new Date(settings.data.emailLastSyncedAt).toLocaleString() : 'Not synced yet'}</p>
                </div>
              </aside>
            </div>

            <div className="border-t border-ink-100 pt-5 dark:border-ink-700">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Mailbox sync</h3>
                <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Use IMAP-style access for Inbox and Sent. Leave the IMAP username or password blank to reuse the SMTP credentials when your provider allows it.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Mailbox host</label>
                  <input className="input" value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.your-provider.com" />
                </div>
                <div>
                  <label className="label">Mailbox port</label>
                  <input className="input" value={imapPort} onChange={(e) => setImapPort(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <label className="label">Mailbox username</label>
                  <input className="input" value={imapUsername} onChange={(e) => setImapUsername(e.target.value)} placeholder="Optional: defaults to SMTP username" />
                </div>
                <div>
                  <label className="label">Mailbox password</label>
                  <input
                    className="input"
                    type="password"
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    placeholder={settings.data?.hasImapPassword ? 'Password saved; enter a new one to replace' : 'Optional: defaults to SMTP password'}
                  />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
                  <input type="checkbox" checked={imapSecure} onChange={(e) => setImapSecure(e.target.checked)} />
                  Use secure mailbox/TLS
                </label>
                {settings.data?.hasImapPassword ? (
                  <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
                    <input type="checkbox" checked={clearImapPassword} onChange={(e) => setClearImapPassword(e.target.checked)} />
                    Clear saved mailbox password
                  </label>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'Saving...' : 'Save settings'}
              </button>
              {save.isError ? <span className="text-sm text-red-600 dark:text-red-400">{(save.error as Error).message}</span> : null}
              {save.isSuccess ? <span className="text-sm text-accent-700 dark:text-accent-400">Saved</span> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-100">{value}</div>
    </div>
  );
}
