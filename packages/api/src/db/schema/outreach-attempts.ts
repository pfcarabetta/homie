import { pgTable, uuid, text, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { providers } from './providers';

export const outreachAttempts = pgTable('outreach_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),
  scriptUsed: text('script_used'),
  status: text('status').notNull().default('pending'),
  responseRaw: text('response_raw'),
  durationSec: numeric('duration_sec', { precision: 8, scale: 3 }),
  sentimentScore: numeric('sentiment_score', { precision: 5, scale: 4 }),
  conversationState: jsonb('conversation_state'),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
});

export type OutreachAttempt = typeof outreachAttempts.$inferSelect;
export type NewOutreachAttempt = typeof outreachAttempts.$inferInsert;
