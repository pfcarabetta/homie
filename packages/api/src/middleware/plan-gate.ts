import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { workspaces } from '../db/schema/workspaces';

const PRO_OR_HIGHER = new Set(['professional', 'business', 'enterprise']);
const BUSINESS_OR_HIGHER = new Set(['business', 'enterprise']);

/**
 * Middleware that blocks requests unless the workspace is on a plan that
 * meets the minimum tier. Must run AFTER `requireWorkspace` so `req.workspaceId`
 * is set.
 *
 * Returns 403 with a structured error so the frontend can surface a
 * targeted upgrade CTA.
 */
export function requirePlan(tier: 'pro' | 'business', featureName: string) {
  const allowed = tier === 'pro' ? PRO_OR_HIGHER : BUSINESS_OR_HIGHER;
  const friendlyTier = tier === 'pro' ? 'Professional' : 'Business';

  return async function planGate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(401).json({ data: null, error: 'Workspace context required', meta: {} });
      return;
    }

    try {
      const [ws] = await db
        .select({ plan: workspaces.plan })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!ws) {
        res.status(404).json({ data: null, error: 'Workspace not found', meta: {} });
        return;
      }

      if (!allowed.has(ws.plan)) {
        res.status(403).json({
          data: null,
          error: `${featureName} requires a ${friendlyTier} plan or higher. Upgrade to unlock.`,
          meta: {
            upgradeRequired: true,
            currentPlan: ws.plan,
            requiredTier: tier,
            featureName,
          },
        });
        return;
      }

      next();
    } catch (err) {
      logger.error({ err, workspaceId, featureName }, '[plan-gate] check failed');
      res.status(500).json({ data: null, error: 'Plan check failed', meta: {} });
    }
  };
}
