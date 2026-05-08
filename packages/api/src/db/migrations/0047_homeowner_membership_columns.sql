-- Membership Phase 1, migration 1/5: tier-state columns on homeowners.
--
-- The columns `membership_tier` and `stripe_customer_id` already exist
-- on this table (migrations 00xx, pre-Phase-1 — see CLAUDE-MEMBERSHIP.md
-- "Discovery delta"); only the four new tier-state columns are added
-- here.
--
-- Rollback (if needed):
--   ALTER TABLE "homeowners" DROP COLUMN "stripe_subscription_id";
--   ALTER TABLE "homeowners" DROP COLUMN "tier_started_at";
--   ALTER TABLE "homeowners" DROP COLUMN "tier_renews_at";
--   ALTER TABLE "homeowners" DROP COLUMN "tier_cancels_at";

ALTER TABLE "homeowners" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "tier_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "tier_renews_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "tier_cancels_at" timestamp with time zone;
