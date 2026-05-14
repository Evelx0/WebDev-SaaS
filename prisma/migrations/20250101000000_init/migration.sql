-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "business_name" TEXT,
    "category" TEXT,
    "google_profile_url" TEXT NOT NULL,
    "google_place_id" TEXT,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT DEFAULT 'GB',
    "phone" TEXT,
    "email" TEXT,
    "existing_website_url" TEXT,
    "website_status" TEXT NOT NULL DEFAULT 'unknown',
    "lead_status" TEXT NOT NULL DEFAULT 'new',
    "site_status" TEXT NOT NULL DEFAULT 'not_started',
    "vercel_url" TEXT,
    "last_error" TEXT,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_url" TEXT,
    "raw_data" JSONB,
    "extracted_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_jobs" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "model_provider" TEXT,
    "model_name" TEXT,
    "input_payload" JSONB,
    "output_payload" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_sites" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "site_job_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "site_title" TEXT,
    "site_summary" TEXT,
    "source_files_path" TEXT,
    "vercel_project_id" TEXT,
    "vercel_deployment_id" TEXT,
    "vercel_url" TEXT,
    "generation_prompt" TEXT,
    "generation_metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_logs" (
    "id" UUID NOT NULL,
    "site_job_id" UUID NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "leads_google_place_id_key" ON "leads"("google_place_id");

-- CreateIndex
CREATE INDEX "idx_leads_status" ON "leads"("lead_status");

-- CreateIndex
CREATE INDEX "idx_leads_site_status" ON "leads"("site_status");

-- CreateIndex
CREATE INDEX "idx_leads_business_name" ON "leads"("business_name");

-- CreateIndex
CREATE INDEX "lead_sources_lead_id_idx" ON "lead_sources"("lead_id");

-- CreateIndex
CREATE INDEX "idx_site_jobs_lead_id" ON "site_jobs"("lead_id");

-- CreateIndex
CREATE INDEX "idx_site_jobs_status" ON "site_jobs"("status");

-- CreateIndex
CREATE INDEX "generated_sites_lead_id_idx" ON "generated_sites"("lead_id");

-- CreateIndex
CREATE INDEX "job_logs_site_job_id_idx" ON "job_logs"("site_job_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_jobs" ADD CONSTRAINT "site_jobs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_sites" ADD CONSTRAINT "generated_sites_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_sites" ADD CONSTRAINT "generated_sites_site_job_id_fkey" FOREIGN KEY ("site_job_id") REFERENCES "site_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_site_job_id_fkey" FOREIGN KEY ("site_job_id") REFERENCES "site_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

