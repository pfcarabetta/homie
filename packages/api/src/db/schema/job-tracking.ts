import { pgTable, uuid, text, varchar, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const TRACKING_EVENT_TYPES = [
  'reported',
  'dispatched',
  'provider_contacted',
  'provider_responded',
  'provider_booked',
  'provider_en_route',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type TrackingEventType = (typeof TRACKING_EVENT_TYPES)[number];

export const jobTrackingLinks = pgTable(
  'job_tracking_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    trackingToken: varchar('tracking_token', { length: 32 }).notNull().unique(),
    notifyPhone: varchar('notify_phone', { length: 20 }),
    notifyEmail: varchar('notify_email', { length: 255 }),
    propertyName: varchar('property_name', { length: 255 }).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('job_tracking_links_token_idx').on(table.trackingToken),
    index('job_tracking_links_job_id_idx').on(table.jobId),
  ],
);

export const jobTrackingEvents = pgTable(
  'job_tracking_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    eventType: text('event_type').$type<TrackingEventType>().notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('job_tracking_events_job_id_idx').on(table.jobId)],
);

export type JobTrackingLink = typeof jobTrackingLinks.$inferSelect;
export type NewJobTrackingLink = typeof jobTrackingLinks.$inferInsert;
export type JobTrackingEvent = typeof jobTrackingEvents.$inferSelect;
export type NewJobTrackingEvent = typeof jobTrackingEvents.$inferInsert;
