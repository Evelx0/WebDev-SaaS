# Deployment Checklist

Use this checklist when deploying Lead Panel to a VPS.

## Two sites, one VPS

This project deploys **two sites** from the same box, on different domains:

| Role | Domain (default) | What it serves |
|---|---|---|
| Public landing | `tomlinsn.tech` (and optionally `www.tomlinsn.tech`) | Static one-page portfolio from `landing/` |
| Private admin panel | `panel.tomlinsn.tech` | React admin UI + Express API/worker on `127.0.0.1:3000` |

- The two domains are configured separately in Nginx.
- `APP_BASE_URL` always points at the **panel subdomain**, never the root domain.
- The landing site contains no API keys, admin links, analytics, or cookies.

## Before you start

- [ ] You have an Ubuntu 24.04 VPS.
- [ ] You have SSH access to the VPS.
- [ ] You have copied or cloned this project onto the VPS.
- [ ] DNS A (or AAAA) records exist for **both** the root domain and the panel subdomain, pointing at the VPS:
  - [ ] `tomlinsn.tech` → VPS
  - [ ] `www.tomlinsn.tech` → VPS (optional, recommended if serving www alias)
  - [ ] `panel.tomlinsn.tech` → VPS
- [ ] You understand the **panel subdomain** is a private admin app and must not be left exposed without HTTPS and strong credentials. The root domain is public and intentional.

## Required secrets and accounts

- [ ] Create or choose a strong `ADMIN_EMAIL`.
- [ ] Create a strong `ADMIN_PASSWORD`.
- [ ] Generate a long random `SESSION_SECRET`.
- [ ] Set a strong `POSTGRES_PASSWORD` (substituted into `docker-compose.yml`; defaults to `change_me` if you forget).
- [ ] Get a Vercel API token and set `VERCEL_API_TOKEN`.
- [ ] Optional: set `VERCEL_TEAM_ID` if deploying under a Vercel team.
- [ ] Add `ANTHROPIC_API_KEY` for production-quality website brief generation.
- [ ] Add `OPENROUTER_API_KEY` — **required for non-mock sales-pitch generation.** Without it the pitch service falls back to a clearly labelled mock pitch and persists `is_mock=true` rows.
- [ ] Add either `GOOGLE_PLACES_API_KEY` or `SERPAPI_API_KEY` for lead enrichment.

If provider keys are missing, the app may use clearly labelled mock fallbacks for local development. Do not rely on mock fallbacks for production sales workflows.

## PM2/Nginx one-command deployment path

Use this path if you want the app installed directly on the VPS with PostgreSQL,
Redis, PM2, Nginx, and Certbot rather than Docker.

From the uploaded/extracted project root:

```bash
chmod +x scripts/deploy-ubuntu-24-pm2.sh
sudo ./scripts/deploy-ubuntu-24-pm2.sh
```

The script asks for the app directory, **public root domain** (default `tomlinsn.tech`), whether to also serve `www.<root>` for the landing site, the **panel subdomain** (default `panel.tomlinsn.tech`), landing web root, Let's Encrypt email, Node.js major version, database password, session secret, admin credentials, provider API keys, Vercel details, and generated-sites directory.

- [ ] DNS for **both** the root domain and the panel subdomain already points at the VPS before running Certbot.
- [ ] Script installs Node.js, PostgreSQL, Redis, Nginx, Certbot, and PM2.
- [ ] Script syncs `landing/` to the landing web root (default `/var/www/tomlinsn-landing`).
- [ ] Script writes `.env` with `APP_BASE_URL=https://<panel-subdomain>`.
- [ ] Script runs `npm ci`, typecheck, lint, build, Prisma generation, migrations, and seed.
- [ ] Script starts `lead-panel-app` and `lead-panel-worker` in PM2.
- [ ] Script configures **two Nginx server blocks** — root-domain landing site and panel-subdomain reverse proxy — and optionally provisions a single HTTPS certificate covering both (and `www` if selected).
- [ ] After completion, verify the **landing site** by loading `https://tomlinsn.tech` in a browser.
- [ ] After completion, verify the **panel** with `pm2 status` and `curl -i http://127.0.0.1:3000/api/health`.
- [ ] Confirm the landing page contains no admin links, no API keys, and no references to the panel subdomain.

## Docker VPS preparation

- [ ] Update server packages.
- [ ] Install Docker.
- [ ] Install Docker Compose plugin.
- [ ] Configure firewall rules.
- [ ] Allow SSH.
- [ ] Allow HTTP/HTTPS if using a reverse proxy.
- [ ] Do not expose Postgres or Redis ports publicly.

Example firewall intent:

```bash
# Keep these conceptual unless they match your VPS firewall tool.
# Allow: 22, 80, 443
# Block public access to: 5432, 6379
```

## Environment setup

From the project root:

```bash
cp .env.example .env
```

Then edit `.env`.

- [ ] Set `NODE_ENV=production`.
- [ ] Set `APP_BASE_URL` to the **panel subdomain** URL, for example `https://panel.tomlinsn.tech`. Never set it to the root domain — the root domain is the public landing site, not the admin app.
- [ ] Set `SESSION_SECRET`.
- [ ] Set `ADMIN_EMAIL`.
- [ ] Set `ADMIN_PASSWORD`.
- [ ] Set `DATABASE_URL` to match the Docker Compose Postgres service, unless using external Postgres.
- [ ] Set `REDIS_URL` to match the Docker Compose Redis service, unless using external Redis.
- [ ] Set provider API keys.
- [ ] Confirm no placeholder secrets remain.

## Pre-deploy verification (run from project root)

Before building the Docker image, confirm the source tree is clean:

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

- [ ] `npm run typecheck` passes for both server and client.
- [ ] `npm run lint` passes clean (uses ESLint v9 flat config in `eslint.config.js`).
- [ ] `npm run build` produces `dist/` with both client and server output.

> **Sandbox note:** `docker compose up -d --build` cannot be runtime-tested
> in the build sandbox the codebase was last hardened in. Static review of
> `Dockerfile` and `docker-compose.yml` was performed there. Running the
> compose command on a real VPS is required to verify Docker behaviour.

## Build and start

From the project root:

```bash
docker compose up -d --build
```

Then check containers:

```bash
docker compose ps
```

- [ ] `postgres` is healthy.
- [ ] `redis` is running.
- [ ] `app` is running.
- [ ] `worker` is running.

Check logs:

```bash
docker compose logs -f app worker
```

- [ ] Prisma migrations ran successfully.
- [ ] The initial admin user was seeded or already exists.
- [ ] No repeated worker crashes.
- [ ] No missing required environment variable errors.

## Health check

Run:

```bash
curl -i http://localhost:3000/api/health
```

- [ ] API returns a successful response.
- [ ] No errors appear in `app` logs.

## Reverse proxy and TLS

Use Caddy or Nginx in front of the app. The PM2 deploy script (`scripts/deploy-ubuntu-24-pm2.sh`) configures Nginx for **both** sites automatically; this section is for hand-rolled setups.

Example Caddyfile (panel subdomain reverse-proxies to the Node app; root domain serves the static `landing/` files):

```caddyfile
tomlinsn.tech, www.tomlinsn.tech {
  root * /var/www/tomlinsn-landing
  file_server
  encode gzip zstd
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
  }
}

panel.tomlinsn.tech {
  reverse_proxy localhost:3000
}
```

- [ ] DNS for both root and panel domains points to the VPS.
- [ ] Reverse proxy on the panel subdomain forwards to `localhost:3000`.
- [ ] Static file server on the root domain serves the `landing/` files.
- [ ] HTTPS certificates are active for both domains (and `www` alias if used).
- [ ] `APP_BASE_URL` exactly matches the **panel subdomain** HTTPS URL.
- [ ] Login cookies work over HTTPS on the panel subdomain.
- [ ] The root domain returns the landing page, not the admin login screen.

## Landing-site verification

- [ ] Visit `https://tomlinsn.tech` and confirm the landing page loads.
- [ ] Visit `https://www.tomlinsn.tech` (if enabled) and confirm it serves the landing page (not a redirect loop).
- [ ] View page source and confirm no API keys, no admin URLs, no panel subdomain links, and no third-party trackers.
- [ ] Confirm the page is responsive on mobile (320–480px wide).
- [ ] Confirm the `mailto:` contact link uses the address you intend to receive enquiries on.
- [ ] Re-publishing landing-only changes after editing `landing/`:
  ```bash
  rsync -a --delete --exclude README.md /opt/lead-panel/landing/ /var/www/tomlinsn-landing/
  systemctl reload nginx
  ```

## First login (panel subdomain)

- [ ] Visit the **panel subdomain** URL (e.g. `https://panel.tomlinsn.tech`).
- [ ] Log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- [ ] Confirm the dashboard loads.
- [ ] Confirm the Jobs page loads.
- [ ] Confirm no browser console errors appear.

## First lead smoke test

- [ ] Add a lead using a Google Business Profile or Google Maps URL.
- [ ] Open the lead detail page.
- [ ] Click “Pull Info”.
- [ ] Confirm a job is created.
- [ ] Confirm job logs update.
- [ ] Confirm lead fields populate or a useful error is shown.
- [ ] Review and edit the lead.
- [ ] Mark the lead ready for site generation if that UI state is required.
- [ ] Click “Generate & Deploy”.
- [ ] Confirm a generated site record is created.
- [ ] Confirm a Vercel URL is saved on the lead.
- [ ] Open the Vercel URL and inspect the demo site.

## Sales-pitch smoke test

- [ ] On the lead detail page, scroll to the “Sales pitches” section.
- [ ] Optionally add a pitch angle into the textarea.
- [ ] Click “Generate sales pitch”.
- [ ] Confirm a new pitch appears at the top of the list.
- [ ] Confirm the provider/model line shows `openrouter/...` (not `mock/...`) when `OPENROUTER_API_KEY` is set.
- [ ] Expand the pitch and confirm the email draft and LinkedIn message are non-empty plain text — no markdown, no asterisks.
- [ ] Click “Copy” on the email draft and paste into a scratch buffer to confirm the clipboard wiring works.
- [ ] Confirm `GET /api/leads/:leadId/sales-pitches` (via curl with your session cookie) returns the same pitch.
- [ ] Confirm **no email was sent** (sending is intentionally not implemented).

## Vercel verification

- [ ] Confirm deployments appear in your Vercel dashboard.
- [ ] Confirm generated demo sites do not contain API keys.
- [ ] Confirm demo URLs are public and accessible.
- [ ] Confirm failed deployments show useful errors in job logs.

## Backups and operations

- [ ] Configure Postgres volume backups.
- [ ] Back up `.env` securely outside the repo.
- [ ] Decide retention policy for `generated-sites`.
- [ ] Monitor disk usage.
- [ ] Monitor Docker logs.
- [ ] Set up a basic uptime monitor for `/api/health`.
- [ ] Keep API keys rotated according to provider best practice.

## Security hardening

- [ ] Use a strong admin password.
- [ ] Do not share the panel URL publicly.
- [ ] Use HTTPS only in production.
- [ ] Keep `APP_BASE_URL` set to HTTPS.
- [ ] Keep Postgres and Redis private.
- [ ] Do not commit `.env`.
- [ ] Rotate credentials if the VPS or archive is shared.
- [ ] Consider adding endpoint rate limiting before public exposure.
- [ ] Consider IP allowlisting or VPN access for the admin panel.

## Pre-outreach warning

The MVP does not send emails. Before adding outreach automation:

- [ ] Add suppression list support.
- [ ] Add unsubscribe or opt-out handling.
- [ ] Add outreach history.
- [ ] Add manual approval before sending.
- [ ] Add rate limits.
- [ ] Review UK PECR and UK GDPR obligations.
- [ ] Avoid misleading recipients about the demo site.

## Common troubleshooting

### App cannot connect to Postgres

- [ ] Check `DATABASE_URL`.
- [ ] Check `docker compose ps`.
- [ ] Check `postgres` health status.
- [ ] Check `docker compose logs postgres`.

### Worker is not processing jobs

- [ ] Check `REDIS_URL`.
- [ ] Check `docker compose logs worker`.
- [ ] Confirm Redis is running.
- [ ] Confirm jobs are being inserted in the Jobs page.

### Login fails

- [ ] Check `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- [ ] Check whether the admin user was seeded on first boot.
- [ ] Check `SESSION_SECRET`.
- [ ] Confirm `APP_BASE_URL` matches the public URL.
- [ ] Confirm HTTPS is configured if `NODE_ENV=production`.

### Vercel deploy fails

- [ ] Check `VERCEL_API_TOKEN`.
- [ ] Check `VERCEL_TEAM_ID` if using a team.
- [ ] Check job logs for provider response details.
- [ ] Confirm generated files exist in the generated site record.

### Lead enrichment fails

- [ ] Check `GOOGLE_PLACES_API_KEY` or `SERPAPI_API_KEY`.
- [ ] Try a clearer Google Maps URL or business name.
- [ ] Inspect `lead_sources` and job logs.
- [ ] Remember that direct Place ID extraction from Maps URLs is best effort.
