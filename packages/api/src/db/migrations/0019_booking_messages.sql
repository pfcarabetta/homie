CREATE TABLE IF NOT EXISTS "booking_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "sender_type" TEXT NOT NULL,
  "sender_id" TEXT,
  "sender_name" TEXT,
  "content" TEXT NOT NULL,
  "read_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "booking_messages_booking_id_idx" ON "booking_messages"("booking_id");
CREATE INDEX IF NOT EXISTS "booking_messages_created_at_idx" ON "booking_messages"("created_at");
