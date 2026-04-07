CREATE TABLE "job_tracking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_tracking_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"tracking_token" varchar(32) NOT NULL,
	"notify_phone" varchar(20),
	"notify_email" varchar(255),
	"property_name" varchar(255) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "job_tracking_links_tracking_token_unique" UNIQUE("tracking_token")
);
--> statement-breakpoint
CREATE TABLE "slack_message_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"slack_channel" text NOT NULL,
	"slack_message_ts" text NOT NULL,
	"message_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_slack_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"notify_dispatch_created" boolean DEFAULT true NOT NULL,
	"notify_provider_response" boolean DEFAULT true NOT NULL,
	"notify_booking_confirmed" boolean DEFAULT true NOT NULL,
	"notify_approval_needed" boolean DEFAULT true NOT NULL,
	"notify_job_completed" boolean DEFAULT true NOT NULL,
	"notify_outreach_failed" boolean DEFAULT true NOT NULL,
	"notify_daily_digest" boolean DEFAULT false NOT NULL,
	"approval_threshold_cents" integer DEFAULT 50000 NOT NULL,
	"approval_channel_override" text,
	"digest_time" text DEFAULT '09:00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_estimate_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(255),
	"job_id" uuid,
	"workspace_id" uuid,
	"zip_code" varchar(10),
	"category" varchar(50),
	"subcategory" varchar(100),
	"complexity" text,
	"photo_analyzed" boolean DEFAULT false,
	"estimate_low_cents" integer,
	"estimate_high_cents" integer,
	"estimate_median_cents" integer,
	"confidence_score" numeric(3, 2),
	"data_points_used" integer,
	"adjustment_factors" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_cost_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"workspace_id" uuid,
	"zip_code" varchar(10),
	"category" varchar(50) NOT NULL,
	"subcategory" varchar(100) NOT NULL,
	"complexity" text DEFAULT 'moderate' NOT NULL,
	"quoted_price_cents" integer,
	"accepted_price_cents" integer,
	"actual_price_cents" integer,
	"provider_id" uuid,
	"property_type" varchar(50),
	"data_source" text DEFAULT 'industry_benchmark' NOT NULL,
	"region" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_schedule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"job_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_id" uuid,
	"confirmed_rate_cents" integer,
	"failure_reason" text,
	"required_intervention" boolean DEFAULT false NOT NULL,
	"intervention_type" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid,
	"template_id" uuid,
	"category" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"cadence_type" text NOT NULL,
	"cadence_config" jsonb,
	"preferred_provider_id" uuid,
	"agreed_rate_cents" integer,
	"auto_book" boolean DEFAULT true NOT NULL,
	"auto_book_max_cents" integer,
	"advance_dispatch_hours" integer DEFAULT 48 NOT NULL,
	"escalation_window_minutes" integer DEFAULT 120 NOT NULL,
	"fallback_to_marketplace" boolean DEFAULT true NOT NULL,
	"blackout_dates" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_dispatched_at" timestamp with time zone,
	"next_dispatch_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "schedule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"suggested_cadence_type" text,
	"suggested_cadence_config" jsonb,
	"property_types" text[],
	"climate_zones" text[],
	"amenity_tags" text[],
	"estimated_cost_range" varchar(50),
	"why_it_matters" text,
	"seasonal_relevance" text[],
	"sort_priority" integer DEFAULT 50 NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "sms_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "sms_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "home_address" text;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "home_city" text;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "home_state" text;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "home_bedrooms" integer;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "home_bathrooms" text;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "home_sqft" integer;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "home_details" jsonb;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "notify_email_quotes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "notify_sms_quotes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "notify_email_bookings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "notify_sms_bookings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_attempts" ADD COLUMN "conversation_state" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "company_address" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "company_phone" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "company_email" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "slack_team_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "slack_access_token" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "slack_channel_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "slack_connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "slack_connected_by" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "preferred_vendors" ADD COLUMN "availability_schedule" jsonb;--> statement-breakpoint
ALTER TABLE "preferred_vendors" ADD COLUMN "skip_quote" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_tracking_events" ADD CONSTRAINT "job_tracking_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tracking_links" ADD CONSTRAINT "job_tracking_links_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_message_log" ADD CONSTRAINT "slack_message_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_message_log" ADD CONSTRAINT "slack_message_log_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_slack_settings" ADD CONSTRAINT "workspace_slack_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_estimate_log" ADD CONSTRAINT "cost_estimate_log_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_estimate_log" ADD CONSTRAINT "cost_estimate_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_cost_data" ADD CONSTRAINT "repair_cost_data_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_cost_data" ADD CONSTRAINT "repair_cost_data_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_cost_data" ADD CONSTRAINT "repair_cost_data_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedule_runs" ADD CONSTRAINT "dispatch_schedule_runs_schedule_id_dispatch_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."dispatch_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedule_runs" ADD CONSTRAINT "dispatch_schedule_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedule_runs" ADD CONSTRAINT "dispatch_schedule_runs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedules" ADD CONSTRAINT "dispatch_schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedules" ADD CONSTRAINT "dispatch_schedules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedules" ADD CONSTRAINT "dispatch_schedules_template_id_schedule_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."schedule_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedules" ADD CONSTRAINT "dispatch_schedules_preferred_provider_id_providers_id_fk" FOREIGN KEY ("preferred_provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_tracking_events_job_id_idx" ON "job_tracking_events" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_tracking_links_token_idx" ON "job_tracking_links" USING btree ("tracking_token");--> statement-breakpoint
CREATE INDEX "job_tracking_links_job_id_idx" ON "job_tracking_links" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "repair_cost_cat_sub_zip_idx" ON "repair_cost_data" USING btree ("category","subcategory","zip_code");--> statement-breakpoint
CREATE INDEX "repair_cost_cat_region_idx" ON "repair_cost_data" USING btree ("category","region");--> statement-breakpoint
CREATE INDEX "repair_cost_created_idx" ON "repair_cost_data" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dispatch_sched_ws_status_idx" ON "dispatch_schedules" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "dispatch_sched_next_idx" ON "dispatch_schedules" USING btree ("next_dispatch_at","status");--> statement-breakpoint
CREATE INDEX "outreach_attempts_job_id_idx" ON "outreach_attempts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "outreach_attempts_provider_id_idx" ON "outreach_attempts" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "provider_responses_job_id_idx" ON "provider_responses" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "provider_responses_provider_id_idx" ON "provider_responses" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "bookings_job_id_idx" ON "bookings" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "bookings_provider_id_idx" ON "bookings" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_homeowner_idx" ON "workspace_members" USING btree ("workspace_id","homeowner_id");