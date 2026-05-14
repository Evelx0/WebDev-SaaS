# WebDev SaaS - Design &  Deploy Websites for Leads Automatically
Design &  Deploy Websites for Leads Automatically using LLM models.

WebDev SaaS is a TypeScript SaaS-style admin app for agencies, operators, and internal sales teams. It turns a Google Business Profile or Maps URL into an enriched lead record, optional research context, an AI-generated static demo website, a Vercel deployment, and a tailored outreach pitch.

## What It Does

- Authenticated admin panel built with React, Vite, Express, Prisma, PostgreSQL, Redis, and BullMQ
- Lead enrichment from Google Places or SerpAPI
- AI-assisted website brief generation, research, design suggestions, and sales pitches
- Static demo-site generation into HTML files under `generated-sites/`
- Optional Vercel deployment for generated demo sites
- Account-level controls for admins and normal users, including per-user Vercel/OpenRouter settings

## Repo Structure

```text
lead-panel-repo/
├── client/                  React + Vite admin app
├── server/                  Express API, workers, services, prompts
├── prisma/                  Prisma schema, migrations, seed script
├── landing/                 Generic static landing-page starter
├── scripts/
│   └── deploy-ubuntu-24-pm2.sh
├── ubuntu.sh                Root wrapper for the Ubuntu deployment script
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

## Requirements

- Node.js 24 recommended
- npm 10+
- PostgreSQL 16+
- Redis 7+

For local development, Docker is optional but convenient for Postgres and Redis.

## 1. Manual Local Setup

### Clone and install

```bash
git clone <your-public-repo-url> lead-panel-repo
cd lead-panel-repo
npm install
```

### Create your environment file

```bash
cp .env.example .env
```

Minimum values to change before first run:

- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `POSTGRES_PASSWORD` if you use the bundled Compose database
- `DATABASE_URL`
- `REDIS_URL`

Optional integrations:

- `ANTHROPIC_API_KEY`
- `OPENROUTER_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `SERPAPI_API_KEY`
- `VERCEL_API_TOKEN`
- `VERCEL_TEAM_ID`

If AI or provider keys are missing, the app uses clearly-labelled mock or fallback behavior where supported.

### Start Postgres and Redis

If you already have Postgres and Redis running locally, point `.env` at them and skip this step.

Using Docker Compose for dependencies only:

```bash
docker compose up -d postgres redis
```

### Apply the database and seed the first admin

```bash
npm run prisma:generate
npm run prisma:migrate:dev
npm run db:seed
```

### Start the app and worker

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run dev:worker
```

Then open:

- App UI: `http://localhost:5173`
- API health: `http://localhost:3000/api/health`

## 2. Production Setup Manually on Ubuntu 24.04

This project is designed to run with:

- Nginx in front
- PM2 for the Node processes
- PostgreSQL for data
- Redis for queues
- Certbot for TLS

High-level manual flow:

1. Install Node.js 24, PostgreSQL, Redis, Nginx, and Certbot.
2. Copy the repo onto the server.
3. Create `.env` from `.env.example` with production values.
4. Run `npm ci`.
5. Run `npm run prisma:generate`.
6. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
7. Run `npm run prisma:migrate`.
8. Run `npm run db:seed`.
9. Start the app with `pm2 start npm --name lead-panel-app -- run start`.
10. Start the worker with `pm2 start npm --name lead-panel-worker -- run worker`.
11. Configure Nginx to reverse proxy the panel subdomain to `127.0.0.1:3000`.
12. Configure the root domain to serve the static `landing/` files if you want to use the included landing page.

## 3. Automated Ubuntu Setup Script

The repo includes a guided Ubuntu deployment script plus a root-level wrapper:

```bash
chmod +x ubuntu.sh
sudo ./ubuntu.sh
```

`ubuntu.sh` changes into the repo root and then runs:

```bash
scripts/deploy-ubuntu-24-pm2.sh
```

That script:

- installs system packages
- installs Node.js via NodeSource
- installs PM2
- configures PostgreSQL and Redis
- writes the production `.env`
- runs `npm ci`
- runs `npm run typecheck`
- runs `npm run lint`
- runs `npm run build`
- runs Prisma generation, migration, and seeding
- configures Nginx for a public root domain and a panel subdomain
- optionally provisions Let's Encrypt certificates

### Script defaults

- App directory: `/opt/lead-panel`
- Public root domain: `example.com`
- Panel domain: `panel.example.com`
- Landing web root: `/var/www/lead-panel-landing`
- Generated sites directory: `/var/lib/lead-panel/generated-sites`

### Typical production DNS

```text
example.com          A   <your-server-ip>
www.example.com      A   <your-server-ip>
panel.example.com    A   <your-server-ip>
```

## 4. Docker Option

The repo also ships with `Dockerfile` and `docker-compose.yml`.

Typical flow:

```bash
cp .env.example .env
docker compose up -d --build
```

Then verify:

```bash
curl -i http://localhost:3000/api/health
docker compose ps
docker compose logs -f app worker
```

## 5. Validation Commands

Run these before publishing changes or deploying:

```bash
npm run typecheck
npm run lint
npm run build
```

For the Ubuntu deployment script syntax check:

```bash
bash -n scripts/deploy-ubuntu-24-pm2.sh
bash -n ubuntu.sh
```

## 6. Environment Variables

See [.env.example](./.env.example) for the full list. Important ones:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis queue connection |
| `SESSION_SECRET` | Yes | Signs auth cookies |
| `ADMIN_EMAIL` | First boot | Seeded first admin account |
| `ADMIN_PASSWORD` | First boot | Seeded first admin password |
| `APP_BASE_URL` | Production | Public panel URL |
| `ANTHROPIC_API_KEY` | Optional | AI brief generation |
| `OPENROUTER_API_KEY` | Optional | HTML generation, research, pitches |
| `GOOGLE_PLACES_API_KEY` | Optional | Lead enrichment |
| `SERPAPI_API_KEY` | Optional | Alternative lead enrichment |
| `VERCEL_API_TOKEN` | Optional | Demo-site deployment |
| `GENERATED_SITES_DIR` | Yes | Output directory for generated sites |

## 7. Open-Source Notes

- The included `landing/` site is intentionally generic starter content. Replace the copy, contact details, and domain values before using it in production.
- `.env.example` is safe to commit. Real `.env` files are ignored.
- The repo includes an MIT license as a sensible default for public release.

## 8. First Run Checklist

1. Copy `.env.example` to `.env`.
2. Set strong auth and database secrets.
3. Install dependencies with `npm install` or `npm ci`.
4. Start Postgres and Redis.
5. Run Prisma generate, migrate, and seed.
6. Start the app and worker.
7. Verify `/api/health`.
8. Log in with the seeded admin account.
9. Add a lead, enrich it, generate a site, and test deployment.

## License

[MIT](./LICENSE)
