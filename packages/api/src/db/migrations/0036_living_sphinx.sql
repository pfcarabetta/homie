CREATE TABLE "workspace_pms_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"pms_type" text NOT NULL,
	"credentials" jsonb NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"last_property_sync_at" timestamp with time zone,
	"last_reservation_sync_at" timestamp with time zone,
	"properties_synced" integer DEFAULT 0 NOT NULL,
	"reservations_synced" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_report_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
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
	"quotes" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"inspector_adjusted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspector_partner_id" uuid,
	"homeowner_id" uuid,
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
	"pricing_tier" text,
	"parsing_status" text DEFAULT 'uploading' NOT NULL,
	"parsing_error" text,
	"items_parsed" integer DEFAULT 0 NOT NULL,
	"items_dispatched" integer DEFAULT 0 NOT NULL,
	"items_quoted" integer DEFAULT 0 NOT NULL,
	"total_quote_value_cents" integer DEFAULT 0 NOT NULL,
	"inspector_earnings_cents" integer DEFAULT 0 NOT NULL,
	"client_notified_at" timestamp with time zone,
	"client_first_action_at" timestamp with time zone,
	"client_access_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_reports_client_access_token_unique" UNIQUE("client_access_token")
);
--> statement-breakpoint
CREATE TABLE "inspector_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspector_partner_id" uuid NOT NULL,
	"report_id" uuid,
	"lead_id" uuid,
	"earning_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text,
	"period_month" date NOT NULL,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspector_inbound_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspector_partner_id" uuid NOT NULL,
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
CREATE TABLE "inspector_partners" (
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
	"partner_slug" text NOT NULL,
	"accepts_inbound_leads" boolean DEFAULT true NOT NULL,
	"avg_inspections_per_month" integer,
	"stripe_connect_account_id" text,
	"payout_method" text DEFAULT 'stripe' NOT NULL,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"referred_by_partner_id" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspector_partners_partner_slug_unique" UNIQUE("partner_slug")
);
--> statement-breakpoint
CREATE TABLE "inspector_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspector_partner_id" uuid NOT NULL,
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
ALTER TABLE "property_inventory_items" ALTER COLUMN "property_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "property_rooms" ALTER COLUMN "property_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "property_scan_changes" ALTER COLUMN "property_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "property_scans" ALTER COLUMN "property_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "property_scans" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "custom_pricing" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "property_inventory_items" ADD COLUMN "homeowner_id" uuid;--> statement-breakpoint
ALTER TABLE "property_rooms" ADD COLUMN "homeowner_id" uuid;--> statement-breakpoint
ALTER TABLE "property_scans" ADD COLUMN "homeowner_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_pms_connections" ADD CONSTRAINT "workspace_pms_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_report_items" ADD CONSTRAINT "inspection_report_items_report_id_inspection_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."inspection_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_inspector_partner_id_inspector_partners_id_fk" FOREIGN KEY ("inspector_partner_id") REFERENCES "public"."inspector_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspector_earnings" ADD CONSTRAINT "inspector_earnings_inspector_partner_id_inspector_partners_id_fk" FOREIGN KEY ("inspector_partner_id") REFERENCES "public"."inspector_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspector_earnings" ADD CONSTRAINT "inspector_earnings_report_id_inspection_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."inspection_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspector_inbound_leads" ADD CONSTRAINT "inspector_inbound_leads_inspector_partner_id_inspector_partners_id_fk" FOREIGN KEY ("inspector_partner_id") REFERENCES "public"."inspector_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspector_payouts" ADD CONSTRAINT "inspector_payouts_inspector_partner_id_inspector_partners_id_fk" FOREIGN KEY ("inspector_partner_id") REFERENCES "public"."inspector_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pms_conn_workspace_idx" ON "workspace_pms_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pms_conn_workspace_type_idx" ON "workspace_pms_connections" USING btree ("workspace_id","pms_type");--> statement-breakpoint
CREATE INDEX "inspection_item_report_idx" ON "inspection_report_items" USING btree ("report_id","sort_order");--> statement-breakpoint
CREATE INDEX "inspection_item_dispatch_idx" ON "inspection_report_items" USING btree ("dispatch_status");--> statement-breakpoint
CREATE INDEX "inspection_item_category_idx" ON "inspection_report_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "inspection_report_inspector_idx" ON "inspection_reports" USING btree ("inspector_partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_report_token_idx" ON "inspection_reports" USING btree ("client_access_token");--> statement-breakpoint
CREATE INDEX "inspection_report_status_idx" ON "inspection_reports" USING btree ("parsing_status");--> statement-breakpoint
CREATE INDEX "inspector_earning_partner_month_idx" ON "inspector_earnings" USING btree ("inspector_partner_id","period_month");--> statement-breakpoint
CREATE INDEX "inspector_earning_payout_idx" ON "inspector_earnings" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "inspector_lead_partner_idx" ON "inspector_inbound_leads" USING btree ("inspector_partner_id");--> statement-breakpoint
CREATE INDEX "inspector_lead_status_idx" ON "inspector_inbound_leads" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "inspector_partner_slug_idx" ON "inspector_partners" USING btree ("partner_slug");--> statement-breakpoint
CREATE INDEX "inspector_partner_status_idx" ON "inspector_partners" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inspector_partner_email_idx" ON "inspector_partners" USING btree ("email");--> statement-breakpoint
CREATE INDEX "inventory_homeowner_idx" ON "property_inventory_items" USING btree ("homeowner_id");--> statement-breakpoint
CREATE INDEX "property_scans_homeowner_idx" ON "property_scans" USING btree ("homeowner_id");