ALTER TABLE "users"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "usage_limit_per_24h" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "vercel_api_token_enc" TEXT,
  ADD COLUMN "vercel_team_id" TEXT,
  ADD COLUMN "vercel_project_prefix" TEXT;

UPDATE "users" SET "role" = 'admin';

CREATE INDEX "users_role_idx" ON "users"("role");
