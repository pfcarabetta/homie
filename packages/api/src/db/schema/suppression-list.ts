import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { providers } from './providers';

export const suppressionList = pgTable('suppression_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SuppressionEntry = typeof suppressionList.$inferSelect;
export type NewSuppressionEntry = typeof suppressionList.$inferInsert;
