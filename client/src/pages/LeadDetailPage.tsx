import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type AccountSettings,
  type LeadDetail,
  type QueuedJobResponse,
  type SalesPitch,
  type SiteDesignBrief,
} from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { fmtAddress, relTime } from '../lib/format';

interface W1Data { categoryInsights?: string; typicalPainPoints?: string[]; webPresenceNotes?: string; }
interface W2Data { competitors?: Array<{ name: string; url: string | null }>; marketContext?: string; }
interface W0Data {
  overview?: string;
  services?: string[];
  products?: string[];
  courses?: string[];
  trustSignals?: string[];
  serviceAreas?: string[];
  callsToAction?: string[];
  usefulDesignNotes?: string;
  sourceUrls?: string[];
}

function buildSuggestedGenNotes(sources: LeadDetail['sources']): string {
  const w0 = sources.find((s) => s.sourceType === 'current_website_scrape');
  const w1 = sources.find((s) => s.sourceType === 'web_research');
  const w2 = sources.find((s) => s.sourceType === 'competitor_scout');
  const lines: string[] = [];

  if (w0) {
    const d = w0.extractedData as W0Data;
    if (d?.overview) lines.push(`Current website summary: ${d.overview}`);
    const offerings = [...(d?.services ?? []), ...(d?.products ?? []), ...(d?.courses ?? [])].slice(0, 10);
    if (offerings.length) lines.push(`Current offerings: ${offerings.join('; ')}`);
    if (d?.trustSignals?.length) lines.push(`Existing trust/proof signals: ${d.trustSignals.join('; ')}`);
    if (d?.callsToAction?.length) lines.push(`Existing CTAs: ${d.callsToAction.join('; ')}`);
    if (d?.usefulDesignNotes) lines.push(`Website scrape design notes: ${d.usefulDesignNotes}`);
  }
  if (w1) {
    const d = w1.extractedData as W1Data;
    if (d?.categoryInsights) lines.push(`Market insight: ${d.categoryInsights}`);
    if (d?.typicalPainPoints?.length) lines.push(`Pain points: ${d.typicalPainPoints.join('; ')}`);
    if (d?.webPresenceNotes) lines.push(`Web presence: ${d.webPresenceNotes}`);
  }
  if (w2) {
    const d = w2.extractedData as W2Data;
    if (d?.marketContext) lines.push(`Market context: ${d.marketContext}`);
    if (d?.competitors?.length) {
      const names = d.competitors.slice(0, 3).map((c) => c.name).join(', ');
      lines.push(`Local competitors: ${names}`);
    }
  }
  return lines.join('\n');
}

const editableFields = [
  ['businessName', 'Business name'],
  ['category', 'Category'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['postcode', 'Postcode'],
  ['country', 'Country'],
  ['existingWebsiteUrl', 'Existing website URL'],
] as const;

type EditableKey = (typeof editableFields)[number][0];

const DESIGN_ARCHETYPES = [
  'Premium Trade',
  'Emergency Service',
  'Accredited Field Specialist',
  'Training Academy',
  'Studio Editorial',
  'Boutique Hospitality',
  'Clinical Trust',
  'Family Local',
  'Luxury Property',
  'Artisan Retail',
  'Fitness Energy',
  'Professional Authority',
] as const;

function normaliseDesignArchetype(value: string | null | undefined): string {
  if (!value) return DESIGN_ARCHETYPES[0];
  const exact = DESIGN_ARCHETYPES.find((a) => a === value);
  if (exact) return exact;
  const lower = value.toLowerCase();
  return DESIGN_ARCHETYPES.find((a) => lower.includes(a.toLowerCase())) ?? DESIGN_ARCHETYPES[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isTrustpilotMode(value: unknown): value is SiteDesignBrief['trustpilotMode'] {
  return value === 'placeholder' || value === 'real_profile' || value === 'omit';
}

function parseSiteDesignBrief(value: unknown): SiteDesignBrief | null {
  if (!isRecord(value)) return null;
  const readString = (key: string) => (typeof value[key] === 'string' ? value[key] : null);
  const designArchetype = readString('designArchetype');
  const visualMood = readString('visualMood');
  const heroAngle = readString('heroAngle');
  const trustSignalPlan = readString('trustSignalPlan');
  const localPositioning = readString('localPositioning');
  const galleryStyle = readString('galleryStyle');
  const ctaWording = readString('ctaWording');
  const avoidClaims = readString('avoidClaims');
  if (
    designArchetype === null ||
    visualMood === null ||
    heroAngle === null ||
    trustSignalPlan === null ||
    localPositioning === null ||
    galleryStyle === null ||
    ctaWording === null ||
    avoidClaims === null
  ) {
    return null;
  }
  if (!isTrustpilotMode(value.trustpilotMode)) return null;
  if (!isStringArray(value.servicesToEmphasise)) return null;

  return {
    designArchetype: normaliseDesignArchetype(designArchetype),
    visualMood,
    heroAngle,
    trustSignalPlan,
    trustpilotMode: value.trustpilotMode,
    trustpilotUrl: typeof value.trustpilotUrl === 'string' ? value.trustpilotUrl : null,
    trustpilotRating: typeof value.trustpilotRating === 'string' ? value.trustpilotRating : null,
    trustpilotReviewCount: typeof value.trustpilotReviewCount === 'string' ? value.trustpilotReviewCount : null,
    servicesToEmphasise: value.servicesToEmphasise,
    localPositioning,
    galleryStyle,
    ctaWording,
    avoidClaims,
  };
}

function buildFallbackDesignBrief(lead: LeadDetail): SiteDesignBrief {
  const latestAiSuggestion = lead.sources.find((s) => s.sourceType === 'site_design_suggestion');
  const aiBrief = parseSiteDesignBrief(latestAiSuggestion?.extractedData);
  if (aiBrief) return aiBrief;

  const category = lead.category ?? 'local service';
  const city = lead.city ?? 'the local area';
  const websiteScrape = lead.sources.find((s) => s.sourceType === 'current_website_scrape')?.extractedData as W0Data | undefined;
  const currentOfferings = [
    ...(websiteScrape?.services ?? []),
    ...(websiteScrape?.products ?? []),
    ...(websiteScrape?.courses ?? []),
  ].slice(0, 8);
  return {
    designArchetype: 'Premium Trade',
    visualMood: 'Modern local-service design with confident typography, strong contrast, and one tailored visual hook.',
    heroAngle: `Make ${lead.businessName ?? 'the business'} feel like the clear local choice for ${category} in ${city}.`,
    trustSignalPlan: websiteScrape?.trustSignals?.length
      ? `Use these existing proof signals only if presented safely: ${websiteScrape.trustSignals.join(', ')}. Keep review placeholders labelled.`
      : 'Use labelled review placeholders, clear local-service badges, and no unverifiable claims.',
    trustpilotMode: 'placeholder',
    trustpilotUrl: null,
    trustpilotRating: null,
    trustpilotReviewCount: null,
    servicesToEmphasise: currentOfferings.length ? currentOfferings : [category, 'Quotes', 'Local work', 'Customer enquiries'],
    localPositioning: `Position the business around practical, easy-to-contact service for customers in ${city}.`,
    galleryStyle: websiteScrape?.usefulDesignNotes || 'Project-style gallery with local captions and demo-only imagery.',
    ctaWording: websiteScrape?.callsToAction?.[0] ?? 'Get a Free Quote',
    avoidClaims: 'No fake reviews, star ratings, awards, certifications, insurance claims, project counts, years in business, or guarantees.',
  };
}

function servicesToText(services: string[]): string {
  return services.join('\n');
}

function textToServices(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const lead = useQuery({
    queryKey: ['leads', leadId],
    queryFn: () => api.get<LeadDetail>(`/leads/${leadId}`),
    enabled: !!leadId,
    refetchInterval: (query) =>
      query.state.data?.jobs.some((j) => j.status === 'queued' || j.status === 'running')
        ? 3_000
        : false,
  });
  const account = useQuery({
    queryKey: ['account', 'settings'],
    queryFn: () => api.get<AccountSettings>('/account/settings'),
  });

  const [form, setForm] = useState<Record<EditableKey, string>>({
    businessName: '', category: '', phone: '', email: '',
    addressLine1: '', addressLine2: '', city: '', postcode: '',
    country: '', existingWebsiteUrl: '',
  });
  const [notes, setNotes] = useState('');
  const [websiteStatus, setWebsiteStatus] = useState('unknown');
  const [genNotes, setGenNotes] = useState('');
  const [brandName, setBrandName] = useState('');
  const [siteDesignBrief, setSiteDesignBrief] = useState<SiteDesignBrief | null>(null);
  const [servicesText, setServicesText] = useState('');
  const [pitchNotes, setPitchNotes] = useState('');
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingSiteId, setDeletingSiteId] = useState<string | null>(null);
  const [queuedDesignRefreshJobId, setQueuedDesignRefreshJobId] = useState<string | null>(null);
  const prefilledForLeadId = useRef<string | null>(null);
  const designPrefilledForLeadId = useRef<string | null>(null);

  const applyDesignBrief = (brief: SiteDesignBrief) => {
    setSiteDesignBrief({
      ...brief,
      designArchetype: normaliseDesignArchetype(brief.designArchetype),
    });
    setServicesText(servicesToText(brief.servicesToEmphasise));
  };

  useEffect(() => {
    if (lead.data) {
      setForm({
        businessName: lead.data.businessName ?? '',
        category: lead.data.category ?? '',
        phone: lead.data.phone ?? '',
        email: lead.data.email ?? '',
        addressLine1: lead.data.addressLine1 ?? '',
        addressLine2: lead.data.addressLine2 ?? '',
        city: lead.data.city ?? '',
        postcode: lead.data.postcode ?? '',
        country: lead.data.country ?? '',
        existingWebsiteUrl: lead.data.existingWebsiteUrl ?? '',
      });
      setNotes(lead.data.notes ?? '');
      setWebsiteStatus(lead.data.websiteStatus);
      const prefillKey = `${lead.data.id}:${lead.data.sources.length}`;
      if (designPrefilledForLeadId.current !== prefillKey) {
        applyDesignBrief(buildFallbackDesignBrief(lead.data));
        designPrefilledForLeadId.current = prefillKey;
      }
    }
  }, [lead.data?.id, lead.data?.updatedAt, lead.data?.sources.length]);

  useEffect(() => {
    if (!lead.data || prefilledForLeadId.current === lead.data.id) return;
    const suggested = buildSuggestedGenNotes(lead.data.sources);
    if (suggested) {
      setGenNotes(suggested);
      prefilledForLeadId.current = lead.data.id;
    }
  }, [lead.data?.id, lead.data?.sources.length]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/leads/${leadId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', leadId] }),
  });

  const pullInfo = useMutation({
    mutationFn: () => api.post(`/leads/${leadId}/pull-info`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', leadId] }),
  });

  const generateAndDeploy = useMutation({
    mutationFn: () =>
      api.post(`/leads/${leadId}/generate-and-deploy-site`, {
        notes: genNotes,
        brandName: brandName.trim() || undefined,
        siteDesignBrief: siteDesignBrief
          ? { ...siteDesignBrief, servicesToEmphasise: textToServices(servicesText) }
          : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', leadId] }),
  });

  const generateDesignSuggestions = useMutation({
    mutationFn: () => api.post<QueuedJobResponse>(`/leads/${leadId}/site-design-suggestions/queue`),
    onSuccess: (result) => {
      setQueuedDesignRefreshJobId(result.jobId);
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
    },
  });

  const deploySite = useMutation({
    mutationFn: () => api.post(`/leads/${leadId}/deploy-site`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', leadId] }),
  });

  const deleteDeployment = useMutation({
    mutationFn: (siteId: string) => api.del(`/leads/${leadId}/generated-sites/${siteId}`),
    onSuccess: () => {
      setDeletingSiteId(null);
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
    },
  });

  const markReady = useMutation({
    mutationFn: () => api.patch(`/leads/${leadId}`, { leadStatus: 'ready_for_site' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', leadId] }),
  });

  const discard = useMutation({
    mutationFn: () => api.patch(`/leads/${leadId}`, { leadStatus: 'discarded' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', leadId] }),
  });

  const deleteLead = useMutation({
    mutationFn: () => api.del(`/leads/${leadId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      navigate('/leads');
    },
    onError: () => setConfirmDelete(false),
  });

  const generatePitch = useMutation({
    mutationFn: () =>
      api.post<SalesPitch>(`/leads/${leadId}/sales-pitches`, {
        operatorNotes: pitchNotes,
      }),
    onSuccess: () => {
      setPitchNotes('');
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
    },
    onError: (err) =>
      setPitchError(err instanceof Error ? err.message : 'Pitch generation failed'),
  });

  if (lead.isLoading) {
    return <div className="p-8 text-sm text-ink-500 dark:text-ink-400">Loading lead…</div>;
  }
  if (lead.isError || !lead.data) {
    return <div className="p-8 text-red-700 dark:text-red-400">Lead not found.</div>;
  }

  const l = lead.data;
  const hasActiveJob = l.jobs.some((j) => j.status === 'queued' || j.status === 'running');
  const designRefreshInProgress = l.jobs.some(
    (j) => j.jobType === 'refresh_site_design' && (j.status === 'queued' || j.status === 'running'),
  );
  const siteInProgress = ['queued', 'generating'].includes(l.siteStatus);
  const canGenerate = Boolean(
    account.data?.hasVercelConfig && (account.data.usage.remaining == null || account.data.usage.remaining > 0),
  );
  const activeJobs = l.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const latestJob = l.jobs[0];
  const latestSite = l.generatedSites[0];
  const sourceCount = l.sources.length;
  const updateDesignBrief = <K extends keyof SiteDesignBrief>(key: K, value: SiteDesignBrief[K]) => {
    setSiteDesignBrief((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={l.businessName ?? 'Unnamed lead'}
        subtitle={fmtAddress([l.city, l.country]) || l.googleProfileUrl}
        actions={
          <>
            <Link to="/leads" className="btn-secondary">← Back</Link>
            {l.vercelUrl ? (
              <a href={l.vercelUrl} target="_blank" rel="noopener" className="btn-secondary" data-testid="link-open-demo">
                Open demo ↗
              </a>
            ) : null}
            <button
              className="btn-secondary"
              disabled={pullInfo.isPending || hasActiveJob}
              onClick={() => pullInfo.mutate()}
              data-testid="button-pull-info"
            >
              {pullInfo.isPending ? 'Queueing…' : 'Pull info'}
            </button>
            {confirmDelete ? (
              <>
                <span className="text-sm text-red-600 dark:text-red-400 font-medium">Delete everything?</span>
                <button
                  className="btn-danger"
                  disabled={deleteLead.isPending}
                  onClick={() => deleteLead.mutate()}
                  data-testid="button-confirm-delete-lead"
                >
                  {deleteLead.isPending ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button
                className="btn-ghost text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => setConfirmDelete(true)}
                data-testid="button-delete-lead"
              >
                Delete lead
              </button>
            )}
          </>
        }
      />

      <div className="coreui-page">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusPanel title="Lead status" value={l.leadStatus} kind="lead" detail={`Updated ${relTime(l.updatedAt)}`} />
          <StatusPanel title="Site status" value={l.siteStatus} kind="site" detail={latestSite ? `Latest v${latestSite.version}` : 'No generated demo yet'} />
          <StatusPanel title="Website" value={l.websiteStatus} kind="website" detail={l.existingWebsiteUrl ? 'Existing site detected' : 'No URL stored'} />
          <div className="card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">Active jobs</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">{activeJobs.length}</div>
            <div className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {latestJob ? `${latestJob.jobType.replace(/_/g, ' ')} · ${relTime(latestJob.createdAt)}` : 'No jobs yet'}
            </div>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 xl:grid-cols-12">
          {/* Left column — main edits */}
          <div className="xl:col-span-8 space-y-6">
          {l.lastError ? (
            <div className="card p-4 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <div className="text-xs uppercase font-medium text-red-700 dark:text-red-400 mb-1">Last error</div>
              <div className="text-sm text-red-900 dark:text-red-300 font-mono whitespace-pre-wrap">{l.lastError}</div>
            </div>
          ) : null}

          <Section
            title="Lead actions"
            subtitle="Move this lead through review, enrichment, and demo readiness."
            actions={<span className="text-xs text-ink-500 dark:text-ink-400">Updated {relTime(l.updatedAt)}</span>}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <MiniInfo label="Lead" value={<StatusBadge value={l.leadStatus} kind="lead" />} />
              <MiniInfo label="Site" value={<StatusBadge value={l.siteStatus} kind="site" />} />
              <MiniInfo label="Website" value={<StatusBadge value={l.websiteStatus} kind="website" />} />
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button className="btn-secondary" disabled={markReady.isPending} onClick={() => markReady.mutate()} data-testid="button-mark-ready">
                Mark ready for site
              </button>
              <button className="btn-ghost text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" disabled={discard.isPending} onClick={() => discard.mutate()} data-testid="button-discard">
                Discard lead
              </button>
            </div>
          </Section>

          <Section title="Business information" subtitle="Canonical lead fields used by enrichment, generation, and pitch prompts.">
            <div className="grid grid-cols-1 gap-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editableFields.slice(0, 4).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      className="input"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      data-testid={`input-${key}`}
                    />
                  </Field>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-ink-100 pt-5 dark:border-ink-700">
                {editableFields.slice(4).map(([key, label]) => (
                  <Field key={key} label={label} wide={key === 'addressLine1' || key === 'existingWebsiteUrl'}>
                    <input
                      className="input"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      data-testid={`input-${key}`}
                    />
                  </Field>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 border-t border-ink-100 pt-5 dark:border-ink-700">
                <div>
                  <label className="label">Website status</label>
                  <select className="input" value={websiteStatus} onChange={(e) => setWebsiteStatus(e.target.value)} data-testid="select-website-status">
                    {([
                      ['unknown', 'Unknown'],
                      ['none_found', 'No website found'],
                      ['has_site', 'Has a website'],
                      ['bad_site', 'Has a bad website'],
                      ['social_only', 'Social media only'],
                    ] as const).map(([s, label]) => (
                      <option key={s} value={s}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-lead-notes" />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <button
                className="btn-primary"
                disabled={save.isPending}
                onClick={() => {
                  const cleaned: Record<string, unknown> = { notes, websiteStatus };
                  for (const [k] of editableFields) {
                    cleaned[k] = form[k] === '' ? null : form[k];
                  }
                  save.mutate(cleaned);
                }}
                data-testid="button-save-lead"
              >
                {save.isPending ? 'Saving…' : 'Save changes'}
              </button>
              {save.isError && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{(save.error as Error).message}</p>}
            </div>
          </Section>

          <Section
            title="Generate demo site"
            subtitle="Review the AI-prefilled design brief, adjust the direction, then queue generation and deployment."
          >
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="label">Brand name in nav <span className="text-ink-400 dark:text-ink-500 font-normal">(leave blank to use business name)</span></label>
                <input className="input" placeholder={lead.data?.businessName ?? 'e.g. Tom\'s Landscaping'} value={brandName} onChange={(e) => setBrandName(e.target.value)} data-testid="input-brand-name" />
              </div>
              {siteDesignBrief ? (
                <div className="overflow-hidden rounded-lg border border-ink-100 dark:border-ink-700">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-ink-50 px-4 py-3 dark:border-ink-700 dark:bg-ink-900/40">
                    <div>
                      <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Design direction</h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                        Prefilled from pulled lead, website, and research data. Editable before generation.
                      </p>
                    </div>
                    <button
                      className="btn-secondary"
                      disabled={generateDesignSuggestions.isPending || hasActiveJob || !l.businessName || !l.category}
                      onClick={() => generateDesignSuggestions.mutate()}
                      data-testid="button-refresh-design-suggestions"
                    >
                      {generateDesignSuggestions.isPending ? 'Queueing…' : designRefreshInProgress ? 'Refreshing…' : 'AI refresh'}
                    </button>
                  </div>
                  {queuedDesignRefreshJobId ? (
                    <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                      Refresh queued. View logs in{' '}
                      <Link to={`/jobs/${queuedDesignRefreshJobId}`} className="text-accent-600 dark:text-accent-400 hover:underline">
                        job details
                      </Link>
                      .
                    </p>
                  ) : null}
                  {generateDesignSuggestions.isError ? (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{(generateDesignSuggestions.error as Error).message}</p>
                  ) : null}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                    <div>
                      <label className="label">Template archetype</label>
                      <select
                        className="input"
                        value={siteDesignBrief.designArchetype}
                        onChange={(e) => updateDesignBrief('designArchetype', e.target.value)}
                        data-testid="input-design-archetype"
                      >
                        {DESIGN_ARCHETYPES.map((archetype) => (
                          <option key={archetype} value={archetype}>
                            {archetype}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">CTA wording</label>
                      <input
                        className="input"
                        value={siteDesignBrief.ctaWording}
                        onChange={(e) => updateDesignBrief('ctaWording', e.target.value)}
                        data-testid="input-design-cta"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Visual mood</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={siteDesignBrief.visualMood}
                        onChange={(e) => updateDesignBrief('visualMood', e.target.value)}
                        data-testid="input-design-visual-mood"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Hero angle</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={siteDesignBrief.heroAngle}
                        onChange={(e) => updateDesignBrief('heroAngle', e.target.value)}
                        data-testid="input-design-hero-angle"
                      />
                    </div>
                    <div>
                      <label className="label">Services to emphasise</label>
                      <textarea
                        className="input"
                        rows={5}
                        value={servicesText}
                        onChange={(e) => setServicesText(e.target.value)}
                        data-testid="input-design-services"
                      />
                    </div>
                    <div>
                      <label className="label">Gallery style</label>
                      <textarea
                        className="input"
                        rows={5}
                        value={siteDesignBrief.galleryStyle}
                        onChange={(e) => updateDesignBrief('galleryStyle', e.target.value)}
                        data-testid="input-design-gallery"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Local positioning</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={siteDesignBrief.localPositioning}
                        onChange={(e) => updateDesignBrief('localPositioning', e.target.value)}
                        data-testid="input-design-local"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Trust and proof plan</label>
                      <textarea
                        className="input"
                        rows={3}
                        value={siteDesignBrief.trustSignalPlan}
                        onChange={(e) => updateDesignBrief('trustSignalPlan', e.target.value)}
                        data-testid="input-design-trust"
                      />
                    </div>
                    <div>
                      <label className="label">Trustpilot mode</label>
                      <select
                        className="input"
                        value={siteDesignBrief.trustpilotMode}
                        onChange={(e) => updateDesignBrief('trustpilotMode', e.target.value as SiteDesignBrief['trustpilotMode'])}
                        data-testid="select-trustpilot-mode"
                      >
                        <option value="placeholder">Placeholder panel</option>
                        <option value="real_profile">Use supplied profile</option>
                        <option value="omit">Omit Trustpilot</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Trustpilot URL</label>
                      <input
                        className="input"
                        value={siteDesignBrief.trustpilotUrl ?? ''}
                        onChange={(e) => updateDesignBrief('trustpilotUrl', e.target.value || null)}
                        placeholder="https://uk.trustpilot.com/review/..."
                        data-testid="input-trustpilot-url"
                      />
                    </div>
                    <div>
                      <label className="label">Trustpilot rating</label>
                      <input
                        className="input"
                        value={siteDesignBrief.trustpilotRating ?? ''}
                        onChange={(e) => updateDesignBrief('trustpilotRating', e.target.value || null)}
                        placeholder="Only if known"
                        data-testid="input-trustpilot-rating"
                      />
                    </div>
                    <div>
                      <label className="label">Trustpilot review count</label>
                      <input
                        className="input"
                        value={siteDesignBrief.trustpilotReviewCount ?? ''}
                        onChange={(e) => updateDesignBrief('trustpilotReviewCount', e.target.value || null)}
                        placeholder="Only if known"
                        data-testid="input-trustpilot-count"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Avoid claims</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={siteDesignBrief.avoidClaims}
                        onChange={(e) => updateDesignBrief('avoidClaims', e.target.value)}
                        data-testid="input-design-avoid"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              <div>
                <label className="label">Generation notes</label>
                <textarea className="input" rows={5} value={genNotes} onChange={(e) => setGenNotes(e.target.value)} data-testid="input-gen-notes" />
              </div>
              <div className="rounded-lg border border-accent-100 bg-accent-50/50 p-4 dark:border-accent-700/40 dark:bg-accent-700/10">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="btn-accent"
                    disabled={generateAndDeploy.isPending || siteInProgress || hasActiveJob || !canGenerate}
                    onClick={() => generateAndDeploy.mutate()}
                    data-testid="button-generate-and-deploy"
                  >
                    {generateAndDeploy.isPending ? 'Queueing…' : siteInProgress ? '⟳ Generating…' : 'Generate demo site'}
                  </button>
                  <span className="text-sm text-ink-600 dark:text-ink-300">
                    {account.data?.hasVercelConfig
                      ? account.data.usage.remaining == null
                        ? 'Queues generation and deployment. Your account is uncapped because you use your own OpenRouter key or admin defaults.'
                        : `Queues generation and deployment. ${account.data.usage.remaining}/${account.data.usage.limit} remaining in 24h.`
                      : 'Add Vercel settings in Account before generating demo sites.'}
                  </span>
                </div>
                {generateAndDeploy.isError && <p className="text-sm text-red-600 dark:text-red-400">{(generateAndDeploy.error as Error).message}</p>}
              </div>
            </div>
          </Section>

          <SalesPitchSection
            pitches={l.salesPitches ?? []}
            hasGeneratedSite={l.generatedSites.length > 0}
            pitchNotes={pitchNotes}
            onPitchNotesChange={setPitchNotes}
            onGenerate={() => { setPitchError(null); generatePitch.mutate(); }}
            isPending={generatePitch.isPending}
            error={pitchError}
          />
        </div>

          {/* Right column — meta */}
          <div className="xl:col-span-4 space-y-6">
          <Section title="Source" subtitle={`${sourceCount} enrichment source${sourceCount === 1 ? '' : 's'} stored`}>
            <dl className="text-sm space-y-2">
              <DT label="Profile URL">
                <a href={l.googleProfileUrl} target="_blank" rel="noopener" className="text-ink-900 dark:text-ink-100 hover:underline break-all">
                  {l.googleProfileUrl}
                </a>
              </DT>
              <DT label="Place ID"><span className="font-mono text-xs">{l.googlePlaceId ?? '—'}</span></DT>
              <DT label="Created"><span>{relTime(l.createdAt)}</span></DT>
            </dl>
          </Section>

          <Section title="Generated sites" subtitle={latestSite ? `Latest version: v${latestSite.version}` : 'No generated demo yet'}>
            {l.generatedSites.length === 0 ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">No demo generated yet.</p>
            ) : (
              <>
                <ul className="divide-y divide-ink-100 dark:divide-ink-700">
                  {l.generatedSites.map((g) => (
                    <li key={g.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm">
                          <div className="font-medium text-ink-900 dark:text-ink-100">v{g.version} · {g.siteTitle ?? 'Untitled'}</div>
                          <div className="text-ink-500 dark:text-ink-400 text-xs">{relTime(g.createdAt)}</div>
                        </div>
                        {g.vercelUrl ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <a href={g.vercelUrl} target="_blank" rel="noopener" className="text-accent-500 text-sm hover:underline">
                              Open ↗
                            </a>
                            {deletingSiteId === g.id ? (
                              <>
                                <span className="text-xs text-ink-500 dark:text-ink-400">Delete?</span>
                                <button
                                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                                  onClick={() => deleteDeployment.mutate(g.id)}
                                  disabled={deleteDeployment.isPending}
                                >
                                  Yes
                                </button>
                                <button
                                  className="text-xs text-ink-400 hover:underline"
                                  onClick={() => setDeletingSiteId(null)}
                                  disabled={deleteDeployment.isPending}
                                >
                                  No
                                </button>
                              </>
                            ) : (
                              <button
                                className="text-xs text-ink-400 dark:text-ink-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                onClick={() => setDeletingSiteId(g.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400 dark:text-ink-500">not deployed</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {!l.generatedSites[0]?.vercelUrl && (
                  <div className="mt-3">
                    <button
                      className="btn-secondary"
                      disabled={deploySite.isPending}
                      onClick={() => deploySite.mutate()}
                      data-testid="button-deploy-site"
                    >
                      {deploySite.isPending ? 'Queueing…' : 'Deploy to Vercel'}
                    </button>
                    {deploySite.isError && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{(deploySite.error as Error).message}</p>}
                  </div>
                )}
              </>
            )}
          </Section>

          <Section title="Recent jobs" subtitle={activeJobs.length ? `${activeJobs.length} active` : 'Queue is clear'}>
            {l.jobs.length === 0 ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">No jobs yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-700">
                {l.jobs.map((j) => (
                  <li key={j.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/jobs/${j.id}`} className="text-sm font-medium text-ink-900 dark:text-ink-100 hover:underline">
                        {j.jobType.replace(/_/g, ' ')}
                      </Link>
                      <StatusBadge value={j.status} kind="job" />
                    </div>
                    <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{relTime(j.createdAt)}</div>
                    {j.errorMessage ? (
                      <div className="mt-1 text-xs text-red-600 dark:text-red-400 break-words">{j.errorMessage}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="coreui-card-header">
        <div>
          {/* h2 intentional — all sections are siblings under one h1 in PageHeader */}
          <h2 className="coreui-card-title">{title}</h2>
          {subtitle ? <p className="coreui-card-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatusPanel({
  title,
  value,
  kind,
  detail,
}: {
  title: string;
  value: string;
  kind: 'lead' | 'site' | 'website';
  detail: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">{title}</div>
      <div className="mt-3">
        <StatusBadge value={value} kind={kind} />
      </div>
      <div className="mt-3 text-xs text-ink-500 dark:text-ink-400">{detail}</div>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-50 px-3 py-3 dark:border-ink-700 dark:bg-ink-900/40">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</div>
      <div className="mt-2">{value}</div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function DT({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-50/60 p-3 dark:border-ink-700 dark:bg-ink-900/30">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</dt>
      <dd className="mt-1 text-ink-800 dark:text-ink-200">{children}</dd>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sales pitch section
// ----------------------------------------------------------------------------
function SalesPitchSection({
  pitches,
  hasGeneratedSite,
  pitchNotes,
  onPitchNotesChange,
  onGenerate,
  isPending,
  error,
}: {
  pitches: SalesPitch[];
  hasGeneratedSite: boolean;
  pitchNotes: string;
  onPitchNotesChange: (v: string) => void;
  onGenerate: () => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <Section title="Sales pitches">
      {error ? (
        <div className="mb-3 card p-3 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm">{error}</div>
      ) : null}
      {!hasGeneratedSite ? (
        <div className="mb-3 text-sm text-ink-500 dark:text-ink-400">
          Generate a demo site first — the pitch references the demo URL.
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="label">Pitch angle (optional)</label>
          <textarea
            className="input"
            rows={2}
            value={pitchNotes}
            onChange={(e) => onPitchNotesChange(e.target.value)}
            placeholder="e.g. emphasise that they currently only have a Facebook page"
            data-testid="input-pitch-notes"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-primary"
            disabled={isPending || !hasGeneratedSite}
            onClick={onGenerate}
            data-testid="button-generate-pitch"
          >
            {isPending ? 'Generating…' : 'Generate sales pitch'}
          </button>
          <span className="text-xs text-ink-500 dark:text-ink-400">
            Uses OpenRouter when configured, falls back to a labelled mock otherwise. Never sends email.
          </span>
        </div>
      </div>

      {pitches.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">No pitches yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink-100 dark:divide-ink-700">
          {pitches.map((p, i) => (
            <SalesPitchItem key={p.id} pitch={p} defaultOpen={i === 0} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function SalesPitchItem({ pitch, defaultOpen = false }: { pitch: SalesPitch; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="py-3" data-testid={`pitch-${pitch.id}`}>
      <div className="flex items-start justify-between gap-3">
        <button
          className="text-left flex-1"
          onClick={() => setOpen((o) => !o)}
          data-testid={`button-toggle-pitch-${pitch.id}`}
        >
          <div className="text-sm font-medium text-ink-900 dark:text-ink-100">{pitch.subjectLine}</div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 flex items-center gap-2">
            <span>{relTime(pitch.createdAt)}</span>
            <span className="text-ink-300 dark:text-ink-600">·</span>
            <span className="font-mono">{pitch.provider}/{pitch.model}</span>
            {pitch.isMock ? (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[10px] uppercase tracking-wide">
                mock
              </span>
            ) : null}
          </div>
        </button>
      </div>
      {open ? (
        <div className="mt-3 space-y-3 text-sm">
          <PitchField label="Email draft" value={pitch.fullEmailDraft} multiline testId={`pitch-email-${pitch.id}`} />
          <PitchField label="LinkedIn message" value={pitch.linkedinMessage} multiline testId={`pitch-linkedin-${pitch.id}`} />
          <details className="text-xs">
            <summary className="cursor-pointer text-ink-500 dark:text-ink-400">Component breakdown</summary>
            <div className="mt-2 space-y-2">
              <PitchField label="Opening line" value={pitch.openingLine} testId={`pitch-opening-${pitch.id}`} />
              <PitchField label="Pain point" value={pitch.painPoint} testId={`pitch-pain-${pitch.id}`} />
              <PitchField label="Value prop" value={pitch.valueProposition} testId={`pitch-value-${pitch.id}`} />
              <PitchField label="Demo reference" value={pitch.demoReference} testId={`pitch-demo-${pitch.id}`} />
              <PitchField label="Call to action" value={pitch.callToAction} testId={`pitch-cta-${pitch.id}`} />
              {pitch.operatorNotes ? (
                <PitchField label="Operator notes" value={pitch.operatorNotes} testId={`pitch-notes-${pitch.id}`} />
              ) : null}
            </div>
          </details>
        </div>
      ) : null}
    </li>
  );
}

function PitchField({
  label,
  value,
  multiline,
  testId,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch { /* give up */ }
    }
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</div>
        <button className="text-xs text-accent-500 hover:underline" onClick={onCopy} data-testid={testId ? `${testId}-copy` : undefined}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {multiline ? (
        <pre className="mt-1 whitespace-pre-wrap font-sans text-ink-800 dark:text-ink-200 bg-ink-50 dark:bg-ink-900/50 rounded p-3 border border-ink-100 dark:border-ink-700" data-testid={testId}>{value}</pre>
      ) : (
        <div className="mt-1 text-ink-800 dark:text-ink-200" data-testid={testId}>{value}</div>
      )}
    </div>
  );
}
