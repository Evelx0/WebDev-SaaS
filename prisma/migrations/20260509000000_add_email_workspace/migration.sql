ALTER TABLE "users"
  ADD COLUMN "smtp_host" TEXT,
  ADD COLUMN "smtp_port" INTEGER,
  ADD COLUMN "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "smtp_username" TEXT,
  ADD COLUMN "smtp_password_enc" TEXT,
  ADD COLUMN "smtp_from_name" TEXT,
  ADD COLUMN "smtp_from_email" TEXT,
  ADD COLUMN "imap_host" TEXT,
  ADD COLUMN "imap_port" INTEGER,
  ADD COLUMN "imap_secure" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "imap_username" TEXT,
  ADD COLUMN "imap_password_enc" TEXT,
  ADD COLUMN "email_last_synced_at" TIMESTAMPTZ(6);

CREATE TABLE "email_threads" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "lead_id" UUID,
  "subject" TEXT NOT NULL,
  "normalized_subject" TEXT NOT NULL,
  "participant_email" TEXT NOT NULL,
  "participant_name" TEXT,
  "last_message_at" TIMESTAMPTZ(6) NOT NULL,
  "last_message_preview" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_messages" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "lead_id" UUID,
  "sync_key" TEXT NOT NULL,
  "folder" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "delivery_status" TEXT NOT NULL DEFAULT 'received',
  "external_message_id" TEXT,
  "message_id_header" TEXT,
  "in_reply_to_header" TEXT,
  "reference_headers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "from_email" TEXT NOT NULL,
  "from_name" TEXT,
  "to_emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cc_emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "bcc_emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "subject" TEXT NOT NULL,
  "snippet" TEXT,
  "text_body" TEXT,
  "html_body" TEXT,
  "error_message" TEXT,
  "sent_at" TIMESTAMPTZ(6),
  "received_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_threads_user_participant_subject_key"
  ON "email_threads"("user_id", "participant_email", "normalized_subject");

CREATE INDEX "idx_email_threads_user_last_message"
  ON "email_threads"("user_id", "last_message_at");

CREATE INDEX "idx_email_threads_lead_id"
  ON "email_threads"("lead_id");

CREATE UNIQUE INDEX "email_messages_user_sync_key"
  ON "email_messages"("user_id", "sync_key");

CREATE INDEX "idx_email_messages_thread_created_at"
  ON "email_messages"("thread_id", "created_at");

CREATE INDEX "idx_email_messages_lead_id"
  ON "email_messages"("lead_id");

CREATE INDEX "idx_email_messages_user_folder_created_at"
  ON "email_messages"("user_id", "folder", "created_at");

ALTER TABLE "email_threads"
  ADD CONSTRAINT "email_threads_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_threads"
  ADD CONSTRAINT "email_threads_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_messages"
  ADD CONSTRAINT "email_messages_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_messages"
  ADD CONSTRAINT "email_messages_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_messages"
  ADD CONSTRAINT "email_messages_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
