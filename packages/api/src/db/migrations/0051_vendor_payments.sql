-- Membership Phase 1, migration 5/5: vendor_payments table.
--
-- One row per member→vendor payment. Created by the payment processing
-- pipeline (Session 3+) when a vendor_visit transitions to 'completed'
-- and auto_pay_rule fires.
--
-- Money flow (modeled but not yet wired):
--   member's card/bank → Homie's Stripe balance → vendor's Connect Express account
-- The two stripe_* IDs columns sit empty until Session 3 implements
-- Stripe Connect.
--
-- After this table is created, a back-link FK is added on
-- vendor_visits.payment_id → vendor_payments.id (deferred from
-- migration 0050 to avoid the circular-table-creation issue).
--
-- Rollback (if needed):
--   ALTER TABLE "vendor_visits" DROP CONSTRAINT IF EXISTS "vendor_visits_payment_id_fk";
--   DROP INDEX IF EXISTS "vendor_payments_status_idx";
--   DROP INDEX IF EXISTS "vendor_payments_vendor_idx";
--   DROP INDEX IF EXISTS "vendor_payments_visit_idx";
--   DROP TABLE IF EXISTS "vendor_payments";

CREATE TABLE IF NOT EXISTS "vendor_payments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "vendor_visit_id" uuid REFERENCES "vendor_visits"("id") ON DELETE SET NULL,
    "recurring_vendor_id" uuid NOT NULL REFERENCES "recurring_vendors"("id") ON DELETE CASCADE,
    "amount_cents" integer NOT NULL,
    "processing_fee_cents" integer DEFAULT 0 NOT NULL,
    "homie_take_cents" integer DEFAULT 0 NOT NULL,
    "net_to_vendor_cents" integer NOT NULL,
    "payment_method" text NOT NULL,
    "stripe_payment_intent_id" text,
    "stripe_transfer_id" text,
    "status" text DEFAULT 'pending' NOT NULL,
    "failure_reason" text,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vendor_payments_visit_idx"
    ON "vendor_payments" ("vendor_visit_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vendor_payments_vendor_idx"
    ON "vendor_payments" ("recurring_vendor_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vendor_payments_status_idx"
    ON "vendor_payments" ("status");--> statement-breakpoint

-- Back-link FK on vendor_visits.payment_id (deferred from migration
-- 0050 — vendor_payments didn't exist there). DO block + IF NOT EXISTS
-- guard makes re-running idempotent.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'vendor_visits_payment_id_fk'
        AND table_name = 'vendor_visits'
    ) THEN
        ALTER TABLE "vendor_visits"
            ADD CONSTRAINT "vendor_visits_payment_id_fk"
            FOREIGN KEY ("payment_id")
            REFERENCES "vendor_payments"("id")
            ON DELETE SET NULL;
    END IF;
END $$;
