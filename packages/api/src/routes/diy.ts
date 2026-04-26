import { Router, Request, Response } from 'express';
import { analyzeDIY } from '../services/diy';

/**
 * POST /api/v1/diy/analyze
 * Lazy-loaded, on-demand DIY analysis for the quote-chat DIY panel.
 *
 * Called when the homeowner taps "Or try fixing it yourself?" — so we
 * only pay the Claude cost for users who actually want DIY guidance,
 * not everyone who sees the diagnosis card. Returns a structured
 * DIYAnalysisPayload the frontend renders inline. If the AI deems the
 * repair unsafe to self-service (gas, major electrical, etc.),
 * `feasible` is false and the panel collapses into a "too involved"
 * state instead of showing steps.
 *
 * This route is intentionally unauthenticated so it works during the
 * pre-auth intake, matching /api/v1/diagnostic. The actual analysis
 * lives in services/diy.ts and is shared with the per-item DIY
 * endpoint on the homeowner-inspect portal.
 */
const router = Router();

interface AnalyzeBody {
  diagnosis?: unknown;
  category?: unknown;
  userDescription?: unknown;
}

router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AnalyzeBody;
  const diagnosis = typeof body.diagnosis === 'string' ? body.diagnosis : '';
  const category = typeof body.category === 'string' ? body.category : null;
  const userDescription = typeof body.userDescription === 'string' ? body.userDescription : null;

  const result = await analyzeDIY({ diagnosis, category, userDescription });
  if (!result.ok) {
    res.status(result.status).json({ data: null, error: result.error, meta: null });
    return;
  }
  res.json({ data: result.payload, error: null, meta: null });
});

export default router;
