import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { properties } from './properties';

export const reservations = pgTable('reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull(),
  guestName: text('guest_name'),
  guestEmail: text('guest_email'),
  guestPhone: text('guest_phone'),
  checkIn: timestamp('check_in', { withTimezone: true }).notNull(),
  checkOut: timestamp('check_out', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('confirmed'), // confirmed, checked_in, checked_out, cancelled
  guests: integer('guests'),
  source: text('source'), // e.g. 'track', 'airbnb', 'direct'
  pmsReservationId: text('pms_reservation_id'), // external ID from Track
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('reservations_property_id_idx').on(table.propertyId),
  index('reservations_workspace_id_idx').on(table.workspaceId),
  index('reservations_check_in_idx').on(table.checkIn),
  index('reservations_pms_id_idx').on(table.pmsReservationId),
]);

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
