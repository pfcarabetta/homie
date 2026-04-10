import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { guestIssueCategories } from './guest-issue-categories';

export const guestAutoDispatchRules = pgTable(
  'guest_auto_dispatch_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => guestIssueCategories.id),
    minSeverity: text('min_severity').notNull().default('high'),
    preferredVendorId: uuid('preferred_vendor_id'),
    isEnabled: boolean('is_enabled').default(true),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('guest_auto_dispatch_rules_workspace_id_idx').on(table.workspaceId),
  ],
);

export type GuestAutoDispatchRule = typeof guestAutoDispatchRules.$inferSelect;
export type NewGuestAutoDispatchRule = typeof guestAutoDispatchRules.$inferInsert;
