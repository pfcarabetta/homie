ALTER TABLE "jobs" ADD COLUMN "consent_given" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "consent_text" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "consent_ip" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "consent_at" timestamp with time zone;