import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Support contact form submissions. Each row is one inbound from
 * /support's contact modal — preserved for audit + reply tracking even
 * after the email goes out to yo@homiepro.ai.
 */
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** homie | inspect | business */
  product: text('product').notNull(),
  /** Optional — empty if anonymous on the support page */
  name: text('name'),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  /** Captured client-side at submit time — useful for triage */
  currentUrl: text('current_url'),
  /** Auto-set when user is logged in */
  homeownerId: uuid('homeowner_id'),
  workspaceId: uuid('workspace_id'),
  /** open | replied | closed */
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
}, (t) => [
  index('support_tickets_email_idx').on(t.email),
  index('support_tickets_status_idx').on(t.status),
]);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
