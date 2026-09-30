-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('contributor', 'admin');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'disabled');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('phone', 'line', 'facebook', 'email', 'other');

-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('sentence', 'page');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('available', 'assigned', 'submitted', 'needs_edit', 'approved', 'denied', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'submitted', 'needs_edit', 'expired', 'skipped', 'released', 'completed');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('uploaded', 'validated', 'committing', 'committed', 'failed');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('unpaid', 'scheduled', 'paid');

-- CreateEnum
CREATE TYPE "PayoutPeriodStatus" AS ENUM ('preparing', 'ready', 'closed');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('scheduled', 'overdue', 'paid');

-- CreateEnum
CREATE TYPE "ReviewDecisionType" AS ENUM ('approve', 'deny', 'needs_edit');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('queued', 'running', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "DatasetSplit" AS ENUM ('train', 'dev', 'test', 'na');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_subject" TEXT NOT NULL,
    "pseudonym" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'contributor',
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMPTZ(6),
    "password_hash" TEXT,
    "email_verify_token_hash" TEXT,
    "email_verify_expires_at" TIMESTAMPTZ(6),
    "password_reset_token_hash" TEXT,
    "password_reset_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "contact_method" "ContactMethod" NOT NULL DEFAULT 'email',
    "contact_value" TEXT NOT NULL DEFAULT '',
    "leaderboard_opt_in" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "terms_versions" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_versions" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guide_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "CategoryStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "task_type" "TaskType" NOT NULL,
    "sheet_name" TEXT,
    "column_mapping" JSONB,
    "provenance" TEXT NOT NULL,
    "permission_ref" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'uploaded',
    "error_summary" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL DEFAULT '',
    "source_text" TEXT NOT NULL DEFAULT '',
    "context" TEXT,
    "document_key" TEXT,
    "topic" TEXT,
    "source_reference" TEXT,
    "validation_status" TEXT NOT NULL,
    "messages" JSONB NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_documents" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "external_key" TEXT NOT NULL,
    "title" TEXT,
    "provenance" TEXT NOT NULL,
    "permission_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "batch_id" UUID,
    "document_id" UUID,
    "external_id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "english_text" TEXT NOT NULL,
    "context" TEXT,
    "topic" TEXT,
    "word_count" INTEGER NOT NULL,
    "source_hash" TEXT NOT NULL,
    "provenance_override" TEXT,
    "permission_override" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'available',
    "replaces_task_id" UUID,
    "excluded_from_dataset" BOOLEAN NOT NULL DEFAULT false,
    "exclusion_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_rules" (
    "id" UUID NOT NULL,
    "task_type" "TaskType" NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "rate_rule_id" UUID NOT NULL,
    "rate_satang" INTEGER NOT NULL,
    "guide_version_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "shan_text" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "saved_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_revisions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "shan_text" TEXT NOT NULL,
    "shan_text_normalized" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "decision" "ReviewDecisionType" NOT NULL,
    "reason" TEXT,
    "disposition" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earning_entries" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "approval_date" TIMESTAMPTZ(6) NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'unpaid',

    CONSTRAINT "earning_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earning_adjustments" (
    "id" UUID NOT NULL,
    "earning_entry_id" UUID NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "admin_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earning_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_periods" (
    "id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "cutoff_at" TIMESTAMPTZ(6) NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "PayoutPeriodStatus" NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'scheduled',
    "payment_method" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_items" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "earning_entry_id" UUID NOT NULL,
    "released_at" TIMESTAMPTZ(6),

    CONSTRAINT "payout_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "admin_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "receipt_asset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolved_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_releases" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "split" BOOLEAN NOT NULL DEFAULT true,
    "status" "DatasetStatus" NOT NULL DEFAULT 'queued',
    "metadata" JSONB,
    "file_asset_id" UUID,
    "error" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dataset_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_items" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "split" "DatasetSplit" NOT NULL,
    "cluster_key" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "dataset_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "route" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_jobs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "run_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_subject_key" ON "users"("auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_pseudonym_key" ON "users"("pseudonym");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "terms_versions_version_key" ON "terms_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "terms_acceptances_user_id_version_id_key" ON "terms_acceptances"("user_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "guide_versions_version_key" ON "guide_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_object_key_key" ON "file_assets"("object_key");

-- CreateIndex
CREATE INDEX "import_rows_batch_id_external_id_idx" ON "import_rows"("batch_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key" ON "import_rows"("batch_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "source_documents_category_id_external_key_key" ON "source_documents"("category_id", "external_key");

-- CreateIndex
CREATE INDEX "tasks_status_type_idx" ON "tasks"("status", "type");

-- CreateIndex
CREATE INDEX "tasks_source_hash_idx" ON "tasks"("source_hash");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_category_id_external_id_key" ON "tasks"("category_id", "external_id");

-- CreateIndex
CREATE INDEX "rate_rules_task_type_effective_at_idx" ON "rate_rules"("task_type", "effective_at");

-- CreateIndex
CREATE INDEX "assignments_contributor_id_status_idx" ON "assignments"("contributor_id", "status");

-- CreateIndex
CREATE INDEX "assignments_expires_at_idx" ON "assignments"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "drafts_assignment_id_key" ON "drafts"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "translation_revisions_assignment_id_revision_number_key" ON "translation_revisions"("assignment_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "review_decisions_revision_id_key" ON "review_decisions"("revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "earning_entries_task_id_key" ON "earning_entries"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "earning_entries_revision_id_key" ON "earning_entries"("revision_id");

-- CreateIndex
CREATE INDEX "earning_entries_contributor_id_status_approval_date_idx" ON "earning_entries"("contributor_id", "status", "approval_date");

-- CreateIndex
CREATE UNIQUE INDEX "payout_periods_cutoff_at_key" ON "payout_periods"("cutoff_at");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_contributor_id_period_id_key" ON "payouts"("contributor_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_items_payout_id_earning_entry_id_key" ON "payout_items"("payout_id", "earning_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_payout_id_key" ON "payment_records"("payout_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_items_release_id_task_id_key" ON "dataset_items"("release_id", "task_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actor_id_route_key_key" ON "idempotency_records"("actor_id", "route", "key");

-- CreateIndex
CREATE INDEX "outbox_jobs_status_run_at_idx" ON "outbox_jobs"("status", "run_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_versions" ADD CONSTRAINT "terms_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "terms_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_versions" ADD CONSTRAINT "guide_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_replaces_task_id_fkey" FOREIGN KEY ("replaces_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_rate_rule_id_fkey" FOREIGN KEY ("rate_rule_id") REFERENCES "rate_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_guide_version_id_fkey" FOREIGN KEY ("guide_version_id") REFERENCES "guide_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_revisions" ADD CONSTRAINT "translation_revisions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "translation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "translation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_adjustments" ADD CONSTRAINT "earning_adjustments_earning_entry_id_fkey" FOREIGN KEY ("earning_entry_id") REFERENCES "earning_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_adjustments" ADD CONSTRAINT "earning_adjustments_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payout_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_earning_entry_id_fkey" FOREIGN KEY ("earning_entry_id") REFERENCES "earning_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_receipt_asset_id_fkey" FOREIGN KEY ("receipt_asset_id") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_releases" ADD CONSTRAINT "dataset_releases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_releases" ADD CONSTRAINT "dataset_releases_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "dataset_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "translation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Partial uniqueness for assignment locking, payout membership, and current documents.
CREATE UNIQUE INDEX "assignments_one_open_task" ON "assignments" ("task_id") WHERE "status" IN ('active', 'needs_edit');
CREATE UNIQUE INDEX "assignments_one_open_contributor" ON "assignments" ("contributor_id") WHERE "status" IN ('active', 'needs_edit');
CREATE UNIQUE INDEX "payout_items_one_open_earning" ON "payout_items" ("earning_entry_id") WHERE "released_at" IS NULL;
CREATE UNIQUE INDEX "guide_versions_one_current" ON "guide_versions" ("is_current") WHERE "is_current" = true;
CREATE UNIQUE INDEX "terms_versions_one_current" ON "terms_versions" ("is_current") WHERE "is_current" = true;
CREATE UNIQUE INDEX "import_rows_external_id" ON "import_rows" ("batch_id", "external_id") WHERE "external_id" <> '';
