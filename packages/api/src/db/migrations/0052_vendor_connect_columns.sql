-- Membership Phase 1, Session 2 migration: Stripe Connect plumbing on
-- recurring_vendors.
--
-- Three additive columns + two indexes:
--   stripe_connect_account_id    — Connect Express acct ID, populated
--                                  when vendor finishes onboarding. Mirrors
--                                  inspector_partners.stripe_connect_account_id.
--   vendor_confirmation_token    — one-time URL token for the unauth
--                                  /vendor-confirmation/:token page.
--   vendor_confirmation_token_expires_at — 7-day expiry per spec.
--
-- Rollback (if needed):
--   DROP INDEX IF EXISTS "recurring_vendors_confirmation_token_uniq";
--   DROP INDEX IF EXISTS "recurring_vendors_connect_account_idx";
--   ALTER TABLE "recurring_vendors" DROP COLUMN "vendor_confirmation_token_expires_at";
--   ALTER TABLE "recurring_vendors" DROP COLUMN "vendor_confirmation_token";
--   ALTER TABLE "recurring_vendors" DROP COLUMN "stripe_connect_account_id";

ALTER TABLE "recurring_vendors" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" text;--> statement-breakpoint
ALTER TABLE "recurring_vendors" ADD COLUMN IF NOT EXISTS "vendor_confirmation_token" text;--> statement-breakpoint
ALTER TABLE "recurring_vendors" ADD COLUMN IF NOT EXISTS "vendor_confirmation_token_expires_at" timestamp with time zone;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "recurring_vendors_connect_account_idx"
    ON "recurring_vendors" ("stripe_connect_account_id");--> statement-breakpoint

-- Partial unique: at most one live (non-null) confirmation token per
-- vendor. Re-issuing the SMS link rotates the value; finishing
-- onboarding clears it to NULL so the row no longer participates.
CREATE UNIQUE INDEX IF NOT EXISTS "recurring_vendors_confirmation_token_uniq"
    ON "recurring_vendors" ("vendor_confirmation_token")
    WHERE "vendor_confirmation_token" IS NOT NULL;
