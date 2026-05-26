-- Dashboard Direction A — Next Step card skip tracking
--
-- The redesigned dashboard surfaces ONE prioritized next step at a
-- time. "Skip for now" pushes that step out of the queue for 24h so
-- the homeowner can defer without losing it. We track skips in a
-- JSONB map keyed by step ID (e.g. 'inspection_item:UUID',
-- 'walkthrough', 'add_vendor') with the ISO timestamp of the skip.
--
-- Single JSONB column, not a separate table — the map is always read
-- + written as a unit, so a denormalized blob is cleaner than a join.
--
-- Rollback:
--   ALTER TABLE homeowners DROP COLUMN IF EXISTS skipped_next_steps;

ALTER TABLE "homeowners" ADD COLUMN IF NOT EXISTS "skipped_next_steps" jsonb;
