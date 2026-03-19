-- Add password_hash column to homeowners (required for auth)
ALTER TABLE "homeowners" ADD COLUMN "password_hash" text NOT NULL DEFAULT '';
--> statement-breakpoint
-- Remove default after backfill (new rows always provide a hash)
ALTER TABLE "homeowners" ALTER COLUMN "password_hash" DROP DEFAULT;
--> statement-breakpoint
-- Create bookings table
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"homeowner_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"response_id" uuid,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_response_id_provider_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."provider_responses"("id") ON DELETE set null ON UPDATE no action;
