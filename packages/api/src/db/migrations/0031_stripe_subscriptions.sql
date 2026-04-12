ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
--> statement-breakpoint
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS subscription_status text;
--> statement-breakpoint
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS current_period_end timestamp with time zone;
