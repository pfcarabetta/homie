import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';

export const bookingMessages = pgTable('booking_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  /** 'team' = property manager sent, 'provider' = provider replied via SMS, 'system' = automated */
  senderType: text('sender_type').notNull(),
  /** homeownerId of the team member who sent (null for provider/system) */
  senderId: text('sender_id'),
  /** Display name of sender */
  senderName: text('sender_name'),
  /** Allow empty content when there's a photo attachment */
  content: text('content').notNull().default(''),
  /** Optional photo attachment, stored as a data URL (data:image/...;base64,...) */
  photoUrl: text('photo_url'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('booking_messages_booking_id_idx').on(table.bookingId),
  index('booking_messages_created_at_idx').on(table.createdAt),
]);
