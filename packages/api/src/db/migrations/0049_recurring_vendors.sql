-- Membership Phase 1, migration 3/5: recurring_vendors table.
--
-- The homeowner-vendor relationship for recurring services (cleaning,
-- landscaping, pool, pest control, etc.). Two vendor types:
--   'byo'     — homeowner-supplied vendor; SMS confirmation flow sets
--               vendor_confirmed_at and flips status active.
--   'network' — pre-vetted Homie Pro from the providers directory;
--               network_provider_id points to providers.id.
--
-- Allowed text-column values are documented in
-- packages/api/src/db/schema/recurring-vendors.ts (VENDOR_TYPES,
-- VENDOR_SCHEDULE_PATTERNS, etc.) and validated in app code.
--
-- Rollback (if needed):
--   DROP INDEX IF EXISTS "recurring_vendors_network_provider_idx";
--   DROP INDEX IF EXISTS "recurring_vendors_homeowner_idx";
--   DROP INDEX IF EXISTS "recurring_vendors_property_status_idx";
--   DROP TABLE IF EXISTS "recurring_vendors";

CREATE TABLE IF NOT EXISTS "recurring_vendors" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "homeowner_property_id" uuid NOT NULL REFERENCES "homeowner_properties"("id") ON DELETE CASCADE,
    "homeowner_id" uuid NOT NULL REFERENCES "homeowners"("id") ON DELETE CASCADE,
    "vendor_name" text NOT NULL,
    "vendor_phone" text,
    "vendor_email" text,
    "service_category" text NOT NULL,
    "vendor_type" text NOT NULL,
    "network_provider_id" uuid REFERENCES "providers"("id") ON DELETE SET NULL,
    "schedule_pattern" text NOT NULL,
    "schedule_day_of_week" integer,
    "schedule_day_of_month" integer,
    "schedule_nth_weekday" text,
    "schedule_time" time,
    "schedule_custom_dates" date[],
    "amount_cents" integer NOT NULL,
    "payment_method" text NOT NULL,
    "payment_method_id" text,
    "auto_pay_rule" text NOT NULL,
    "auto_pay_threshold_cents" integer,
    "status" text DEFAULT 'pending_vendor_confirmation' NOT NULL,
    "travel_hold_starts_at" date,
    "travel_hold_ends_at" date,
    "vendor_confirmed_at" timestamp with time zone,
    "total_paid_ytd_cents" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "recurring_vendors_property_status_idx"
    ON "recurring_vendors" ("homeowner_property_id", "status");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "recurring_vendors_homeowner_idx"
    ON "recurring_vendors" ("homeowner_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "recurring_vendors_network_provider_idx"
    ON "recurring_vendors" ("network_provider_id");
