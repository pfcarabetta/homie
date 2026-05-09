-- Membership Phase 5 — bundle renewal email tracking
--
-- Two timestamp columns on homeowners that the bundle renewal worker
-- (services/bundle-renewal-worker.ts) writes to whenever it sends a
-- 30-day-out or 7-day-out reminder. Used as a dedup gate so the daily
-- sweep can run idempotently.
--
-- Rollback:
--   ALTER TABLE homeowners DROP COLUMN IF EXISTS bundle_renewal_30d_sent_at;
--   ALTER TABLE homeowners DROP COLUMN IF EXISTS bundle_renewal_7d_sent_at;

ALTER TABLE "homeowners" ADD COLUMN IF NOT EXISTS "bundle_renewal_30d_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN IF NOT EXISTS "bundle_renewal_7d_sent_at" timestamp with time zone;
