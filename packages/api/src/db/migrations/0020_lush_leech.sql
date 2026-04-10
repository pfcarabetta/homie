ALTER TABLE "workspaces" ADD COLUMN "track_domain" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "track_api_key" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "track_api_secret" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "track_sync_enabled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "track_last_sync_at" timestamp with time zone;