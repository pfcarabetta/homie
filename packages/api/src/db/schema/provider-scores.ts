import { pgTable, uuid, numeric, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { providers } from './providers';

export const providerScores = pgTable(
  'provider_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    acceptanceRate: numeric('acceptance_rate', { precision: 5, scale: 4 }),
    avgResponseSec: numeric('avg_response_sec', { precision: 10, scale: 2 }),
    completionRate: numeric('completion_rate', { precision: 5, scale: 4 }),
    avgHomeownerRating: numeric('avg_homeowner_rating', { precision: 3, scale: 2 }),
    totalOutreach: integer('total_outreach').notNull().default(0),
    totalAccepted: integer('total_accepted').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('provider_scores_provider_id_idx').on(table.providerId)],
);

export type ProviderScore = typeof providerScores.$inferSelect;
export type NewProviderScore = typeof providerScores.$inferInsert;
