-- Membership Phase 1, Session 8 — dispatch allowance ledger
--
-- Append-only ledger tracking every dispatch credit (granted by a
-- subscription tier or an Inspect tier purchase) and every dispatch
-- consumption (decrement when the user dispatches an item or bundle).
-- The current allowance is computed by SUMming the ledger — we never
-- store a mutable "balance" column. The ledger is the source of truth.
--
-- Reasons:
--   monthly_grant            +3 from a Plus monthly tick (capped to 12 in worker)
--   pro_bundle_grant         +1 single-bundle credit from an Inspect Pro purchase
--   unlimited_grant           0 audit row marking unlimited window (expires_at set);
--                              created on Inspect Premium purchase
--   manual_adjustment        +/− admin override (delta + reason in `notes`)
--   consume_monthly          −1 dispatch drawn from monthly bank
--   consume_pro_bundle       −1 dispatch drawn from Pro bundle credit
--   consume_unlimited         0 audit row when consumed under unlimited grant
--
-- source_id is the upstream identifier (Stripe session, dispatch event,
-- period date) used for idempotency. Combined with (homeowner_id, reason)
-- in a partial unique index to make webhook + cron retries safe.
--
-- Two new columns on homeowners track time-bound bundles:
--   membership_source        'direct_subscription' | 'inspect_premium_bundle' | NULL
--   membership_expires_at    For Inspect Premium bundles only — when the
--                              free year flips back to Free unless the
--                              homeowner converts to paid Plus first.
--
-- Rollback (if needed):
--   ALTER TABLE "homeowners" DROP COLUMN IF EXISTS "membership_source";
--   ALTER TABLE "homeowners" DROP COLUMN IF EXISTS "membership_expires_at";
--   DROP TABLE IF EXISTS "dispatch_allowance_ledger";

ALTER TABLE "homeowners" ADD COLUMN IF NOT EXISTS "membership_source" text;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN IF NOT EXISTS "membership_expires_at" timestamp with time zone;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dispatch_allowance_ledger" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "homeowner_id" uuid NOT NULL REFERENCES "homeowners"("id") ON DELETE CASCADE,
    "reason" text NOT NULL,
    "delta" integer NOT NULL,
    "source_id" text,
    "expires_at" timestamp with time zone,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Lookup index for "give me this homeowner's ledger".
CREATE INDEX IF NOT EXISTS "dispatch_ledger_homeowner_idx"
    ON "dispatch_allowance_ledger" ("homeowner_id");--> statement-breakpoint

-- Idempotency for webhook + cron retries: a given (homeowner, reason,
-- source_id) tuple can only be inserted once. Partial so consume rows
-- without a stable source_id (rare — defensive only) don't trip it.
CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_ledger_dedup_uniq"
    ON "dispatch_allowance_ledger" ("homeowner_id", "reason", "source_id")
    WHERE "source_id" IS NOT NULL;
