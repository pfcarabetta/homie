import { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { workspaces } from '../db/schema/workspaces';
import { workspaceMembers } from '../db/schema/workspace-members';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      workspaceId: string;
      workspaceRole: string;
    }
  }
}

/**
 * Middleware that verifies the user is a member of the workspace.
 * Expects req.homeownerId to be set (run after requireAuth).
 * Reads workspace ID from req.params.workspaceId.
 */
export async function requireWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
  const workspaceId = req.params.workspaceId;
  if (!workspaceId) {
    res.status(400).json({ data: null, error: 'Workspace ID required', meta: {} });
    return;
  }

  try {
    // Check if user is workspace owner
    const [workspace] = await db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      res.status(404).json({ data: null, error: 'Workspace not found', meta: {} });
      return;
    }

    if (workspace.ownerId === req.homeownerId) {
      req.workspaceId = workspaceId;
      req.workspaceRole = 'admin';
      next();
      return;
    }

    // Check workspace membership
    const [member] = await db
      .select({ role: workspaceMembers.role, acceptedAt: workspaceMembers.acceptedAt })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.homeownerId, req.homeownerId),
      ))
      .limit(1);

    if (!member || !member.acceptedAt) {
      res.status(403).json({ data: null, error: 'Not a member of this workspace', meta: {} });
      return;
    }

    req.workspaceId = workspaceId;
    req.workspaceRole = member.role;
    next();
  } catch (err) {
    logger.error({ err }, '[workspace-auth] requireWorkspace failed');
    res.status(500).json({ data: null, error: 'Workspace auth error', meta: {} });
  }
}

/**
 * Returns middleware that checks the user's workspace role.
 */
export function requireWorkspaceRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.workspaceRole)) {
      res.status(403).json({ data: null, error: 'Insufficient permissions', meta: {} });
      return;
    }
    next();
  };
}
