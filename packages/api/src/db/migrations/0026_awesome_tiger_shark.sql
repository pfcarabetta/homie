ALTER TABLE "dispatch_schedule_runs" ADD COLUMN "reservation_id" uuid;--> statement-breakpoint
CREATE INDEX "schedule_runs_reservation_idx" ON "dispatch_schedule_runs" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "schedule_runs_scheduled_for_idx" ON "dispatch_schedule_runs" USING btree ("scheduled_for");