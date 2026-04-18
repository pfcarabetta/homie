import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Workspace owner (Business product). Mutually exclusive with homeownerId. */
  workspaceId: uuid('workspace_id'),
  /** Homeowner owner (consumer product). Mutually exclusive with workspaceId. */
  homeownerId: uuid('homeowner_id'),
  type: text('type').notNull(), // dispatch_created, provider_response, booking_confirmed, job_completed, guest_issue, outreach_failed
  title: text('title').notNull(),
  body: text('body').notNull(),
  jobId: uuid('job_id'), // optional link to a dispatch
  propertyId: uuid('property_id'), // optional link to a property
  guestIssueId: uuid('guest_issue_id'), // optional link to a guest issue
  bookingId: uuid('booking_id'), // optional link to a booking
  link: text('link'), // optional URL/route to navigate to
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  workspaceIdx: index('notifications_workspace_id_idx').on(t.workspaceId),
  homeownerIdx: index('notifications_homeowner_id_idx').on(t.homeownerId),
  createdIdx: index('notifications_created_at_idx').on(t.createdAt),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
