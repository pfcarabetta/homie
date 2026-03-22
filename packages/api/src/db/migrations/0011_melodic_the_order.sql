ALTER TABLE "properties" ADD COLUMN "bedrooms" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "bathrooms" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "sqft" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "beds" jsonb;