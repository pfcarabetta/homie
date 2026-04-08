import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { properties } from './properties';
import { reservations } from './reservations';
import { guestIssueCategories } from './guest-issue-categories';
import { jobs } from './jobs';

export const guestIssues = pgTable(
  'guest_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    reservationId: uuid('reservation_id')
      .references(() => reservations.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => guestIssueCategories.id),
    guestName: varchar('guest_name', { length: 255 }),
    guestEmail: varchar('guest_email', { length: 255 }),
    guestPhone: varchar('guest_phone', { length: 20 }),
    description: text('description'),
    severity: text('severity').notNull().default('medium'), // 'low', 'medium', 'high', 'urgent'
    status: text('status').notNull().default('reported'), // 'reported', 'pm_reviewing', 'approved', 'dispatching', 'provider_responding', 'provider_booked', 'resolved', 'closed', 'self_resolved'
    troubleshootLog: jsonb('troubleshoot_log'),
    selfResolved: boolean('self_resolved').default(false),
    isRecurring: boolean('is_recurring').default(false),
    recurringCount: integer('recurring_count').default(0),
    autoDispatched: boolean('auto_dispatched').default(false),
    autoDispatchRuleId: uuid('auto_dispatch_rule_id'),
    dispatchedJobId: uuid('dispatched_job_id')
      .references(() => jobs.id),
    pmApprovedBy: uuid('pm_approved_by'),
    pmApprovedAt: timestamp('pm_approved_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    guestSatisfactionRating: text('guest_satisfaction_rating'), // 'positive', 'negative'
    guestSatisfactionComment: text('guest_satisfaction_comment'),
    language: varchar('language', { length: 5 }).default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('guest_issues_workspace_id_idx').on(table.workspaceId),
    index('guest_issues_property_id_idx').on(table.propertyId),
    index('guest_issues_status_idx').on(table.status),
    index('guest_issues_category_id_idx').on(table.categoryId),
  ],
);

export type GuestIssue = typeof guestIssues.$inferSelect;
export type NewGuestIssue = typeof guestIssues.$inferInsert;
