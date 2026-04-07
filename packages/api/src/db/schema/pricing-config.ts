import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const pricingConfig = pgTable('pricing_config', {
  id: text('id').primaryKey().default('singleton'),
  config: jsonb('config').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PricingConfigRow = typeof pricingConfig.$inferSelect;
