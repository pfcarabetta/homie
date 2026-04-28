ALTER TABLE "inspection_reports" ADD COLUMN "referrer_partner_id" uuid REFERENCES "inspector_partners"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "inspection_report_referrer_idx" ON "inspection_reports" ("referrer_partner_id");
