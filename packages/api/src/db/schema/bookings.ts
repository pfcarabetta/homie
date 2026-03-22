import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { providers } from './providers';
import { providerResponses } from './provider-responses';

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  homeownerId: uuid('homeowner_id').notNull(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  responseId: uuid('response_id').references(() => providerResponses.id, { onDelete: 'set null' }),
  serviceAddress: text('service_address'),
  status: text('status').notNull().default('confirmed'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
