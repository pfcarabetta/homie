import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';

/**
 * Tier gating for Homie Membership (consumer-side).
 *
 * Sits parallel to `middleware/plan-gate.ts` (which gates B2B
 * workspace plans on `req.workspaceId`). This file uses
 * `req.homeownerId` and `homeowners.membership_tier`. Kept separate
 * per discovery decision so the two product lines' authorization
 * logic doesn't tangle.
 *
 * Order: `free < plus < premier`. `requireTier('plus')` admits
 * plus + premier. `requireTier('premier')` admits premier only.
 *
 * Returns the same structured 403 shape as plan-gate so the frontend
 * can use the existing upgrade-CTA flow:
 *   { data: null, error: <message>, meta: { upgradeRequired, currentTier, requiredTier, featureName } }
 *
 * Must run AFTER `requireAuth` so `req.homeownerId` is populated.
 */

export type MembershipTier = 'free' | 'plus' | 'premier';

const TIER_RANK: Record<MembershipTier, number> = {
  free: 0,
  plus: 1,
  premier: 2,
};

function isMembershipTier(value: string | null | undefined): value is MembershipTier {
  return value === 'free' || value === 'plus' || value === 'premier';
}

/**
 * Resolve a homeowner's current tier. Treats unknown / missing values
 * as 'free' (defensive — a homeowner row with a corrupt tier value
 * should not get paid features).
 */
export async function getCurrentTier(homeownerId: string): Promise<MembershipTier> {
  const [row] = await db
    .select({ tier: homeowners.membershipTier })
    .from(homeowners)
    .where(eq(homeowners.id, homeownerId))
    .limit(1);
  if (!row) return 'free';
  return isMembershipTier(row.tier) ? row.tier : 'free';
}

/**
 * Pure helper — useful for unit testing the rank logic without DB.
 */
export function meetsTier(current: MembershipTier, required: MembershipTier): boolean {
  return TIER_RANK[current] >= TIER_RANK[required];
}

/**
 * Express middleware factory. `featureName` shows up in the 403 error
 * message + meta so the frontend can render a targeted upgrade prompt.
 *
 * Example:
 *   router.post('/health-score',  requireAuth, requireTier('plus', 'Home Health Score'), getScore);
 *   router.post('/concierge/message', requireAuth, requireTier('premier', 'Human concierge'), send);
 */
export function requireTier(required: MembershipTier, featureName: string) {
  const friendly = required === 'plus' ? 'Plus' : 'Premier';

  return async function tierGate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const homeownerId = req.homeownerId;
    if (!homeownerId) {
      res.status(401).json({ data: null, error: 'Authentication required', meta: {} });
      return;
    }

    try {
      const current = await getCurrentTier(homeownerId);
      if (meetsTier(current, required)) {
        next();
        return;
      }
      res.status(403).json({
        data: null,
        error: `${featureName} requires ${friendly} membership or higher. Upgrade to unlock.`,
        meta: {
          upgradeRequired: true,
          currentTier: current,
          requiredTier: required,
          featureName,
        },
      });
    } catch (err) {
      logger.error(
        { err, homeownerId, required, featureName },
        '[require-tier] Failed to resolve homeowner tier',
      );
      res.status(500).json({
        data: null,
        error: 'Failed to verify membership tier',
        meta: {},
      });
    }
  };
}
