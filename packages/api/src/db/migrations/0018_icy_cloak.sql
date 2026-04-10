CREATE TABLE "pricing_config" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_issue_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"icon" varchar(10),
	"description" varchar(255),
	"color" varchar(7),
	"type" text DEFAULT 'other' NOT NULL,
	"has_troubleshooting" boolean DEFAULT false,
	"display_order" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_troubleshoot_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"is_resolution_option" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"reservation_id" uuid,
	"category_id" uuid NOT NULL,
	"guest_name" varchar(255),
	"guest_email" varchar(255),
	"guest_phone" varchar(20),
	"description" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'reported' NOT NULL,
	"troubleshoot_log" jsonb,
	"self_resolved" boolean DEFAULT false,
	"is_recurring" boolean DEFAULT false,
	"recurring_count" integer DEFAULT 0,
	"auto_dispatched" boolean DEFAULT false,
	"auto_dispatch_rule_id" uuid,
	"dispatched_job_id" uuid,
	"pm_approved_by" uuid,
	"pm_approved_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"guest_satisfaction_rating" text,
	"guest_satisfaction_comment" text,
	"language" varchar(5) DEFAULT 'en',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_issue_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"storage_url" varchar(500) NOT NULL,
	"thumbnail_url" varchar(500),
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_size" integer,
	"mime_type" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "guest_issue_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_auto_dispatch_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"min_severity" text DEFAULT 'high' NOT NULL,
	"preferred_vendor_id" uuid,
	"is_enabled" boolean DEFAULT true,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_reporter_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT false,
	"whitelabel_logo_url" varchar(500),
	"whitelabel_company_name" varchar(255),
	"show_powered_by_homie" boolean DEFAULT true,
	"default_language" varchar(5) DEFAULT 'en',
	"supported_languages" jsonb DEFAULT '["en"]'::jsonb,
	"sla_urgent_minutes" integer DEFAULT 30,
	"sla_high_minutes" integer DEFAULT 60,
	"sla_medium_minutes" integer DEFAULT 120,
	"sla_low_minutes" integer DEFAULT 240,
	"require_pm_approval" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_reporter_settings_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "guest_issue_categories" ADD CONSTRAINT "guest_issue_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_troubleshoot_flows" ADD CONSTRAINT "guest_troubleshoot_flows_category_id_guest_issue_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."guest_issue_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_issues" ADD CONSTRAINT "guest_issues_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_issues" ADD CONSTRAINT "guest_issues_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_issues" ADD CONSTRAINT "guest_issues_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_issues" ADD CONSTRAINT "guest_issues_category_id_guest_issue_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."guest_issue_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_issues" ADD CONSTRAINT "guest_issues_dispatched_job_id_jobs_id_fk" FOREIGN KEY ("dispatched_job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_issue_photos" ADD CONSTRAINT "guest_issue_photos_issue_id_guest_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."guest_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_issue_timeline" ADD CONSTRAINT "guest_issue_timeline_issue_id_guest_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."guest_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_auto_dispatch_rules" ADD CONSTRAINT "guest_auto_dispatch_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_auto_dispatch_rules" ADD CONSTRAINT "guest_auto_dispatch_rules_category_id_guest_issue_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."guest_issue_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_reporter_settings" ADD CONSTRAINT "guest_reporter_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_issue_categories_workspace_id_idx" ON "guest_issue_categories" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "guest_troubleshoot_flows_category_id_idx" ON "guest_troubleshoot_flows" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "guest_issues_workspace_id_idx" ON "guest_issues" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "guest_issues_property_id_idx" ON "guest_issues" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "guest_issues_status_idx" ON "guest_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "guest_issues_category_id_idx" ON "guest_issues" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "guest_issue_photos_issue_id_idx" ON "guest_issue_photos" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "guest_issue_timeline_issue_id_idx" ON "guest_issue_timeline" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "guest_auto_dispatch_rules_workspace_id_idx" ON "guest_auto_dispatch_rules" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_reporter_settings_workspace_id_idx" ON "guest_reporter_settings" USING btree ("workspace_id");