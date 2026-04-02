import { Router, Request, Response } from 'express';
import { db } from '../db';
import { repairCostData } from '../db/schema/cost-estimates';
import { generateEstimate } from '../services/cost-estimator';
import logger from '../logger';
import { ApiResponse } from '../types/api';

const router = Router();

// POST /generate — generate a cost estimate
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { category, subcategory, complexity, zipCode, workspaceId, propertyType, brand, systemAgeYears, urgency, photoAnalysisSummary } = req.body as {
      category?: string;
      subcategory?: string;
      complexity?: string;
      zipCode?: string;
      workspaceId?: string;
      propertyType?: string;
      brand?: string;
      systemAgeYears?: number;
      urgency?: string;
      photoAnalysisSummary?: string;
    };

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
