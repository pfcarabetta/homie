import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { homeowners } from './homeowners';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  plan: text('plan').notNull().default('starter'),
  stripeCustomerId: text('stripe_customer_id'),
  ownerId: uuid('owner_id').notNull().references(() => homeowners.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
