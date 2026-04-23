import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { repairCostData } from '../db/schema/cost-estimates';
import { generateEstimate } from '../services/cost-estimator';
import logger from '../logger';
import { ApiResponse } from '../types/api';

const router = Router();

// ── Neighborhood benchmarking ─────────────────────────────────────────
// Shown as a trust chip beneath the diagnosis card: "12 dishwasher jobs
// in 92119 last 90 days · median $180". Aggregates the same
// repair_cost_data rows the cost estimator uses, but returns raw counts
// + percentiles so the UI can show the social-proof angle, not just a
// point estimate.
//
// Privacy floor: we only return aggregates when N >= MIN_SAMPLES.
// Smaller buckets could identify individual jobs (one homeowner in a
// sparse zip, one price), so below the floor we return eligible: false
// and the chip hides itself. No PII is ever included.
const MIN_SAMPLES_FOR_STATS = 5;
const WINDOW_DAYS = 90;

router.get('/neighborhood-stats', async (req: Request, res: Response) => {
  try {
    const zipCode = String(req.query.zip ?? '').trim();
    const category = String(req.query.category ?? '').trim().toLowerCase();
    const subcategory = String(req.query.subcategory ?? '').trim().toLowerCase() || null;

    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      res.status(400).json({ data: null, error: 'Valid 5-digit zip required', meta: {} });
      return;
    }
    if (!category) {
      res.status(400).json({ data: null, error: 'Category required', meta: {} });
      return;
    }

    // Pull quoted prices in the last 90 days — zip-first, narrow to
    // subcategory if supplied. Pure SQL aggregate since we only need
    // count + percentiles + min/max.
    type StatsRow = {
      count: number;
      median_cents: number | null;
      p25_cents: number | null;
      p75_cents: number | null;
      min_cents: number | null;
      max_cents: number | null;
    };
    // PERCENTILE_CONT returns null when the set is empty, so we wrap the
    // whole query with a NULL-safe count check in the frontend.
    const rows = await db.execute<StatsRow>(sql`
      SELECT
        COUNT(*)::int AS count,
        PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY quoted_price_cents)::int AS median_cents,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY quoted_price_cents)::int AS p25_cents,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY quoted_price_cents)::int AS p75_cents,
        MIN(quoted_price_cents)::int AS min_cents,
        MAX(quoted_price_cents)::int AS max_cents
      FROM repair_cost_data
      WHERE zip_code = ${zipCode}
        AND category = ${category}
        ${subcategory ? sql`AND subcategory = ${subcategory}` : sql``}
        AND quoted_price_cents IS NOT NULL
        AND created_at >= NOW() - INTERVAL '${sql.raw(String(WINDOW_DAYS))} days'
    `);
    const stats = rows[0];
    const count = stats?.count ?? 0;

    if (count < MIN_SAMPLES_FOR_STATS) {
      res.json({
        data: { eligible: false, count, minSamples: MIN_SAMPLES_FOR_STATS, windowDays: WINDOW_DAYS, zip: zipCode, category, subcategory },
        error: null,
        meta: {},
      });
      return;
    }

    res.json({
      data: {
        eligible: true,
        count,
        medianCents: stats.median_cents,
        p25Cents: stats.p25_cents,
        p75Cents: stats.p75_cents,
        minCents: stats.min_cents,
        maxCents: stats.max_cents,
        windowDays: WINDOW_DAYS,
        zip: zipCode,
        category,
        subcategory,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[estimates] Failed to fetch neighborhood stats');
    res.status(500).json({ data: null, error: 'Failed to fetch neighborhood stats', meta: {} });
  }
});

// POST /generate — generate a cost estimate
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const category = (body.category ?? body.category) as string | undefined;
    const subcategory = (body.subcategory ?? body.subcategory) as string | undefined;
    const complexity = (body.complexity) as string | undefined;
    const zipCode = (body.zip_code ?? body.zipCode) as string | undefined;
    const workspaceId = (body.workspace_id ?? body.workspaceId) as string | undefined;
    const propertyType = (body.property_type ?? body.propertyType) as string | undefined;
    const brand = (body.brand) as string | undefined;
    const systemAgeYears = (body.system_age_years ?? body.systemAgeYears) as number | undefined;
    const urgency = (body.urgency) as string | undefined;
    const photoAnalysisSummary = (body.photo_analysis_summary ?? body.photoAnalysisSummary) as string | undefined;

    if (!category || !subcategory || !zipCode) {
      const response: ApiResponse<null> = { data: null, error: 'category, subcategory, and zipCode are required', meta: {} };
      res.status(400).json(response);
      return;
    }

    const estimate = await generateEstimate({
      category, subcategory, complexity, zipCode, workspaceId, propertyType, brand, systemAgeYears, urgency, photoAnalysisSummary,
    });

    const response: ApiResponse<typeof estimate> = { data: estimate, error: null, meta: {} };
    res.json(response);
  } catch (err) {
    logger.error({ err }, '[estimates] Failed to generate estimate');
    const message = err instanceof Error ? err.message : 'Failed to generate estimate';
    const response: ApiResponse<null> = { data: null, error: message, meta: {} };
    res.status(500).json(response);
  }
});

// POST /record — record a new repair cost data point
router.post('/record', async (req: Request, res: Response) => {
  try {
    const { jobId, workspaceId, zipCode, category, subcategory, complexity, quotedPriceCents, acceptedPriceCents, actualPriceCents, providerId, propertyType, dataSource, region } = req.body as {
      jobId?: string;
      workspaceId?: string;
      zipCode?: string;
      category?: string;
      subcategory?: string;
      complexity?: string;
      quotedPriceCents?: number;
      acceptedPriceCents?: number;
      actualPriceCents?: number;
      providerId?: string;
      propertyType?: string;
      dataSource?: string;
      region?: string;
    };

    if (!category || !subcategory) {
      const response: ApiResponse<null> = { data: null, error: 'category and subcategory are required', meta: {} };
      res.status(400).json(response);
      return;
    }

    const [row] = await db.insert(repairCostData).values({
      jobId: jobId ?? undefined,
      workspaceId: workspaceId ?? undefined,
      zipCode: zipCode ?? undefined,
      category,
      subcategory,
      complexity: complexity ?? 'moderate',
      quotedPriceCents: quotedPriceCents ?? undefined,
      acceptedPriceCents: acceptedPriceCents ?? undefined,
      actualPriceCents: actualPriceCents ?? undefined,
      providerId: providerId ?? undefined,
      propertyType: propertyType ?? undefined,
      dataSource: dataSource ?? 'manual_entry',
      region: region ?? undefined,
    }).returning();

    const response: ApiResponse<typeof row> = { data: row, error: null, meta: {} };
    res.status(201).json(response);
  } catch (err) {
    logger.error({ err }, '[estimates] Failed to record cost data');
    const message = err instanceof Error ? err.message : 'Failed to record cost data';
    const response: ApiResponse<null> = { data: null, error: message, meta: {} };
    res.status(500).json(response);
  }
});

export default router;
