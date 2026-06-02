# AGENTS.md

Operating context for Codex and coding agents. Read before making changes.

## What this project is

Lead Panel is becoming a SaaS-style admin app: users log in, paste a Google Business Profile URL, enrich their own lead, generate a static demo website, deploy it to Vercel, then generate a tailored sales pitch. Admin users use the platform `.env` Vercel/OpenRouter settings and are uncapped; normal users must provide Vercel settings and can optionally provide their own OpenRouter key to remove the rolling usage cap. Runs on a VPS at `panel.tomlinsn.tech`. No automated email sending exists yet.

## Two sites in one repo

| Site | Source | Served by | Domain |
|------|--------|-----------|--------|
| Public landing page | `landing/` — static HTML/CSS/JS, no build step | Nginx directly from `/var/www/tomlinsn-landing` | `tomlinsn.tech` |
| Admin panel | `client/` + `server/` | Nginx → reverse proxy → Node :3000 | `panel.tomlinsn.tech` |

Never link the landing site into the panel. No API keys, env vars, or admin URLs in `landing/`.

## Stack

Node 24, TypeScript everywhere, Express API, React + Vite, PostgreSQL + Prisma, Redis + BullMQ workers, Tailwind CSS, Zod validation, bcryptjs + JWT cookie auth.

Users have roles (`admin` or `user`), an active/disabled flag, a rolling 24-hour generation limit, encrypted per-user Vercel settings, and encrypted per-user OpenRouter keys. Non-admin users only see leads/jobs/sites tied to their own `createdByUserId`.

Entitlements:
- Admins do not need account-level Vercel settings, use the platform `.env` Vercel/OpenRouter keys, and have no 24-hour generation cap.
- Normal users must configure Vercel before demo generation or deployment.
- Normal users with their own OpenRouter key are uncapped because paid AI work uses their key.
- Normal users without their own OpenRouter key use the platform OpenRouter key and are capped by `usageLimitPer24h` over a rolling 24-hour window.

Production: PM2 + Nginx + Certbot on Ubuntu 24.04 (`scripts/deploy-ubuntu-24-pm2.sh`). Docker Compose is also supported but not the primary deployment path.

## Data flow

```
Lead URL → [pullLeadInfo worker]
              └─ Google Places / SerpAPI enrichment
              └─ W0: current website scrape when Google data includes a website
              └─ W1: business research (OpenRouter/Perplexity Sonar → free model fallback)
              └─ W2: competitor scout  (same model rotation)
              → LeadSource records (sourceType: enrichment source | 'current_website_scrape' | 'web_research' | 'competitor_scout')

User/Admin reviews lead → [refreshSiteDesign worker]
              └─ Queued AI design-direction refresh from LeadDetailPage
              └─ Uses lead + W0/W1/W2 context to prefill editable generation fields
              → LeadSource record (sourceType: 'site_design_suggestion')

User/Admin reviews lead → [generateSite worker]
              └─ AI website brief (Anthropic preferred, OpenRouter fallback)
              └─ Hero image (Pollinations.ai free API — flux → flux-realism → turbo → …)
              └─ HTML generation (OpenRouter free model rotation: Qwen3-Coder → MiMo-V2-Flash-free → Laguna-M.1 → MiMo-V2-Flash-paid)
                   Models chain: partial output from one model continues in the next
                   Model outputs index.html + gallery.html separated by ===GALLERY=== delimiter
              └─ Deterministic fallback renderer if all AI models fail (index.html only)
              → GeneratedSite record + files in generated-sites/{leadId}/{siteId}/

[deploySite worker]
              └─ Vercel static deploy
              └─ W3: PageSpeed audit (free Google API, no key) — stored in generationMetadata
              → vercelUrl saved on GeneratedSite + Lead

User/Admin → Generate pitch
              └─ Fetches W1/W2 from LeadSource, W3 from generationMetadata
              └─ W4: Enhanced pitch (OpenRouter) using all research context
              → SalesPitch record
```

## Service map — one concern per file

| Concern | File |
|---------|------|
| Lead enrichment (Google Places / SerpAPI) | `services/leadEnrichment.ts` |
| AI gateway (Anthropic + OpenRouter routing, model rotation, mock fallbacks) | `services/aiGateway.ts` |
| Free HTML model rotation (OpenRouter free tier, paid backstop) + dual-page split | `services/aiGateway.ts → generateSiteHtml()` + `services/siteGenerator.ts → writeGeneratedSite()` |
| Multi-model rotation for pitch/research/brief | `services/aiGateway.ts → aiCompleteOpenRouterRotate()` |
| Free image generation (Pollinations.ai) | `services/imageGenerator.ts` |
| Current website scrape W0 | `services/currentWebsiteScraper.ts` |
| Web research W1 + competitor scout W2 | `services/webResearch.ts` |
| Editable design suggestion refresh | `services/designSuggestion.ts` + `workers/refreshSiteDesign.ts` |
| PageSpeed audit W3 | `services/pageSpeedAudit.ts` |
| Static site file rendering | `services/siteGenerator.ts` |
| Vercel deployment | `services/vercel.ts` |
| Sales pitch generation | `services/salesPitch.ts` |
| All prompt strings | `prompts/` — never inline prompts in services |

Workers live in `workers/`. Routes live in `routes/`. Do not put provider API calls in routes or workers directly.

## Commands

```bash
npm run typecheck     # tsc -p server + tsc -p client
npm run lint          # ESLint v9 flat config
npm run build         # vite build + tsc server build
npm run dev           # local dev server
npm run dev:worker    # local worker
npm run prisma:migrate:dev   # create + apply migration in dev
npm run db:seed       # seed admin user
```

**All three of `typecheck`, `lint`, `build` must pass before any change is done.**

VPS: `pm2 restart lead-panel-app lead-panel-worker` after `.env` changes or manual deploys. No rebuild needed unless source changed.

## Environment variables

All parsed and validated in `server/src/lib/env.ts`. `flags.*` booleans gate optional integrations.

If adding a new env var: update `.env.example` → `env.ts` → `README.md`. Do not invent vars without a real integration need.

| Key | Purpose | Required? |
|-----|---------|-----------|
| `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` | Website brief generation | Optional (mock fallback) |
| `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` | HTML generation, web research, pitches | Optional (mock fallback) |
| `GOOGLE_PLACES_API_KEY` | Lead enrichment | One of these two |
| `SERPAPI_API_KEY` | Lead enrichment alternative | One of these two |
| `VERCEL_API_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_PREFIX` | Demo site deployment | Optional (mock URL) |
| `GENERATED_SITES_DIR` | Where site bundles are written | Required |

PageSpeed audit and Pollinations.ai image generation are free APIs with no keys.

## Database

Migrations in `prisma/migrations/` are immutable once applied. For schema changes: edit `schema.prisma` → `npm run prisma:migrate:dev` → commit the new migration directory.

Current migrations:
- `20250101000000_init` — base schema
- `20250503000000_add_sales_pitches` — `sales_pitches` table
- `20260508000000_saas_user_controls` — roles, active flag, per-user Vercel config, and generation limits
- `20260508001000_user_openrouter_keys` — encrypted per-user OpenRouter keys

`LeadSource.sourceType` is a plain string — new values (`'web_research'`, `'competitor_scout'`) require no migration. `GeneratedSite.generationMetadata` is `Json` — merge new keys in rather than replacing.

Known non-migration `LeadSource.sourceType` values now include:
- provider/enrichment source names from Google Places or SerpAPI
- `current_website_scrape`
- `web_research`
- `competitor_scout`
- `site_design_suggestion`

## Admin panel UI (`client/`)

The admin panel is being migrated toward a CoreUI-style dashboard. The sibling directory
`../coreui` is a downloaded CoreUI Bootstrap admin template and should be treated as a
read-only design/reference source unless the user explicitly asks to edit it.

Current implementation still uses React + Vite + Tailwind, not installed CoreUI React
components. Prefer extending the existing Tailwind/CoreUI-style utility classes in
`client/src/index.css` over adding a new UI framework dependency.

Routes and layout:
- `/dashboard` is the post-login/default admin landing page.
- `/account` lets the logged-in user manage display name, Vercel settings, and optional OpenRouter key.
- `/admin` is visible to admin users only and manages user creation, role, active state,
  and per-user 24-hour generation limits.
- `/jobs` is labelled "My Jobs" in navigation.
- `/logs` is visible to admin users only and shows active jobs, recent job stream, account readiness, and platform vs user-key OpenRouter usage.
- `client/src/components/Layout.tsx` owns the dark CoreUI-style sidebar and topbar.
- `client/src/pages/DashboardPage.tsx` owns the operator dashboard widgets.
- `client/src/pages/LeadDetailPage.tsx` should stay a dense but organised CoreUI-style
  cockpit: status summary cards at top, business/design/pitch work in the main column,
  and source/sites/jobs in the right rail.

UI expectations:
- Keep admin screens utilitarian, scan-friendly, and operator-focused.
- Use cards with `coreui-card-header`, compact widgets, tables, status badges, and grouped
  forms rather than landing-page or marketing layouts.
- Do not add an "Add lead" action to the global topbar; creation belongs on the dashboard
  and leads pages.
- Long-running AI actions from the UI must queue jobs and surface logs through the My Jobs UI.
  Do not call slow model endpoints synchronously from React buttons.
- Demo generation must be blocked unless the owning user is an admin or has Vercel settings configured.
- Enforce usage limits server-side before queuing generation or retrying generation jobs; admins and normal users with their own OpenRouter key are exempt. UI disabling is helpful but not sufficient.

## Generated demo sites (`generated-sites/`)

AI-generated sites output **two HTML files** per generation:
- `index.html` — the one-page landing site (CSS + JS embedded)
- `gallery.html` — standalone work gallery linked from index.html nav and footer

The model separates them with `===GALLERY===` on its own line. `writeGeneratedSite()` in
`siteGenerator.ts` splits on that delimiter. If the model truncates and omits the delimiter,
a minimal fallback `gallery.html` is written automatically. Both files are deployed to Vercel
via `readDirectoryAsInlineFiles()` (which reads the whole output directory).

`HtmlGenerationInput` has a `stylePreference?: string` field — if set, it is appended to the
user prompt as "Operator style note: …".

The deterministic fallback renderer (no AI key) produces `index.html` only — no gallery.

## Landing page (`landing/`)

Static HTML/CSS/JS, no build step. Served by Nginx from `/var/www/tomlinsn-landing`. To deploy: `rsync` or `scp` the three files + images; no PM2 restart needed.

**Design system — "Tidal Slate":**
- Always-dark palette: `--bg: #0c1420`, `--accent: #35d9ab` (teal), `--stone: #c8a050` (gold), `--ink: #e6e0d3`
- Font: Figtree variable (Google Fonts, `wght@300..900`) — the **only** third-party request on the page
- `hero-bg.png` as hero background (preloaded above the fold); overlay via `::before` pseudo-element
- `hero-footer.png` as background for `.section-cta` (the "Tell me about your business" section)
- `.status-dot` uses `pulse-status` keyframe (sonar-ping, teal colour)
- `.cta-fineprint` coloured `var(--accent)` for visibility
- SVG fractal noise grain texture via `body::after` at 3.2% opacity
- JS-driven `.reveal` / `.is-visible` scroll animations (IntersectionObserver; skipped if `prefers-reduced-motion`)
- Nav scroll state: `.scrolled` class toggled at `scrollY > 16`

## Coding invariants

- **Never overwrite manual lead edits** during enrichment. Null/empty fields get filled; set fields are left alone.
- **Workers must be idempotent.** Retry must be safe without re-running AI generation if output already exists.
- **All worker research steps (W1–W3) are best-effort.** Wrap in try/catch, log failures, never throw — they must not fail the parent job.
- **Mock fallbacks must be clearly labelled** so accidental production use is obvious.
- **No secrets in the React frontend.** All provider calls are server-side only.
- **Validate model output with Zod** before using it. `extractJson()` in `aiGateway.ts` handles fenced/unfenced JSON.
- **Email sending does not exist yet.** Do not add it without suppression list, unsubscribe handling, and explicit product decision.

## Verification

```bash
npm run typecheck && npm run lint && npm run build
```

For deploy script changes: `bash -n scripts/deploy-ubuntu-24-pm2.sh`. Docker is not installed on the local dev machine — state this if Docker verification is needed.
