import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const homeowners = pgTable('homeowners', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  phone: text('phone'),
  zipCode: text('zip_code').notNull(),
  membershipTier: text('membership_tier').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Homeowner = typeof homeowners.$inferSelect;
export type NewHomeowner = typeof homeowners.$inferInsert;
