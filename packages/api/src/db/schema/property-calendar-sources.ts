import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { properties } from './properties';

/**
 * iCal feed (or PMS sync) configuration for a property's reservation calendar.
 * Both sources feed reservations into the same `reservations` table.
 */
export const propertyCalendarSources = pgTable('property_calendar_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull(),
  /** 'ical_url' for direct iCal feeds, 'pms_sync' for Track/Guesty/etc */
  sourceType: text('source_type').notNull().default('ical_url'),
  /** The iCal feed URL (e.g. Airbnb, VRBO export link) */
  icalUrl: text('ical_url'),
  /** How often to poll the feed, in minutes */
  syncFrequencyMinutes: integer('sync_frequency_minutes').notNull().default(60),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  /** 'success', 'failed', 'never_synced', 'paused' */
  lastSyncStatus: text('last_sync_status').notNull().default('never_synced'),
  lastSyncError: text('last_sync_error'),
  /** Number of reservation events found on the most recent successful sync */
  eventsFound: integer('events_found').notNull().default(0),
  /** Consecutive failure count — at 5+ we pause and notify the PM */
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('calendar_sources_property_idx').on(table.propertyId),
  index('calendar_sources_workspace_idx').on(table.workspaceId),
  index('calendar_sources_next_sync_idx').on(table.lastSyncAt),
]);

export type PropertyCalendarSource = typeof propertyCalendarSources.$inferSelect;
export type NewPropertyCalendarSource = typeof propertyCalendarSources.$inferInsert;
