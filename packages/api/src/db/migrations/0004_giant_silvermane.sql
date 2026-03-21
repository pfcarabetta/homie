ALTER TABLE "providers" ADD COLUMN "notification_pref" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "vacation_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "business_hours" jsonb;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "license_info" jsonb;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "service_zips" text[];