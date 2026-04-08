import { pgTable, uuid, varchar, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const guestIssueCategories = pgTable(
  'guest_issue_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: varchar('name', { length: 100 }).notNull(),
    icon: varchar('icon', { length: 10 }),
    description: varchar('description', { length: 255 }),
    color: varchar('color', { length: 7 }),
    type: text('type').notNull().default('other'), // 'repair', 'service', 'safety', 'other'
    hasTroubleshooting: boolean('has_troubleshooting').default(false),
    displayOrder: integer('display_order'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('guest_issue_categories_workspace_id_idx').on(table.workspaceId),
  ],
);

export type GuestIssueCategory = typeof guestIssueCategories.$inferSelect;
export type NewGuestIssueCategory = typeof guestIssueCategories.$inferInsert;
