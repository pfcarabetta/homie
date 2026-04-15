ALTER TABLE "inspection_report_items" ADD COLUMN "is_included_in_request" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inspection_report_items" ADD COLUMN "homeowner_notes" text;--> statement-breakpoint
ALTER TABLE "inspection_report_items" ADD COLUMN "seller_agreed_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "inspection_report_items" ADD COLUMN "credit_issued_cents" integer;--> statement-breakpoint
ALTER TABLE "inspection_report_items" ADD COLUMN "concession_status" text;