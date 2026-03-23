ALTER TABLE "workspaces" ADD COLUMN "searches_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "searches_limit" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_cycle_start" timestamp with time zone DEFAULT now() NOT NULL;