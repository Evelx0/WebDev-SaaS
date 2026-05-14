-- CreateTable
CREATE TABLE "sales_pitches" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "generated_site_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,
    "subject_line" TEXT NOT NULL,
    "opening_line" TEXT NOT NULL,
    "pain_point" TEXT NOT NULL,
    "value_proposition" TEXT NOT NULL,
    "demo_reference" TEXT NOT NULL,
    "call_to_action" TEXT NOT NULL,
    "full_email_draft" TEXT NOT NULL,
    "linkedin_message" TEXT NOT NULL,
    "operator_notes" TEXT,
    "raw_response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pitches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_sales_pitches_lead_id" ON "sales_pitches"("lead_id");

-- CreateIndex
CREATE INDEX "idx_sales_pitches_created_at" ON "sales_pitches"("created_at");

-- AddForeignKey
ALTER TABLE "sales_pitches" ADD CONSTRAINT "sales_pitches_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_pitches" ADD CONSTRAINT "sales_pitches_generated_site_id_fkey" FOREIGN KEY ("generated_site_id") REFERENCES "generated_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
