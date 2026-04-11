CREATE TABLE "property_inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"room_id" uuid,
	"scan_id" uuid,
	"category" text NOT NULL,
	"item_type" text NOT NULL,
	"brand" text,
	"model_number" text,
	"serial_number" text,
	"manufacture_date" date,
	"estimated_age_years" numeric(4, 1),
	"fuel_type" text,
	"capacity" text,
	"condition" text,
	"identification_method" text DEFAULT 'visual_classification' NOT NULL,
	"confidence_score" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	"photo_frame_url" text,
	"label_photo_url" text,
	"maintenance_flags" text[],
	"notes" text,
	"status" text DEFAULT 'ai_identified' NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"scan_id" uuid,
	"room_type" text NOT NULL,
	"room_label" text NOT NULL,
	"floor_level" integer DEFAULT 1 NOT NULL,
	"flooring_type" text,
	"general_condition" text,
	"photo_url" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_scan_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"existing_item_id" uuid,
	"change_type" text NOT NULL,
	"description" text NOT NULL,
	"photo_frame_url" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"reviewed" text DEFAULT 'false' NOT NULL,
	"reviewed_by" uuid,
	"action_taken" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_type" text DEFAULT 'full' NOT NULL,
	"scanned_by" uuid,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"duration_seconds" integer,
	"rooms_scanned" integer DEFAULT 0 NOT NULL,
	"items_cataloged" integer DEFAULT 0 NOT NULL,
	"items_confirmed" integer DEFAULT 0 NOT NULL,
	"items_flagged_for_review" integer DEFAULT 0 NOT NULL,
	"changes_detected" integer DEFAULT 0 NOT NULL,
	"scan_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "property_inventory_items" ADD CONSTRAINT "property_inventory_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_rooms" ADD CONSTRAINT "property_rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_scan_changes" ADD CONSTRAINT "property_scan_changes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_scans" ADD CONSTRAINT "property_scans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_property_category_idx" ON "property_inventory_items" USING btree ("property_id","category");--> statement-breakpoint
CREATE INDEX "inventory_property_type_idx" ON "property_inventory_items" USING btree ("property_id","item_type");--> statement-breakpoint
CREATE INDEX "inventory_brand_model_idx" ON "property_inventory_items" USING btree ("brand","model_number");--> statement-breakpoint
CREATE INDEX "inventory_age_idx" ON "property_inventory_items" USING btree ("estimated_age_years");--> statement-breakpoint
CREATE INDEX "inventory_room_idx" ON "property_inventory_items" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "property_rooms_property_idx" ON "property_rooms" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_rooms_scan_idx" ON "property_rooms" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "scan_changes_scan_idx" ON "property_scan_changes" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "scan_changes_property_idx" ON "property_scan_changes" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_scans_property_idx" ON "property_scans" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_scans_workspace_idx" ON "property_scans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "property_scans_status_idx" ON "property_scans" USING btree ("status");