import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type EmailFolder,
  type EmailThreadDetail,
  type EmailThreadListResponse,
  type MailboxSyncResult,
} from '../lib/api';
import { relTime } from '../lib/format';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader } from '../components/PageHeader';

const folders: Array<{ key: EmailFolder; label: string }> = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'outbox', label: 'Outbox' },
];

export function EmailsPage() {
  const qc = useQueryClient();
  const [folder, setFolder] = useState<EmailFolder>('inbox');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const threads = useQuery({
    queryKey: ['emails', 'threads', folder, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ folder });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      return api.get<EmailThreadListResponse>(`/emails/threads?${params.toString()}`);
    },
  });

  useEffect(() => {
    const availableIds = new Set(threads.data?.threads.map((thread) => thread.id) ?? []);
    if (availableIds.size === 0) {
      setSelectedThreadId(null);
      return;
    }
    if (!selectedThreadId || !availableIds.has(selectedThreadId)) {
      setSelectedThreadId(threads.data?.threads[0]?.id ?? null);
    }
  }, [selectedThreadId, threads.data?.threads]);

  const threadDetail = useQuery({
    queryKey: ['emails', 'thread', selectedThreadId],
    queryFn: () => api.get<EmailThreadDetail>(`/emails/threads/${selectedThreadId}`),
    enabled: Boolean(selectedThreadId),
  });

  useEffect(() => {
    if (!threadDetail.data) return;
    setTo(threadDetail.data.participantEmail);
    setCc('');
    setBcc('');
    setSubject(buildReplySubject(threadDetail.data.subject));
    setBody('');
  }, [threadDetail.data?.id, threadDetail.data?.participantEmail, threadDetail.data?.subject]);

  const syncMailbox = useMutation({
    mutationFn: () => api.post<MailboxSyncResult>('/emails/sync'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails', 'threads'] });
      if (selectedThreadId) qc.invalidateQueries({ queryKey: ['emails', 'thread', selectedThreadId] });
    },
  });

  const reply = useMutation({
    mutationFn: () =>
      api.post(`/emails/threads/${selectedThreadId}/reply`, {
        to: splitEmails(to),
        cc: splitEmails(cc),
        bcc: splitEmails(bcc),
        subject,
        body,
      }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['emails', 'threads'] });
      if (selectedThreadId) qc.invalidateQueries({ queryKey: ['emails', 'thread', selectedThreadId] });
      setFolder('sent');
    },
  });

  const counts = threads.data?.counts ?? { inbox: 0, sent: 0, outbox: 0 };
  const selectedThread = threadDetail.data;
  const selectedLeadLink = selectedThread?.lead?.id ? `/leads/${selectedThread.lead.id}` : null;

  const folderHint = useMemo(() => {
    if (threads.data?.hasMailboxSync) return null;
    if (folder === 'inbox' || folder === 'sent') {
      return 'Mailbox sync is not configured yet. Save IMAP-style mailbox access in Account to populate Inbox and Sent.';
    }
    return 'SMTP is configured, so Outbox and manual sends are available even before mailbox sync is enabled.';
  }, [folder, threads.data?.hasMailboxSync]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Emails"
        subtitle="Mailbox-style lead conversations with reply, CC, BCC, delivered state, and manual sync."
        actions={(
          <>
            <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-500 dark:border-ink-700 dark:bg-ink-900/50 dark:text-ink-400">
              Last sync: {threads.data?.emailLastSyncedAt ? new Date(threads.data.emailLastSyncedAt).toLocaleString() : 'Not synced yet'}
            </div>
            <button
              className="btn-secondary"
              onClick={() => syncMailbox.mutate()}
              disabled={syncMailbox.isPending || !threads.data?.hasMailboxSync}
              title={threads.data?.hasMailboxSync ? 'Sync mailbox now' : 'Add mailbox sync settings in Account first'}
            >
              {syncMailbox.isPending ? 'Syncing...' : 'Sync mailbox'}
            </button>
          </>
        )}
      />
      <div className="coreui-page">
        {folderHint ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            {folderHint}
          </div>
        ) : null}
        {syncMailbox.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {(syncMailbox.error as Error).message}
          </div>
        ) : null}

        <section className="card overflow-hidden">
          <div className="grid min-h-[760px] gap-0 xl:grid-cols-[220px_360px_minmax(0,1fr)]">
            <aside className="border-b border-ink-100 bg-ink-50/80 p-4 dark:border-ink-700 dark:bg-ink-900/30 xl:border-b-0 xl:border-r">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Folders</div>
              <div className="mt-4 space-y-2">
                {folders.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFolder(item.key)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      folder === item.key
                        ? 'border-accent-500 bg-accent-50 text-accent-800 dark:border-accent-500/60 dark:bg-accent-600/15 dark:text-accent-300'
                        : 'border-transparent bg-white text-ink-700 hover:border-ink-200 hover:bg-ink-50 dark:bg-ink-800 dark:text-ink-200 dark:hover:border-ink-600 dark:hover:bg-ink-700/60'
                    }`}
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] dark:bg-white/10">
                      {counts[item.key]}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-8 rounded-lg border border-ink-200 bg-white p-4 text-sm text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Workspace</div>
                <div className="mt-3 space-y-2">
                  <p>SMTP unlocks sending and the `Emails` area.</p>
                  <p>IMAP-style mailbox sync fills Inbox and Sent from the provider mailbox.</p>
                  <Link to="/account" className="inline-flex text-xs font-medium text-accent-700 hover:underline dark:text-accent-300">
                    Edit mailbox settings
                  </Link>
                </div>
              </div>
            </aside>

            <div className="border-b border-ink-100 dark:border-ink-700 xl:border-b-0 xl:border-r">
              <div className="border-b border-ink-100 p-4 dark:border-ink-700">
                <label className="label">Search threads</label>
                <input
                  className="input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subject, lead, or email"
                />
              </div>
              <div className="divide-y divide-ink-100 dark:divide-ink-700">
                {threads.data?.threads.map((thread) => {
                  const active = thread.id === selectedThreadId;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`block w-full px-4 py-4 text-left transition ${
                        active ? 'bg-accent-50 dark:bg-accent-600/10' : 'hover:bg-ink-50 dark:hover:bg-ink-700/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-ink-900 dark:text-ink-100">
                            {thread.participantName || thread.participantEmail}
                          </div>
                          <div className="truncate text-xs text-ink-500 dark:text-ink-400">{thread.subject}</div>
                        </div>
                        <div className="shrink-0 text-[11px] text-ink-400 dark:text-ink-500">
                          {relTime(thread.lastMessageAt)}
                        </div>
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm text-ink-600 dark:text-ink-300">
                        {thread.lastMessagePreview || thread.latestMessage?.snippet || 'No preview available.'}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                        <span className="truncate text-ink-500 dark:text-ink-400">
                          {thread.lead?.businessName || thread.participantEmail}
                        </span>
                        <span className={statusPillClass(thread.latestMessage?.deliveryStatus)}>
                          {thread.latestMessage?.deliveryStatus ?? 'thread'}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {threads.data?.threads.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
                    No conversations in {folder}.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-0 flex-col bg-white dark:bg-ink-800">
              {selectedThread ? (
                <>
                  <div className="border-b border-ink-100 px-5 py-4 dark:border-ink-700">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Conversation</div>
                        <h2 className="mt-1 truncate text-lg font-semibold text-ink-900 dark:text-ink-100">{selectedThread.subject}</h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
                          <span>{selectedThread.participantName || selectedThread.participantEmail}</span>
                          <span>•</span>
                          <span>{selectedThread.participantEmail}</span>
                        </div>
                      </div>
                      <div className="min-w-[220px] rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm dark:border-ink-700 dark:bg-ink-900/40">
                        <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Lead link</div>
                        {selectedThread.lead ? (
                          <div className="mt-2 space-y-1">
                            <Link to={selectedLeadLink ?? '#'} className="block font-medium text-ink-900 hover:underline dark:text-ink-100">
                              {selectedThread.lead.businessName || selectedThread.participantEmail}
                            </Link>
                            <div className="text-ink-500 dark:text-ink-400">{selectedThread.lead.city || 'No city'} {selectedThread.lead.phone ? `· ${selectedThread.lead.phone}` : ''}</div>
                          </div>
                        ) : (
                          <div className="mt-2 text-ink-500 dark:text-ink-400">No lead is linked to this contact yet.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto bg-ink-50/60 px-5 py-5 dark:bg-ink-900/20">
                    <div className="space-y-4">
                      {selectedThread.messages.map((message) => (
                        <article
                          key={message.id}
                          className={`max-w-3xl rounded-xl border px-4 py-3 shadow-sm ${
                            message.direction === 'outgoing'
                              ? 'ml-auto border-accent-200 bg-accent-50 dark:border-accent-700/40 dark:bg-accent-700/15'
                              : 'border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-800'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-ink-900 dark:text-ink-100">
                                {message.direction === 'incoming'
                                  ? message.fromName || message.fromEmail
                                  : 'You'}
                              </div>
                              <div className="text-xs text-ink-500 dark:text-ink-400">
                                {message.direction === 'incoming'
                                  ? `to ${message.toEmails.join(', ') || 'your mailbox'}`
                                  : `to ${message.toEmails.join(', ')}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className={statusPillClass(message.deliveryStatus)}>{message.deliveryStatus}</span>
                              <span className="text-ink-400 dark:text-ink-500">{formatMessageTime(message)}</span>
                            </div>
                          </div>
                          {(message.ccEmails.length || message.bccEmails.length) ? (
                            <div className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                              {message.ccEmails.length ? `CC: ${message.ccEmails.join(', ')}` : ''}
                              {message.ccEmails.length && message.bccEmails.length ? ' · ' : ''}
                              {message.bccEmails.length ? `BCC: ${message.bccEmails.join(', ')}` : ''}
                            </div>
                          ) : null}
                          <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-700 dark:text-ink-200">
                            {message.textBody || message.snippet || '(empty message body)'}
                          </div>
                          {message.errorMessage ? (
                            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                              {message.errorMessage}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-ink-100 px-5 py-5 dark:border-ink-700">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Reply</h3>
                        <p className="text-xs text-ink-500 dark:text-ink-400">Replies send with your saved SMTP mailbox and record delivered or failed status.</p>
                      </div>
                      {reply.isError ? <div className="text-sm text-red-600 dark:text-red-400">{(reply.error as Error).message}</div> : null}
                    </div>
                    <div className="space-y-3">
                      <FieldRow label="To">
                        <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
                      </FieldRow>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FieldRow label="CC">
                          <input className="input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="one@example.com, two@example.com" />
                        </FieldRow>
                        <FieldRow label="BCC">
                          <input className="input" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Optional" />
                        </FieldRow>
                      </div>
                      <FieldRow label="Subject">
                        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
                      </FieldRow>
                      <FieldRow label="Message">
                        <textarea
                          className="input min-h-[180px] resize-y"
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder="Write your reply..."
                        />
                      </FieldRow>
                      <div className="flex items-center gap-3">
                        <button
                          className="btn-primary"
                          onClick={() => reply.mutate()}
                          disabled={reply.isPending || !body.trim() || !selectedThreadId}
                        >
                          {reply.isPending ? 'Sending...' : 'Send reply'}
                        </button>
                        {reply.isSuccess ? <span className="text-sm text-accent-700 dark:text-accent-400">Sent and marked delivered.</span> : null}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid min-h-[420px] place-items-center px-6 text-center text-sm text-ink-500 dark:text-ink-400">
                  <div>
                    <div className="text-base font-semibold text-ink-900 dark:text-ink-100">No thread selected</div>
                    <div className="mt-2">Choose a conversation from the list or sync the mailbox to pull recent email.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function splitEmails(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildReplySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function formatMessageTime(message: EmailThreadDetail['messages'][number]): string {
  return message.deliveredAt || message.receivedAt || message.sentAt || message.createdAt
    ? new Date(message.deliveredAt || message.receivedAt || message.sentAt || message.createdAt).toLocaleString()
    : 'Unknown time';
}

function statusPillClass(status: string | null | undefined): string {
  switch (status) {
    case 'delivered':
      return 'rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700 dark:bg-accent-700/20 dark:text-accent-300';
    case 'queued':
      return 'rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'failed':
      return 'rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'received':
      return 'rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    default:
      return 'rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600 dark:bg-ink-700 dark:text-ink-300';
  }
}
