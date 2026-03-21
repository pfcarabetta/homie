ALTER TABLE "jobs" ADD COLUMN "payment_status" text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "stripe_session_id" text;