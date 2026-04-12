-- Inspector Partners
CREATE TABLE IF NOT EXISTS "inspector_partners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "company_name" text NOT NULL,
  "company_logo_url" text,
  "website" text,
  "phone" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text,
  "license_number" text,
  "certifications" text[],
  "service_area_zips" text[],
  "inspection_software" text,
  "spectora_connected" boolean DEFAULT false NOT NULL,
  "homegauge_connected" boolean DEFAULT false NOT NULL,
  "addon_price_cents" integer DEFAULT 9900 NOT NULL,
  "partner_slug" text UNIQUE NOT NULL,
  "accepts_inbound_leads" boolean DEFAULT true NOT NULL,
  "avg_inspections_per_month" integer,
  "stripe_connect_account_id" text,
  "payout_method" text DEFAULT 'stripe' NOT NULL,
  "status" text DEFAULT 'pending_verification' NOT NULL,
  "tier" text DEFAULT 'standard' NOT NULL,
  "referred_by_partner_id" uuid,
  "joined_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inspector_partner_slug_idx" ON "inspector_partners" ("partner_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspector_partner_status_idx" ON "inspector_partners" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspector_partner_email_idx" ON "inspector_partners" ("email");
--> statement-breakpoint

-- Inspection Reports
CREATE TABLE IF NOT EXISTS "inspection_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inspector_partner_id" uuid NOT NULL REFERENCES "inspector_partners"("id") ON DELETE CASCADE,
  "property_address" text NOT NULL,
  "property_city" text NOT NULL,
  "property_state" text NOT NULL,
  "property_zip" text NOT NULL,
  "client_name" text NOT NULL,
  "client_email" text NOT NULL,
  "client_phone" text,
  "inspection_date" date NOT NULL,
  "inspection_type" text DEFAULT 'general' NOT NULL,
  "report_file_url" text,
  "source" text DEFAULT 'manual_upload' NOT NULL,
  "addon_sold" boolean DEFAULT false NOT NULL,
  "addon_price_cents" integer,
  "parsing_status" text DEFAULT 'uploading' NOT NULL,
  "parsing_error" text,
  "items_parsed" integer DEFAULT 0 NOT NULL,
  "items_dispatched" integer DEFAULT 0 NOT NULL,
  "items_quoted" integer DEFAULT 0 NOT NULL,
  "total_quote_value_cents" integer DEFAULT 0 NOT NULL,
  "inspector_earnings_cents" integer DEFAULT 0 NOT NULL,
  "client_notified_at" timestamp with time zone,
  "client_first_action_at" timestamp with time zone,
  "client_access_token" text UNIQUE NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_report_inspector_idx" ON "inspection_reports" ("inspector_partner_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inspection_report_token_idx" ON "inspection_reports" ("client_access_token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_report_status_idx" ON "inspection_reports" ("parsing_status");
--> statement-breakpoint

-- Inspection Report Items
CREATE TABLE IF NOT EXISTS "inspection_report_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL REFERENCES "inspection_reports"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "severity" text NOT NULL,
  "location_in_property" text,
  "inspector_photos" text[],
  "ai_cost_estimate_low_cents" integer DEFAULT 0 NOT NULL,
  "ai_cost_estimate_high_cents" integer DEFAULT 0 NOT NULL,
  "ai_confidence" numeric(3, 2) DEFAULT '0.80' NOT NULL,
  "dispatch_status" text DEFAULT 'not_dispatched' NOT NULL,
  "dispatch_id" uuid,
  "quote_amount_cents" integer,
  "provider_name" text,
  "provider_rating" numeric(2, 1),
  "provider_availability" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "inspector_adjusted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_item_report_idx" ON "inspection_report_items" ("report_id", "sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_item_dispatch_idx" ON "inspection_report_items" ("dispatch_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_item_category_idx" ON "inspection_report_items" ("category");
--> statement-breakpoint

-- Inspector Earnings
CREATE TABLE IF NOT EXISTS "inspector_earnings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inspector_partner_id" uuid NOT NULL REFERENCES "inspector_partners"("id") ON DELETE CASCADE,
  "report_id" uuid REFERENCES "inspection_reports"("id") ON DELETE SET NULL,
  "lead_id" uuid,
  "earning_type" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "description" text,
  "period_month" date NOT NULL,
  "payout_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspector_earning_partner_month_idx" ON "inspector_earnings" ("inspector_partner_id", "period_month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspector_earning_payout_idx" ON "inspector_earnings" ("payout_id");
--> statement-breakpoint

-- Inspector Payouts
CREATE TABLE IF NOT EXISTS "inspector_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inspector_partner_id" uuid NOT NULL REFERENCES "inspector_partners"("id") ON DELETE CASCADE,
  "period_month" date NOT NULL,
  "total_amount_cents" integer NOT NULL,
  "earnings_count" integer NOT NULL,
  "payout_method" text NOT NULL,
  "stripe_transfer_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "failure_reason" text,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Inspector Inbound Leads
CREATE TABLE IF NOT EXISTS "inspector_inbound_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inspector_partner_id" uuid NOT NULL REFERENCES "inspector_partners"("id") ON DELETE CASCADE,
  "homeowner_name" text NOT NULL,
  "homeowner_email" text NOT NULL,
  "homeowner_phone" text,
  "property_city" text NOT NULL,
  "property_state" text NOT NULL,
  "property_zip" text NOT NULL,
  "inspection_type_needed" text DEFAULT 'general' NOT NULL,
  "preferred_date_range" text,
  "notes" text,
  "status" text DEFAULT 'new' NOT NULL,
  "accepted_at" timestamp with time zone,
  "converted_at" timestamp with time zone,
  "lead_source" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspector_lead_partner_idx" ON "inspector_inbound_leads" ("inspector_partner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspector_lead_status_idx" ON "inspector_inbound_leads" ("status");
