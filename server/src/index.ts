import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { attachSession, requireAdmin, requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { leadsRouter } from './routes/leads.js';
import { jobsRouter } from './routes/jobs.js';
import { generatedSitesRouter } from './routes/generatedSites.js';
import { adminRouter } from './routes/admin.js';
import { accountRouter } from './routes/account.js';
import { emailsRouter } from './routes/emails.js';
import { ensureAdminUser } from './bootstrap.js';
import { prisma } from './lib/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const appOrigin = new URL(env.APP_BASE_URL).origin;

function isAllowedMutationOrigin(value: string) {
  if (value === appOrigin) return true;
  if (env.NODE_ENV !== 'production') {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(value);
  }
  return false;
}

app.use(helmet());
app.use((_req, res, next) => {
  res.locals.requestId = crypto.randomUUID();
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: env.NODE_ENV === 'production' ? env.APP_BASE_URL : true,
    credentials: true,
  }),
);
app.use(
  morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }),
);

app.use(attachSession);

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const origin = req.get('origin');
  if (origin) {
    if (!isAllowedMutationOrigin(origin)) {
      res.status(403).json({ error: 'invalid_origin' });
      return;
    }
    next();
    return;
  }

  const referer = req.get('referer');
  if (referer) {
    try {
      if (!isAllowedMutationOrigin(new URL(referer).origin)) {
        res.status(403).json({ error: 'invalid_origin' });
        return;
      }
      next();
      return;
    } catch {
      res.status(403).json({ error: 'invalid_origin' });
      return;
    }
  }

  res.status(403).json({ error: 'origin_required' });
});

// Public health
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'ok', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

// Auth (login/logout public, /me protected via requireAuth inside)
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.post('/api/auth/login', loginLimiter);
app.use('/api/auth', authRouter);

// Everything else under /api requires auth.
app.use('/api/leads', requireAuth, leadsRouter);
app.use('/api/jobs', requireAuth, jobsRouter);
app.use('/api/generated-sites', requireAuth, generatedSitesRouter);
app.use('/api/account', requireAuth, accountRouter);
app.use('/api/emails', requireAuth, emailsRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);

// Static client. In production we run from dist/server/index.js, and the
// compiled client lives at dist/client. In dev (tsx) the client is served by
// Vite via the proxy, and the dist/client folder may not exist yet — in that
// case we skip static serving entirely.
const here = __dirname;
const clientDir = here.includes(`${path.sep}dist${path.sep}server`)
  ? path.resolve(here, '..', 'client')
  : path.resolve(here, '..', '..', 'dist', 'client');
if (existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get(/^\/(?!api\/).*/, (_req, res, next) => {
    res.sendFile(path.join(clientDir, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

app.use(notFound);
app.use(errorHandler);

async function main() {
  await ensureAdminUser();
  app.listen(env.PORT, () => {
    logger.info(`lead-panel server listening on :${env.PORT}`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
