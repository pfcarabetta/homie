CREATE TABLE IF NOT EXISTS "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"guest_name" text,
	"check_in" timestamp with time zone NOT NULL,
	"check_out" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"guests" integer,
	"source" text,
	"pms_reservation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_property_id_idx" ON "reservations" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "reservations_workspace_id_idx" ON "reservations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "reservations_check_in_idx" ON "reservations" USING btree ("check_in");--> statement-breakpoint
CREATE INDEX "reservations_pms_id_idx" ON "reservations" USING btree ("pms_reservation_id");