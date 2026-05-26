import { Router, Request, Response } from 'express';
import logger from '../logger';
import { computeNextStep, skipNextStep } from '../services/next-step';

/**
 * Dashboard Direction A — endpoints driving the redesigned member
 * dashboard. Mounted at /api/v1/account/dashboard under requireAuth.
 *
 *   GET  /next-step       — the current prioritized step
 *   POST /next-step/skip  — record a 24h skip for the current step
 *
 * Score / open-items / boosters / dispatch-allowance / activity all
 * live on their own existing routers — this one is purely the
 * adaptive Next Step card.
 */

const router = Router();

router.get('/next-step', async (req: Request, res: Response) => {
  try {
    const step = await computeNextStep(req.homeownerId);
    res.json({ data: step, error: null, meta: {} });
  } catch (err) {
    logger.error({ err, homeownerId: req.homeownerId }, '[GET /account/dashboard/next-step]');
    res.status(500).json({ data: null, error: 'Failed to compute next step', meta: {} });
  }
});

router.post('/next-step/skip', async (req: Request, res: Response) => {
  const { skip_key } = req.body as { skip_key?: string };
  if (!skip_key || typeof skip_key !== 'string') {
    res.status(400).json({ data: null, error: 'skip_key is required', meta: {} });
    return;
  }
  try {
    await skipNextStep(req.homeownerId, skip_key);
    // Return the next step in the same response so the client can swap
    // the card without a second round-trip.
    const step = await computeNextStep(req.homeownerId);
    res.json({ data: step, error: null, meta: {} });
  } catch (err) {
    logger.error({ err, homeownerId: req.homeownerId, skipKey: skip_key }, '[POST /account/dashboard/next-step/skip]');
    res.status(500).json({ data: null, error: 'Failed to record skip', meta: {} });
  }
});

export default router;
