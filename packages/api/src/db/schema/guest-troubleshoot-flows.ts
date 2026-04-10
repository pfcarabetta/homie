import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { guestIssueCategories } from './guest-issue-categories';

export const guestTroubleshootFlows = pgTable(
  'guest_troubleshoot_flows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => guestIssueCategories.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(),
    question: text('question').notNull(),
    options: jsonb('options').$type<string[]>().notNull(),
    isResolutionOption: varchar('is_resolution_option', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('guest_troubleshoot_flows_category_id_idx').on(table.categoryId),
  ],
);

export type GuestTroubleshootFlow = typeof guestTroubleshootFlows.$inferSelect;
export type NewGuestTroubleshootFlow = typeof guestTroubleshootFlows.$inferInsert;
