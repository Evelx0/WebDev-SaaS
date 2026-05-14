# syntax=docker/dockerfile:1.6
# Multi-stage build for lead-panel.
# Produces a single image used for both the web server and the worker process.

# ---- deps stage: install all dependencies (incl. dev) and generate Prisma client
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund
RUN npx prisma generate

# ---- builder stage: compile client and server
FROM deps AS builder
COPY tsconfig.base.json ./
COPY vite.config.ts postcss.config.js tailwind.config.js ./
COPY client ./client
COPY server ./server
RUN npm run build

# ---- runtime stage: lean production image
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init && rm -rf /var/lib/apt/lists/*

# Production dependencies only
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --omit=dev --no-audit --no-fund && npx prisma generate

# Compiled output
COPY --from=builder /app/dist ./dist

# Generated sites volume target
RUN mkdir -p /app/generated-sites

EXPOSE 3000

# Lightweight in-container healthcheck. Hits the /api/health endpoint exposed
# by server/src/index.ts. Worker containers override CMD and so will return
# unhealthy from this check — set `healthcheck: disable: true` on the worker
# service in compose if that becomes noisy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/index.js"]
