-- Membership Phase 1, migration 4/5: vendor_visits table.
--
-- One row per scheduled visit. The schedule engine (Session 3+ work)
-- creates these from each recurring_vendor's schedule pattern, looking
-- ~30 days ahead. Visits move through:
--
--   scheduled → confirmation_sent → confirmed → completed
--                          ↓
--                       skipped / missed / disputed (terminal)
--
-- payment_id is a forward FK to vendor_payments.id (added in migration
-- 0051 via ALTER TABLE so we don't need to introduce a circular
-- definition during table creation).
--
-- Rollback (if needed):
--   DROP INDEX IF EXISTS "vendor_visits_status_scheduled_idx";
--   DROP INDEX IF EXISTS "vendor_visits_vendor_scheduled_idx";
--   DROP TABLE IF EXISTS "vendor_visits";

CREATE TABLE IF NOT EXISTS "vendor_visits" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "recurring_vendor_id" uuid NOT NULL REFERENCES "recurring_vendors"("id") ON DELETE CASCADE,
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" text DEFAULT 'scheduled' NOT NULL,
    "confirmation_sent_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "completion_photo_url" text,
    "completion_notes" text,
    "amount_charged_cents" integer,
    "tip_cents" integer DEFAULT 0 NOT NULL,
    "payment_id" uuid,
    "skip_reason" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vendor_visits_vendor_scheduled_idx"
    ON "vendor_visits" ("recurring_vendor_id", "scheduled_at" DESC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vendor_visits_status_scheduled_idx"
    ON "vendor_visits" ("status", "scheduled_at");
