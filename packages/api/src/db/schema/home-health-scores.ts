import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { homeownerProperties } from './homeowner-properties';

/**
 * Home Health Score (Phase 3 / Session 7).
 *
 * One row per (homeowner_property, period_month). Recomputed nightly by
 * services/health-score-worker.ts; the latest row drives the Dashboard
 * hero. Older rows feed the trend visualization.
 *
 * The 5-factor breakdown lives in `home_health_score_factors` with a
 * cascade FK back to the parent score row. Each factor row records the
 * raw score (0-100), weight (constant per factor type, but stored for
 * historical fidelity if we ever rebalance), and contribution
 * (factor_score × factor_weight).
 */

// ─── Allowed-value constants ───────────────────────────────────────────────

export const HEALTH_SCORE_BANDS = ['excellent', 'good', 'needs_work', 'concerning'] as const;
export type HealthScoreBand = (typeof HEALTH_SCORE_BANDS)[number];

export const HEALTH_SCORE_FACTOR_TYPES = [
  'maintenance_compliance',
  'item_health',
  'asset_health',
  'inspection_recency',
  'warranty_coverage',
] as const;
export type HealthScoreFactorType = (typeof HEALTH_SCORE_FACTOR_TYPES)[number];

/** Pure helper — convert a 0-100 numeric score to its band per the spec. */
export function scoreBandFor(score: number): HealthScoreBand {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'needs_work';
  return 'concerning';
}

// ─── home_health_scores ────────────────────────────────────────────────────

export const homeHealthScores = pgTable(
  'home_health_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    homeownerPropertyId: uuid('homeowner_property_id')
      .notNull()
      .references(() => homeownerProperties.id, { onDelete: 'cascade' }),
    /** First day of the month this score covers (e.g. 2026-05-01 for May). */
    periodMonth: date('period_month').notNull(),
    /** 0-100 composite. */
    score: integer('score').notNull(),
    /** Allowed values: HEALTH_SCORE_BANDS. */
    scoreBand: text('score_band').notNull(),
    /** Signed delta from the previous month's score. Null on first run. */
    deltaFromPrevMonth: integer('delta_from_prev_month'),
    /** 0-100. Null when fewer than 10 members in the same zip. */
    neighborhoodPercentile: integer('neighborhood_percentile'),
    /** Estimated resale impact in cents. Null when the regional model
     *  isn't statistically meaningful (Phase 3 stretch — left null in
     *  the MVP build). */
    estimatedResaleImpactCents: integer('estimated_resale_impact_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('home_health_scores_prop_period_uniq').on(
      table.homeownerPropertyId,
      table.periodMonth,
    ),
    index('home_health_scores_prop_period_desc_idx').on(
      table.homeownerPropertyId,
      table.periodMonth.desc(),
    ),
  ],
);

export type HomeHealthScore = typeof homeHealthScores.$inferSelect;
export type NewHomeHealthScore = typeof homeHealthScores.$inferInsert;

// ─── home_health_score_factors ─────────────────────────────────────────────

export const homeHealthScoreFactors = pgTable(
  'home_health_score_factors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoreId: uuid('score_id')
      .notNull()
      .references(() => homeHealthScores.id, { onDelete: 'cascade' }),
    /** Allowed values: HEALTH_SCORE_FACTOR_TYPES. */
    factorType: text('factor_type').notNull(),
    /** 0-100 raw score for this factor. */
    factorScore: integer('factor_score').notNull(),
    /** Weight constant (sums to 1.00 across the 5 factors per spec). */
    factorWeight: numeric('factor_weight', { precision: 3, scale: 2 }).notNull(),
    /** factor_score × factor_weight (precomputed for cheap aggregation). */
    contribution: numeric('contribution', { precision: 5, scale: 2 }).notNull(),
    /** Optional human-readable notes — surfaced to the Dashboard
     *  factors panel ("3 maintenance items overdue", "2 appliances past
     *  EOL", etc.). */
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('home_health_score_factors_score_idx').on(table.scoreId),
  ],
);

export type HomeHealthScoreFactor = typeof homeHealthScoreFactors.$inferSelect;
export type NewHomeHealthScoreFactor = typeof homeHealthScoreFactors.$inferInsert;
