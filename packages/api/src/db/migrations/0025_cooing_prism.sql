CREATE TABLE "property_calendar_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_type" text DEFAULT 'ical_url' NOT NULL,
	"ical_url" text,
	"sync_frequency_minutes" integer DEFAULT 60 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text DEFAULT 'never_synced' NOT NULL,
	"last_sync_error" text,
	"events_found" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "ical_uid" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "property_calendar_sources" ADD CONSTRAINT "property_calendar_sources_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_sources_property_idx" ON "property_calendar_sources" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "calendar_sources_workspace_idx" ON "property_calendar_sources" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "calendar_sources_next_sync_idx" ON "property_calendar_sources" USING btree ("last_sync_at");--> statement-breakpoint
CREATE INDEX "reservations_check_out_idx" ON "reservations" USING btree ("check_out");--> statement-breakpoint
CREATE INDEX "reservations_ical_uid_property_idx" ON "reservations" USING btree ("ical_uid","property_id");