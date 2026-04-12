-- Enable consumer home scans by making property_id/workspace_id nullable
-- and adding homeowner_id columns for direct homeowner-to-scan linkage.

ALTER TABLE property_scans ALTER COLUMN property_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE property_scans ALTER COLUMN workspace_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE property_scans ADD COLUMN IF NOT EXISTS homeowner_id uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS property_scans_homeowner_idx ON property_scans (homeowner_id);
--> statement-breakpoint
ALTER TABLE property_rooms ALTER COLUMN property_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE property_rooms ADD COLUMN IF NOT EXISTS homeowner_id uuid;
--> statement-breakpoint
ALTER TABLE property_inventory_items ALTER COLUMN property_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE property_inventory_items ADD COLUMN IF NOT EXISTS homeowner_id uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS inventory_homeowner_idx ON property_inventory_items (homeowner_id);
