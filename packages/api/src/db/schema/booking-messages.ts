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
  content: text('content').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('booking_messages_booking_id_idx').on(table.bookingId),
  index('booking_messages_created_at_idx').on(table.createdAt),
]);
