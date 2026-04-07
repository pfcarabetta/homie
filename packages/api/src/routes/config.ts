import { Router, Request, Response } from 'express';
import { getPricingConfig } from '../services/pricing';

const router = Router();

// GET /api/v1/config/pricing — public, no auth required
router.get('/pricing', async (_req: Request, res: Response) => {
  try {
    const config = await getPricingConfig();
    res.json({ data: config, error: null, meta: {} });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to fetch pricing config', meta: {} });
  }
});

export default router;
