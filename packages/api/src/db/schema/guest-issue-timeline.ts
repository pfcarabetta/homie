import { pgTable, uuid, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { guestIssues } from './guest-issues';

export const guestIssueTimeline = pgTable(
  'guest_issue_timeline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => guestIssues.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('guest_issue_timeline_issue_id_idx').on(table.issueId),
  ],
);

export type GuestIssueTimelineEntry = typeof guestIssueTimeline.$inferSelect;
export type NewGuestIssueTimelineEntry = typeof guestIssueTimeline.$inferInsert;
