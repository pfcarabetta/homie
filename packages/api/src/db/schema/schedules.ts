import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index, varchar } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { properties } from './properties';
import { providers } from './providers';
import { jobs } from './jobs';

// ── Schedule Templates ──────────────────────────────────────────────────────

export const scheduleTemplates = pgTable('schedule_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: varchar('category', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  suggestedCadenceType: text('suggested_cadence_type'),
  suggestedCadenceConfig: jsonb('suggested_cadence_config'),
  propertyTypes: text('property_types').array(),
  climateZones: text('climate_zones').array(),
  amenityTags: text('amenity_tags').array(),
  estimatedCostRange: varchar('estimated_cost_range', { length: 50 }),
  whyItMatters: text('why_it_matters'),
  seasonalRelevance: text('seasonal_relevance').array(),
  sortPriority: integer('sort_priority').notNull().default(50),
  isSystem: boolean('is_system').notNull().default(true),
  source: text('source').notNull().default('system'),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduleTemplate = typeof scheduleTemplates.$inferSelect;
export type NewScheduleTemplate = typeof scheduleTemplates.$inferInsert;

// ── Dispatch Schedules ──────────────────────────────────────────────────────

export interface CadenceConfig {
  dayOfWeek?: number;       // 0-6 (Sun-Sat)
  dayOfMonth?: number;      // 1-31
  months?: number[];        // 1-12
  interval?: number;        // every N units
  unit?: string;            // 'days' | 'weeks' | 'months'
  timeOfDay?: string;       // "09:00"
  [key: string]: unknown;
}

export const dispatchSchedules = pgTable(
  'dispatch_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    templateId: uuid('template_id').references(() => scheduleTemplates.id),
    category: varchar('category', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    cadenceType: text('cadence_type').notNull(),
    cadenceConfig: jsonb('cadence_config').$type<CadenceConfig>(),
    preferredProviderId: uuid('preferred_provider_id').references(() => providers.id),
    agreedRateCents: integer('agreed_rate_cents'),
    autoBook: boolean('auto_book').notNull().default(true),
    autoBookMaxCents: integer('auto_book_max_cents'),
    advanceDispatchHours: integer('advance_dispatch_hours').notNull().default(48),
    escalationWindowMinutes: integer('escalation_window_minutes').notNull().default(120),
    fallbackToMarketplace: boolean('fallback_to_marketplace').notNull().default(true),
    blackoutDates: jsonb('blackout_dates').$type<string[]>(),
    status: text('status').notNull().default('active'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastDispatchedAt: timestamp('last_dispatched_at', { withTimezone: true }),
    nextDispatchAt: timestamp('next_dispatch_at', { withTimezone: true }),
  },
  (table) => [
    index('dispatch_sched_ws_status_idx').on(table.workspaceId, table.status),
    index('dispatch_sched_next_idx').on(table.nextDispatchAt, table.status),
  ],
);

export type DispatchSchedule = typeof dispatchSchedules.$inferSelect;
export type NewDispatchSchedule = typeof dispatchSchedules.$inferInsert;

// ── Dispatch Schedule Runs ──────────────────────────────────────────────────

export const dispatchScheduleRuns = pgTable('dispatch_schedule_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: uuid('schedule_id')
    .notNull()
    .references(() => dispatchSchedules.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  status: text('status').notNull().default('pending'),
  providerId: uuid('provider_id').references(() => providers.id),
  confirmedRateCents: integer('confirmed_rate_cents'),
  failureReason: text('failure_reason'),
  requiredIntervention: boolean('required_intervention').notNull().default(false),
  interventionType: varchar('intervention_type', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DispatchScheduleRun = typeof dispatchScheduleRuns.$inferSelect;
export type NewDispatchScheduleRun = typeof dispatchScheduleRuns.$inferInsert;
