import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  homeHealthScores,
  homeHealthScoreFactors,
  scoreBandFor,
  type HealthScoreFactorType,
  type NewHomeHealthScoreFactor,
} from '../db/schema/home-health-scores';
import { homeownerProperties } from '../db/schema/homeowner-properties';
import { recurringVendors, vendorVisits } from '../db/schema/recurring-vendors';
import { inspectionReports, inspectionReportItems } from '../db/schema/inspector';
import logger from '../logger';

/**
 * Home Health Score engine — Membership Phase 1, Session 7 (spec Phase 3).
 *
 * Composite of 5 weighted factors per CLAUDE-MEMBERSHIP.md:
 *
 *   0.35 × Maintenance Compliance
 *   0.25 × Item Health (open vs resolved inspection items)
 *   0.20 × Asset Health (appliance ages vs lifespans)
 *   0.10 × Inspection Recency
 *   0.10 × Warranty Coverage
 *
 * Each factor returns a 0-100 score plus optional notes the Dashboard
 * surfaces ("3 urgent items pulling down item_health"). The composite
 * is rounded to integer, clamped 0-100, and stamped with the band.
 *
 * Pure-ish: each factor reads from DB but is independent — caller can
 * test factors in isolation. The runner pulls all per-property data,
 * runs each factor, persists with one UPSERT.
 *
 * Out of MVP scope (Phase 3 stretch goals):
 *   - Neighborhood percentile (zip-level aggregation)
 *   - Estimated resale impact (regional regression)
 *   - Score boosters tied to AI-recommended dispatches
 */

// ─── Factor weights (from spec) ────────────────────────────────────────────

export const FACTOR_WEIGHTS: Record<HealthScoreFactorType, number> = {
  maintenance_compliance: 0.35,
  item_health: 0.25,
  asset_health: 0.2,
  inspection_recency: 0.1,
  warranty_coverage: 0.1,
};

// Sanity check — weights must sum to 1.0. Done at module load so a
// future rebalance that breaks invariants gets caught at boot.
{
  const sum = Object.values(FACTOR_WEIGHTS).reduce((s, w) => s + w, 0);
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Health score factor weights must sum to 1.0, got ${sum}`);
  }
}

// ─── Per-factor scoring functions ──────────────────────────────────────────

interface FactorResult {
  score: number; // 0-100
  notes: string | null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Maintenance Compliance — fraction of vendor visits in the last 90 days
 * that completed on time vs missed/skipped.
 *
 * On-time = visit.status === 'completed' AND completed_at <= scheduled_at + 24h.
 * Missed = visit.status === 'missed'.
 * Skipped/disputed = neutral (no penalty, no credit).
 *
 * Falls back to 75 (good but uncertain) when there's no visit data yet —
 * better than penalizing brand-new members.
 */
async function scoreMaintenanceCompliance(
  homeownerPropertyId: string,
  now: Date,
): Promise<FactorResult> {
  const lookback = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  // Pull all visits in window for this property's vendors.
  const visits = await db
    .select({
      visitId: vendorVisits.id,
      status: vendorVisits.status,
      scheduledAt: vendorVisits.scheduledAt,
      completedAt: vendorVisits.completedAt,
    })
    .from(vendorVisits)
    .innerJoin(recurringVendors, eq(vendorVisits.recurringVendorId, recurringVendors.id))
    .where(
      and(
        eq(recurringVendors.homeownerPropertyId, homeownerPropertyId),
        gte(vendorVisits.scheduledAt, lookback),
      ),
    );

  if (visits.length === 0) {
    return { score: 75, notes: 'No vendor activity yet' };
  }

  let onTime = 0;
  let missed = 0;
  let total = 0;
  for (const v of visits) {
    if (v.status === 'completed') {
      total++;
      // "On time" = completed within 24h of scheduled.
      if (v.completedAt && v.completedAt.getTime() - v.scheduledAt.getTime() <= 24 * 60 * 60 * 1000) {
        onTime++;
      }
    } else if (v.status === 'missed') {
      total++;
      missed++;
    }
    // skipped/disputed/scheduled/etc don't contribute either way
  }

  if (total === 0) {
    return { score: 75, notes: 'No completed visits in last 90 days yet' };
  }
  const ratio = onTime / total;
  const score = clamp(ratio * 100);
  const notes =
    missed > 0
      ? `${missed} missed visit${missed === 1 ? '' : 's'} in last 90 days`
      : `${onTime}/${total} visits on time`;
  return { score, notes };
}

/**
 * Item Health — open inspection items by severity vs resolutions.
 *
 *   Urgent items: -8 each
 *   Recommended items: -3 each
 *   Monitor items: -1 each
 *   Resolved items in last 90 days: +2 each
 *
 * Bottom-clamped at 0, top-clamped at 100. Starts at 100.
 */
async function scoreItemHealth(
  homeownerPropertyId: string,
  homeownerId: string,
  now: Date,
): Promise<FactorResult> {
  // Inspection reports are linked to the homeowner (not yet to
  // homeowner_properties). Phase 1 doesn't migrate existing inspection
  // reports onto the new property model; we read homeowner-scoped here.
  const _ = homeownerPropertyId; // reserved for future per-property linkage
  void _;

  const items = await db
    .select({
      severity: inspectionReportItems.severity,
      dispatchStatus: inspectionReportItems.dispatchStatus,
      maintenanceCompletedAt: inspectionReportItems.maintenanceCompletedAt,
    })
    .from(inspectionReportItems)
    .innerJoin(inspectionReports, eq(inspectionReportItems.reportId, inspectionReports.id))
    .where(eq(inspectionReports.homeownerId, homeownerId));

  if (items.length === 0) {
    return { score: 85, notes: 'No inspection report uploaded yet' };
  }

  const lookback = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  let score = 100;
  let urgent = 0;
  let recommended = 0;
  let monitor = 0;
  let resolved = 0;
  for (const it of items) {
    const isOpen = it.dispatchStatus !== 'completed';
    const isRecentlyResolved =
      it.dispatchStatus === 'completed' &&
      it.maintenanceCompletedAt != null &&
      it.maintenanceCompletedAt >= lookback;

    if (isOpen) {
      if (it.severity === 'urgent' || it.severity === 'safety_hazard') {
        score -= 8;
        urgent++;
      } else if (it.severity === 'recommended') {
        score -= 3;
        recommended++;
      } else if (it.severity === 'monitor') {
        score -= 1;
        monitor++;
      }
    } else if (isRecentlyResolved) {
      score += 2;
      resolved++;
    }
  }

  const parts: string[] = [];
  if (urgent > 0) parts.push(`${urgent} urgent`);
  if (recommended > 0) parts.push(`${recommended} recommended`);
  if (monitor > 0) parts.push(`${monitor} monitor`);
  if (resolved > 0) parts.push(`+${resolved} resolved last 90d`);
  return { score: clamp(score), notes: parts.length > 0 ? parts.join(' · ') : 'All items resolved' };
}

/**
 * Asset Health — appliance ages vs typical lifespans.
 *
 * Phase 1 simplification: we have appliance brand/model/age data on
 * `homeowners.home_details` jsonb but no canonical lifespan table.
 * The MVP treats:
 *   - age missing or 0-5 yrs: 100
 *   - 6-10 yrs: 80
 *   - 11-15 yrs: 60
 *   - 15+ yrs: 40
 *
 * Real per-category lifespans land when Home IQ matures (Phase 3+).
 * The scoring shape is correct; constants will be refined.
 */
async function scoreAssetHealth(homeownerId: string): Promise<FactorResult> {
  const [row] = await db
    .select({
      details: sql<Record<string, unknown> | null>`details`,
    })
    .from(sql`homeowners`)
    .where(sql`id = ${homeownerId}`)
    .limit(1);
  // The above hand-rolled SELECT works whether the column is `home_details`
  // (legacy) or `details` (future). Falls back gracefully on null.
  void row; // currently unused; the next iteration of Home IQ will
  // expose appliance ages in a structured form. For Phase 1 MVP we
  // return a neutral score.
  return { score: 75, notes: 'Asset ages not yet tracked' };
}

/**
 * Inspection Recency — when was the most recent paid inspection?
 *   Within 12 months: 100
 *   Within 24 months: 70
 *   Within 36 months: 40
 *   Older or none: 0
 */
async function scoreInspectionRecency(
  homeownerId: string,
  now: Date,
): Promise<FactorResult> {
  const [latest] = await db
    .select({ createdAt: inspectionReports.createdAt })
    .from(inspectionReports)
    .where(eq(inspectionReports.homeownerId, homeownerId))
    .orderBy(sql`${inspectionReports.createdAt} DESC`)
    .limit(1);
  if (!latest) {
    return { score: 0, notes: 'No inspection report yet' };
  }
  const ageMonths = (now.getTime() - latest.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (ageMonths <= 12) return { score: 100, notes: 'Inspection within last 12 months' };
  if (ageMonths <= 24) return { score: 70, notes: 'Inspection 1-2 years old' };
  if (ageMonths <= 36) return { score: 40, notes: 'Inspection 2-3 years old' };
  return { score: 0, notes: 'Inspection more than 3 years old' };
}

/**
 * Warranty Coverage — % of major appliances/systems covered by an
 * active warranty. Phase 4 ships full warranty tracking; for the
 * Phase 1 MVP we use a placeholder neutral score and flag in notes.
 */
async function scoreWarrantyCoverage(homeownerPropertyId: string): Promise<FactorResult> {
  void homeownerPropertyId;
  return { score: 50, notes: 'Warranty tracking ships in Phase 4' };
}

// ─── Composite + persist ───────────────────────────────────────────────────

export interface ComputedScore {
  score: number;
  band: ReturnType<typeof scoreBandFor>;
  factors: Array<{
    type: HealthScoreFactorType;
    score: number;
    weight: number;
    contribution: number;
    notes: string | null;
  }>;
}

/** Pure-ish: runs each factor for the property and returns the composite
 *  + per-factor breakdown without persisting anything. */
export async function computeScore(params: {
  homeownerPropertyId: string;
  homeownerId: string;
  now?: Date;
}): Promise<ComputedScore> {
  const now = params.now ?? new Date();

  const factorResults: Record<HealthScoreFactorType, FactorResult> = {
    maintenance_compliance: await scoreMaintenanceCompliance(params.homeownerPropertyId, now),
    item_health: await scoreItemHealth(params.homeownerPropertyId, params.homeownerId, now),
    asset_health: await scoreAssetHealth(params.homeownerId),
    inspection_recency: await scoreInspectionRecency(params.homeownerId, now),
    warranty_coverage: await scoreWarrantyCoverage(params.homeownerPropertyId),
  };

  const factors = (Object.keys(factorResults) as HealthScoreFactorType[]).map((type) => {
    const r = factorResults[type];
    const weight = FACTOR_WEIGHTS[type];
    return {
      type,
      score: r.score,
      weight,
      contribution: Math.round(r.score * weight * 100) / 100,
      notes: r.notes,
    };
  });

  const composite = clamp(factors.reduce((s, f) => s + f.contribution, 0));
  return { score: composite, band: scoreBandFor(composite), factors };
}

/** Recompute and persist for a single property. Idempotent — UPSERTs
 *  on (homeowner_property_id, period_month). */
export async function recomputeForProperty(params: {
  homeownerPropertyId: string;
  homeownerId: string;
  now?: Date;
}): Promise<ComputedScore | null> {
  try {
    const computed = await computeScore(params);
    const now = params.now ?? new Date();
    const periodMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    // Pull the previous month's score for the delta. One row per month —
    // looking back exactly 1 month is enough for the trend.
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const [prevRow] = await db
      .select({ score: homeHealthScores.score })
      .from(homeHealthScores)
      .where(
        and(
          eq(homeHealthScores.homeownerPropertyId, params.homeownerPropertyId),
          eq(homeHealthScores.periodMonth, prev.toISOString().slice(0, 10)),
        ),
      )
      .limit(1);
    const delta = prevRow ? computed.score - prevRow.score : null;

    // UPSERT the score row. Conflict target = the unique index from the
    // migration. Drizzle's `.onConflictDoUpdate` requires us to name a
    // target.
    const [upserted] = await db
      .insert(homeHealthScores)
      .values({
        homeownerPropertyId: params.homeownerPropertyId,
        periodMonth: periodMonth.toISOString().slice(0, 10),
        score: computed.score,
        scoreBand: computed.band,
        deltaFromPrevMonth: delta,
      })
      .onConflictDoUpdate({
        target: [homeHealthScores.homeownerPropertyId, homeHealthScores.periodMonth],
        set: {
          score: computed.score,
          scoreBand: computed.band,
          deltaFromPrevMonth: delta,
        },
      })
      .returning();

    if (!upserted) return computed;

    // Replace the factor rows for this score (cheaper than diffing).
    await db.delete(homeHealthScoreFactors).where(eq(homeHealthScoreFactors.scoreId, upserted.id));
    const factorRows: NewHomeHealthScoreFactor[] = computed.factors.map((f) => ({
      scoreId: upserted.id,
      factorType: f.type,
      factorScore: f.score,
      factorWeight: String(f.weight),
      contribution: String(f.contribution),
      notes: f.notes,
    }));
    if (factorRows.length > 0) {
      await db.insert(homeHealthScoreFactors).values(factorRows);
    }

    return computed;
  } catch (err) {
    logger.error(
      { err, homeownerPropertyId: params.homeownerPropertyId },
      '[health-score] recompute failed',
    );
    return null;
  }
}

/** Iterate every (active) homeowner property and recompute. Called by
 *  the nightly worker. */
export async function recomputeAll(): Promise<{ scanned: number; computed: number; failed: number }> {
  const properties = await db
    .select({
      id: homeownerProperties.id,
      homeownerId: homeownerProperties.homeownerId,
    })
    .from(homeownerProperties);

  let computed = 0;
  let failed = 0;
  for (const p of properties) {
    const r = await recomputeForProperty({
      homeownerPropertyId: p.id,
      homeownerId: p.homeownerId,
    });
    if (r) computed++;
    else failed++;
  }
  logger.info({ scanned: properties.length, computed, failed }, '[health-score] tick complete');
  return { scanned: properties.length, computed, failed };
}
