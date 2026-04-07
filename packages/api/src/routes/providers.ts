import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { providers } from '../db/schema/providers';
import { suppressionList } from '../db/schema/suppression-list';
import { discoverProviders } from '../services/providers/discovery';
import { SuppressionReason, DiscoveryResult } from '../types/providers';
import { ApiResponse } from '../types/api';
import { diagnosticLimiter, authLimiter } from '../middleware/rate-limit';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const VALID_REASONS: SuppressionReason[] = [
  'provider_requested',
  'rate_limited',
  'permanently_unreachable',
];

// GET /api/v1/providers/discover
router.get('/discover', diagnosticLimiter, async (req: Request, res: Response) => {
  const { category, zip_code, radius_miles, min_rating, limit } = req.query;

  if (!category || typeof category !== 'string') {
    const out: ApiResponse<null> = { data: null, error: 'category is required', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!zip_code || typeof zip_code !== 'string' || !ZIP_RE.test(zip_code)) {
    const out: ApiResponse<null> = { data: null, error: 'zip_code must be a valid 5-digit zip', meta: {} };
    res.status(400).json(out);
    return;
  }

  const radiusMiles = radius_miles !== undefined ? parseFloat(radius_miles as string) : 15;
  const minRating = min_rating !== undefined ? parseFloat(min_rating as string) : 4.0;
  const limitNum = limit !== undefined ? parseInt(limit as string, 10) : 15;

  if (isNaN(radiusMiles) || radiusMiles < 1 || radiusMiles > 50) {
    const out: ApiResponse<null> = { data: null, error: 'radius_miles must be between 1 and 50', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (isNaN(minRating) || minRating < 0 || minRating > 5) {
    const out: ApiResponse<null> = { data: null, error: 'min_rating must be between 0 and 5', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
    const out: ApiResponse<null> = { data: null, error: 'limit must be between 1 and 50', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    const result = await discoverProviders({ category, zipCode: zip_code, radiusMiles, minRating, limit: limitNum });
    const out: ApiResponse<DiscoveryResult> = { data: result, error: null, meta: {} };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[GET /providers/discover]');
    const message = err instanceof Error ? err.message : 'Discovery failed';
    const out: ApiResponse<null> = { data: null, error: message, meta: {} };
    res.status(502).json(out);
  }
});

// POST /api/v1/providers/:id/suppress
router.post('/:id/suppress', authLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    const out: ApiResponse<null> = { data: null, error: 'Invalid provider ID', meta: {} };
    res.status(400).json(out);
    return;
  }

  const { reason } = req.body as { reason?: string };
  if (!reason || !VALID_REASONS.includes(reason as SuppressionReason)) {
    const out: ApiResponse<null> = {
      data: null,
      error: `reason must be one of: ${VALID_REASONS.join(', ')}`,
      meta: {},
    };
    res.status(400).json(out);
    return;
  }

  try {
    const [provider] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, id)).limit(1);
    if (!provider) {
      const out: ApiResponse<null> = { data: null, error: 'Provider not found', meta: {} };
      res.status(404).json(out);
      return;
    }

    await db
      .insert(suppressionList)
      .values({ providerId: id, reason: reason as SuppressionReason })
      .onConflictDoNothing();

    const out: ApiResponse<{ provider_id: string; reason: string }> = {
      data: { provider_id: id, reason },
      error: null,
      meta: {},
    };
    res.status(201).json(out);
  } catch (err) {
    logger.error({ err }, '[POST /providers/:id/suppress]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to suppress provider', meta: {} };
    res.status(500).json(out);
  }
});

export default router;
