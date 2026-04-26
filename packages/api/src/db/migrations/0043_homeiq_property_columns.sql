ALTER TABLE "inspection_reports" ADD COLUMN "year_built" integer;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD COLUMN "county_fips" text;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD COLUMN "census_tract" text;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD COLUMN "home_iq_data" jsonb;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD COLUMN "home_iq_generated_at" timestamp with time zone;
