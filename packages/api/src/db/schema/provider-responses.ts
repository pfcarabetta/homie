import { pgTable, uuid, text, timestamp, numeric } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { providers } from './providers';
import { outreachAttempts } from './outreach-attempts';

export const providerResponses = pgTable('provider_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  outreachAttemptId: uuid('outreach_attempt_id').references(() => outreachAttempts.id, {
    onDelete: 'set null',
  }),
  channel: text('channel').notNull(),
  quotedPrice: text('quoted_price'),
  availability: text('availability'),
  message: text('message'),
  ratingAtTime: numeric('rating_at_time', { precision: 3, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProviderResponse = typeof providerResponses.$inferSelect;
export type NewProviderResponse = typeof providerResponses.$inferInsert;
