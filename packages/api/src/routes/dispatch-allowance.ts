import { Router, Request, Response } from 'express';
import logger from '../logger';
import { getCurrentAllowance } from '../services/dispatch-allowance';

/**
 * Dispatch Allowance routes (Membership Phase 2).
 *
 * Mounted at `/api/v1/account/dispatch-allowance` under requireAuth.
 * Read-only — the only writers are the Stripe webhooks, the monthly
 * grant cron, and consumeDispatch() (which fires from the inspect
 * checkout flow + the upcoming chat dispatch flow).
 *
 * The single GET endpoint returns the current allowance state shaped
 * for direct consumption by the Dashboard "X dispatches remaining"
 * widget and the inspect checkout's "Use my allowance" button.
 */

const router = Router();

// GET / — current allowance state
router.get('/', async (req: Request, res: Response) => {
  try {
    const state = await getCurrentAllowance(req.homeownerId);
    res.json({
      data: {
        hasUnlimited: state.hasUnlimited,
        unlimitedUntil: state.unlimitedUntil ? state.unlimitedUntil.toISOString() : null,
        monthlyBank: state.monthlyBank,
        proBundleCredits: state.proBundleCredits,
        payPerItemCents: state.payPerItemCents,
        payPerBundleSmallCents: state.payPerBundleSmallCents,
        payPerBundleLargeCents: state.payPerBundleLargeCents,
        effectiveTier: state.effectiveTier,
        membershipSource: state.membershipSource,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err, homeownerId: req.homeownerId }, '[GET /account/dispatch-allowance]');
    res.status(500).json({ data: null, error: 'Failed to load dispatch allowance', meta: {} });
  }
});

export default router;
