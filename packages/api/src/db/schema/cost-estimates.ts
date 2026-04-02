import { pgTable, uuid, text, varchar, timestamp, integer, numeric, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { workspaces } from './workspaces';
import { providers } from './providers';

export const repairCostData = pgTable('repair_cost_data', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  zipCode: varchar('zip_code', { length: 10 }),
  category: varchar('category', { length: 50 }).notNull(),
  subcategory: varchar('subcategory', { length: 100 }).notNull(),
  complexity: text('complexity').notNull().default('moderate'), // simple, moderate, complex, major
  quotedPriceCents: integer('quoted_price_cents'),
  acceptedPriceCents: integer('accepted_price_cents'),
  actualPriceCents: integer('actual_price_cents'),
  providerId: uuid('provider_id').references(() => providers.id),
  propertyType: varchar('property_type', { length: 50 }),
  dataSource: text('data_source').notNull().default('industry_benchmark'), // outreach_quote, manual_entry, industry_benchmark
  region: varchar('region', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('repair_cost_cat_sub_zip_idx').on(table.category, table.subcategory, table.zipCode),
  index('repair_cost_cat_region_idx').on(table.category, table.region),
  index('repair_cost_created_idx').on(table.createdAt),
]);

export const costEstimateLog = pgTable('cost_estimate_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: varchar('session_id', { length: 255 }),
  jobId: uuid('job_id').references(() => jobs.id),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  zipCode: varchar('zip_code', { length: 10 }),
  category: varchar('category', { length: 50 }),
  subcategory: varchar('subcategory', { length: 100 }),
  complexity: text('complexity'),
  photoAnalyzed: boolean('photo_analyzed').default(false),
  estimateLowCents: integer('estimate_low_cents'),
  estimateHighCents: integer('estimate_high_cents'),
  estimateMedianCents: integer('estimate_median_cents'),
  confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
  dataPointsUsed: integer('data_points_used'),
  adjustmentFactors: jsonb('adjustment_factors'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RepairCostData = typeof repairCostData.$inferSelect;
export type CostEstimateLog = typeof costEstimateLog.$inferSelect;
