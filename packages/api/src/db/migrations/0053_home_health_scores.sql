-- Membership Phase 1, Session 7 (Phase 3 work — Health Score):
-- Creates the score history table + the per-factor breakdown table.
--
-- home_health_scores stores one row per (homeowner_property, period_month).
-- The unique index makes the nightly worker's UPSERT idempotent — if it
-- runs twice for the same property in the same month, the second run
-- updates the existing row rather than creating a duplicate.
--
-- home_health_score_factors stores the 5-factor breakdown for each score
-- row (cascade-deletes when the parent score is deleted). Used by the
-- /factors endpoint to render "what's pulling your score up/down".
--
-- Rollback (if needed):
--   DROP TABLE IF EXISTS "home_health_score_factors";
--   DROP TABLE IF EXISTS "home_health_scores";

CREATE TABLE IF NOT EXISTS "home_health_scores" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "homeowner_property_id" uuid NOT NULL REFERENCES "homeowner_properties"("id") ON DELETE CASCADE,
    "period_month" date NOT NULL,
    "score" integer NOT NULL,
    "score_band" text NOT NULL,
    "delta_from_prev_month" integer,
    "neighborhood_percentile" integer,
    "estimated_resale_impact_cents" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Unique on (property, period) so the nightly worker can UPSERT.
CREATE UNIQUE INDEX IF NOT EXISTS "home_health_scores_prop_period_uniq"
    ON "home_health_scores" ("homeowner_property_id", "period_month");--> statement-breakpoint

-- Descending lookup for "show me the latest score" + history queries.
CREATE INDEX IF NOT EXISTS "home_health_scores_prop_period_desc_idx"
    ON "home_health_scores" ("homeowner_property_id", "period_month" DESC);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "home_health_score_factors" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "score_id" uuid NOT NULL REFERENCES "home_health_scores"("id") ON DELETE CASCADE,
    "factor_type" text NOT NULL,
    "factor_score" integer NOT NULL,
    "factor_weight" numeric(3,2) NOT NULL,
    "contribution" numeric(5,2) NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "home_health_score_factors_score_idx"
    ON "home_health_score_factors" ("score_id");
