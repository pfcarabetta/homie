ALTER TABLE "inspection_reports" ADD COLUMN "cc_emails" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD COLUMN "cc_homeowner_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
