ALTER TABLE "homeowners" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "homeowners" ADD COLUMN "email_verify_token" text;