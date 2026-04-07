import { pgTable, uuid, text, timestamp, integer, boolean, jsonb } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { providers } from './providers';
import { properties } from './properties';

// Schedule format: { mon: { start: "08:00", end: "17:00" }, tue: {...}, ... }
// null = available all days/times (no restrictions)
export interface VendorSchedule {
  [day: string]: { start: string; end: string } | null; // null = unavailable that day
}

export const preferredVendors = pgTable('preferred_vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  categories: text('categories').array(),
  priority: integer('priority').notNull().default(0),
  notes: text('notes'),
  availabilitySchedule: jsonb('availability_schedule').$type<VendorSchedule>(),
  skipQuote: boolean('skip_quote').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PreferredVendor = typeof preferredVendors.$inferSelect;
export type NewPreferredVendor = typeof preferredVendors.$inferInsert;
