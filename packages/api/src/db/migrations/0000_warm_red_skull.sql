CREATE TABLE "homeowners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"zip_code" text NOT NULL,
	"membership_tier" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homeowners_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homeowner_id" uuid NOT NULL,
	"diagnosis" jsonb,
	"photo_urls" text[],
	"preferred_timing" text,
	"budget" text,
	"tier" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"zip_code" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"google_place_id" text,
	"google_rating" numeric(3, 2),
	"review_count" integer DEFAULT 0 NOT NULL,
	"categories" text[],
	"location" geography(Point, 4326),
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_google_place_id_unique" UNIQUE("google_place_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"script_used" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"response_raw" text,
	"duration_sec" numeric(8, 3),
	"sentiment_score" numeric(5, 4),
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"outreach_attempt_id" uuid,
	"channel" text NOT NULL,
	"quoted_price" numeric(10, 2),
	"availability" text,
	"message" text,
	"rating_at_time" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"acceptance_rate" numeric(5, 4),
	"avg_response_sec" numeric(10, 2),
	"completion_rate" numeric(5, 4),
	"avg_homeowner_rating" numeric(3, 2),
	"total_outreach" integer DEFAULT 0 NOT NULL,
	"total_accepted" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_homeowner_id_homeowners_id_fk" FOREIGN KEY ("homeowner_id") REFERENCES "public"."homeowners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_responses" ADD CONSTRAINT "provider_responses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_responses" ADD CONSTRAINT "provider_responses_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_responses" ADD CONSTRAINT "provider_responses_outreach_attempt_id_outreach_attempts_id_fk" FOREIGN KEY ("outreach_attempt_id") REFERENCES "public"."outreach_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_scores" ADD CONSTRAINT "provider_scores_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_homeowner_id_idx" ON "jobs" USING btree ("homeowner_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "providers_location_gist_idx" ON "providers" USING gist ("location");--> statement-breakpoint
CREATE INDEX "providers_categories_gin_idx" ON "providers" USING gin ("categories");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_scores_provider_id_idx" ON "provider_scores" USING btree ("provider_id");