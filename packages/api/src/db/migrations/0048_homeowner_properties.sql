-- Membership Phase 1, migration 2/5: homeowner_properties table.
--
-- Holds consumer-side property records going forward. The Premier tier
-- supports multi-property; today, consumer property data sits on the
-- homeowners row (home_address, home_city, home_bedrooms, home_details,
-- etc.) which is 1:1.
--
-- Strategy is expand-contract:
--   1. (THIS MIGRATION) Create the table; backfill one row per existing
--      homeowner that has any property data, with is_primary=true.
--   2. Existing homeowners.home_* columns are LEFT IN PLACE so legacy
--      read paths (auth/account routes, Home IQ dashboard) keep working.
--   3. (LATER MIGRATION, after Phase N) Drop the legacy columns once
--      every read path has been migrated to homeowner_properties.
--
-- Backfill criterion: any of home_address / home_city / home_state /
-- home_bedrooms / home_bathrooms / home_sqft / home_details is non-null.
-- Rows with all-null property data get NO homeowner_properties row —
-- they can add one when they sign up for membership.
--
-- Rollback (if needed):
--   DROP INDEX IF EXISTS "homeowner_properties_homeowner_primary_uniq";
--   DROP INDEX IF EXISTS "homeowner_properties_homeowner_idx";
--   DROP TABLE IF EXISTS "homeowner_properties";

CREATE TABLE IF NOT EXISTS "homeowner_properties" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "homeowner_id" uuid NOT NULL REFERENCES "homeowners"("id") ON DELETE CASCADE,
    "is_primary" boolean DEFAULT true NOT NULL,
    "nickname" text,
    "address" text,
    "city" text,
    "state" text,
    "zip_code" text,
    "property_type" text DEFAULT 'single_family' NOT NULL,
    "bedrooms" integer,
    "bathrooms" numeric(3,1),
    "sqft" integer,
    "details" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "homeowner_properties_homeowner_idx"
    ON "homeowner_properties" ("homeowner_id");--> statement-breakpoint

-- Partial unique index: at most one is_primary=true row per homeowner.
-- Allows multiple non-primary rows (vacation homes, future second homes)
-- without violating the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "homeowner_properties_homeowner_primary_uniq"
    ON "homeowner_properties" ("homeowner_id")
    WHERE "is_primary" = true;--> statement-breakpoint

-- Backfill: one is_primary=true row per homeowner with property data.
-- Idempotent via NOT EXISTS guard so re-running this migration (or
-- running it after a partial-failure) doesn't create duplicates.
INSERT INTO "homeowner_properties" (
    "homeowner_id",
    "is_primary",
    "address",
    "city",
    "state",
    "zip_code",
    "bedrooms",
    "bathrooms",
    "sqft",
    "details"
)
SELECT
    h."id",
    true,
    h."home_address",
    h."home_city",
    h."home_state",
    h."zip_code",
    h."home_bedrooms",
    -- home_bathrooms is text on homeowners; safe-cast to numeric(3,1).
    -- Invalid strings produce NULL via NULLIF + regex check.
    CASE
        WHEN h."home_bathrooms" ~ '^[0-9]+(\.[0-9]+)?$'
        THEN h."home_bathrooms"::numeric(3,1)
        ELSE NULL
    END,
    h."home_sqft",
    h."home_details"
FROM "homeowners" h
WHERE (
        h."home_address" IS NOT NULL
        OR h."home_city" IS NOT NULL
        OR h."home_state" IS NOT NULL
        OR h."home_bedrooms" IS NOT NULL
        OR h."home_bathrooms" IS NOT NULL
        OR h."home_sqft" IS NOT NULL
        OR h."home_details" IS NOT NULL
    )
    AND NOT EXISTS (
        SELECT 1 FROM "homeowner_properties" hp
        WHERE hp."homeowner_id" = h."id" AND hp."is_primary" = true
    );
