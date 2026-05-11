import { Router, Request, Response } from 'express';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import {
  homeHealthScores,
  homeHealthScoreFactors,
} from '../db/schema/home-health-scores';
import { homeownerProperties } from '../db/schema/homeowner-properties';
import { inspectionReports, inspectionReportItems } from '../db/schema/inspector';

/**
 * Home Health Score routes (Phase 1, Session 7).
 *
 * Mounted at `/api/v1/account/health-score` under `requireAuth`. The
 * upstream `requireTier('plus', ...)` gate is added when this rolls
 * out to production — for now the routes are accessible to any
 * authenticated homeowner (the empty-state on Free is "Establishing
 * your score" since no recompute runs against a property the homeowner
 * hasn't created).
 *
 * Endpoints:
 *   GET /current               — most recent score for the primary property
 *   GET /history?months=12     — score history (max 12 months)
 *   GET /factors               — per-factor breakdown for the latest score
 *   GET /boosters              — top open inspection items by score impact
 */

const router = Router();

// ─── Helper: resolve the homeowner's primary property ─────────────────────

async function findPrimaryPropertyId(homeownerId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: homeownerProperties.id })
    .from(homeownerProperties)
    .where(
      and(
        eq(homeownerProperties.homeownerId, homeownerId),
        eq(homeownerProperties.isPrimary, true),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

// ─── GET /current ──────────────────────────────────────────────────────────

router.get('/current', async (req: Request, res: Response) => {
  try {
    const propertyId = await findPrimaryPropertyId(req.homeownerId);
    if (!propertyId) {
      res.json({ data: { score: null, band: null, message: 'No property on file' }, error: null, meta: {} });
      return;
    }
    const [latest] = await db
      .select()
      .from(homeHealthScores)
      .where(eq(homeHealthScores.homeownerPropertyId, propertyId))
      .orderBy(desc(homeHealthScores.periodMonth))
      .limit(1);
    if (!latest) {
      res.json({
        data: {
          score: null,
          band: null,
          message: 'Establishing your score',
        },
        error: null,
        meta: {},
      });
      return;
    }
    res.json({
      data: {
        score: latest.score,
        band: latest.scoreBand,
        deltaFromPrevMonth: latest.deltaFromPrevMonth,
        periodMonth: latest.periodMonth,
        neighborhoodPercentile: latest.neighborhoodPercentile,
        estimatedResaleImpactCents: latest.estimatedResaleImpactCents,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/health-score/current]');
    res.status(500).json({ data: null, error: 'Failed to load score', meta: {} });
  }
});

// ─── GET /history ──────────────────────────────────────────────────────────

router.get('/history', async (req: Request, res: Response) => {
  try {
    const months = Math.max(1, Math.min(24, parseInt((req.query.months as string) || '12', 10) || 12));
    const propertyId = await findPrimaryPropertyId(req.homeownerId);
    if (!propertyId) {
      res.json({ data: { history: [] }, error: null, meta: {} });
      return;
    }
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    const cutoffStr = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);

    const rows = await db
      .select({
        periodMonth: homeHealthScores.periodMonth,
        score: homeHealthScores.score,
        band: homeHealthScores.scoreBand,
        delta: homeHealthScores.deltaFromPrevMonth,
      })
      .from(homeHealthScores)
      .where(
        and(
          eq(homeHealthScores.homeownerPropertyId, propertyId),
          gte(homeHealthScores.periodMonth, cutoffStr),
        ),
      )
      .orderBy(homeHealthScores.periodMonth);

    res.json({ data: { history: rows }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/health-score/history]');
    res.status(500).json({ data: null, error: 'Failed to load history', meta: {} });
  }
});

// ─── GET /factors ──────────────────────────────────────────────────────────

router.get('/factors', async (req: Request, res: Response) => {
  try {
    const propertyId = await findPrimaryPropertyId(req.homeownerId);
    if (!propertyId) {
      res.json({ data: { factors: [] }, error: null, meta: {} });
      return;
    }
    const [latest] = await db
      .select({ id: homeHealthScores.id })
      .from(homeHealthScores)
      .where(eq(homeHealthScores.homeownerPropertyId, propertyId))
      .orderBy(desc(homeHealthScores.periodMonth))
      .limit(1);
    if (!latest) {
      res.json({ data: { factors: [] }, error: null, meta: {} });
      return;
    }
    const factors = await db
      .select({
        type: homeHealthScoreFactors.factorType,
        score: homeHealthScoreFactors.factorScore,
        weight: homeHealthScoreFactors.factorWeight,
        contribution: homeHealthScoreFactors.contribution,
        notes: homeHealthScoreFactors.notes,
      })
      .from(homeHealthScoreFactors)
      .where(eq(homeHealthScoreFactors.scoreId, latest.id));
    res.json({ data: { factors }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/health-score/factors]');
    res.status(500).json({ data: null, error: 'Failed to load factors', meta: {} });
  }
});

// ─── GET /open-items-summary ───────────────────────────────────────────────
//
// Counts of open (non-completed) inspection items across all the
// homeowner's reports, broken down by severity. Drives the dashboard
// "Open inspection items" stat tile.

router.get('/open-items-summary', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        severity: inspectionReportItems.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(inspectionReportItems)
      .innerJoin(inspectionReports, eq(inspectionReportItems.reportId, inspectionReports.id))
      .where(
        and(
          eq(inspectionReports.homeownerId, req.homeownerId),
          sql`${inspectionReportItems.dispatchStatus} != 'completed' OR ${inspectionReportItems.dispatchStatus} IS NULL`,
          // Informational items aren't actionable — leave them out of
          // the count so the tile reflects "things that need attention."
          sql`${inspectionReportItems.severity} != 'informational'`,
        ),
      )
      .groupBy(inspectionReportItems.severity);

    const counts: Record<string, number> = {
      safety_hazard: 0,
      urgent: 0,
      recommended: 0,
      monitor: 0,
    };
    let total = 0;
    for (const r of rows) {
      counts[r.severity] = r.count;
      total += r.count;
    }
    res.json({
      data: {
        total,
        bySeverity: counts,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/health-score/open-items-summary]');
    res.status(500).json({ data: null, error: 'Failed to load summary', meta: {} });
  }
});

// ─── GET /boosters ─────────────────────────────────────────────────────────
//
// Top open inspection items sorted by score impact (urgent > recommended >
// monitor). Limit 5 per spec ("top 3" but allow 5 for the dashboard
// surface to give the homeowner room).

router.get('/boosters', async (req: Request, res: Response) => {
  try {
    const items = await db
      .select({
        id: inspectionReportItems.id,
        reportId: inspectionReportItems.reportId,
        title: inspectionReportItems.title,
        severity: inspectionReportItems.severity,
        category: inspectionReportItems.category,
        location: inspectionReportItems.locationInProperty,
        costEstimateLow: inspectionReportItems.aiCostEstimateLowCents,
        costEstimateHigh: inspectionReportItems.aiCostEstimateHighCents,
      })
      .from(inspectionReportItems)
      .innerJoin(inspectionReports, eq(inspectionReportItems.reportId, inspectionReports.id))
      .where(
        and(
          eq(inspectionReports.homeownerId, req.homeownerId),
          // "Open" = not yet completed via dispatch
          sql`${inspectionReportItems.dispatchStatus} != 'completed' OR ${inspectionReportItems.dispatchStatus} IS NULL`,
        ),
      )
      .orderBy(
        // Severity sort: urgent + safety_hazard top, then recommended, then monitor
        sql`CASE ${inspectionReportItems.severity}
              WHEN 'safety_hazard' THEN 0
              WHEN 'urgent' THEN 1
              WHEN 'recommended' THEN 2
              WHEN 'monitor' THEN 3
              ELSE 4 END`,
      )
      .limit(5);

    // Compute the score impact each item is currently inflicting (matches
    // the constants in services/health-score.ts:scoreItemHealth).
    const enriched = items.map((it) => {
      let impact = 0;
      if (it.severity === 'urgent' || it.severity === 'safety_hazard') impact = 8;
      else if (it.severity === 'recommended') impact = 3;
      else if (it.severity === 'monitor') impact = 1;
      return { ...it, scoreImpact: impact };
    });
    res.json({ data: { boosters: enriched }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/health-score/boosters]');
    res.status(500).json({ data: null, error: 'Failed to load boosters', meta: {} });
  }
});

export default router;
