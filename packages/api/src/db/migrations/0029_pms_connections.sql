CREATE TABLE IF NOT EXISTS "workspace_pms_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "pms_type" text NOT NULL,
  "credentials" jsonb NOT NULL,
  "status" text DEFAULT 'connected' NOT NULL,
  "last_error" text,
  "last_property_sync_at" timestamp with time zone,
  "last_reservation_sync_at" timestamp with time zone,
  "properties_synced" integer DEFAULT 0 NOT NULL,
  "reservations_synced" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pms_conn_workspace_idx" ON "workspace_pms_connections" ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pms_conn_workspace_type_idx" ON "workspace_pms_connections" ("workspace_id", "pms_type");
