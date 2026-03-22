import { Router, Request, Response } from 'express';
import { eq, and, or, desc, ne } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { workspaces } from '../db/schema/workspaces';
import { workspaceMembers } from '../db/schema/workspace-members';
import { properties } from '../db/schema/properties';
import { homeowners } from '../db/schema/homeowners';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace-auth';

const router = Router();

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── POST / — Create workspace ────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { name, slug } = req.body as { name?: string; slug?: string };

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ data: null, error: 'name is required', meta: {} });
    return;
  }

  const finalSlug = slug ? slugify(slug) : slugify(name);

  try {
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: name.trim(), slug: finalSlug, ownerId: req.homeownerId })
      .returning();

    // Add owner as admin member
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      homeownerId: req.homeownerId,
      role: 'admin',
      acceptedAt: new Date(),
    });

    res.status(201).json({ data: workspace, error: null, meta: {} });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ data: null, error: 'A workspace with that slug already exists', meta: {} });
      return;
    }
    logger.error({ err }, '[POST /business]');
    res.status(500).json({ data: null, error: 'Failed to create workspace', meta: {} });
  }
});

// ── GET / — List user's workspaces ───────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        plan: workspaces.plan,
        role: workspaceMembers.role,
        createdAt: workspaces.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.homeownerId, req.homeownerId))
      .orderBy(desc(workspaces.createdAt));

    res.json({ data: rows, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business]');
    res.status(500).json({ data: null, error: 'Failed to fetch workspaces', meta: {} });
  }
});

// ── GET /:workspaceId — Get workspace details ────────────────────────────────

router.get('/:workspaceId', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, req.workspaceId))
      .limit(1);

    if (!workspace) {
      res.status(404).json({ data: null, error: 'Workspace not found', meta: {} });
      return;
    }

    // Get member count
    const members = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, req.workspaceId));

    // Get property count
    const props = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.workspaceId, req.workspaceId), eq(properties.active, true)));

    res.json({
      data: {
        ...workspace,
        member_count: members.length,
        property_count: props.length,
        user_role: req.workspaceRole,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id]');
    res.status(500).json({ data: null, error: 'Failed to fetch workspace', meta: {} });
  }
});

// ── PATCH /:workspaceId — Update workspace ───────────────────────────────────

router.patch('/:workspaceId', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const { name, slug } = req.body as { name?: string; slug?: string };
  const updates: Record<string, unknown> = {};

  if (name !== undefined) updates.name = name.trim();
  if (slug !== undefined) updates.slug = slugify(slug);
  if (Object.keys(updates).length > 0) updates.updatedAt = new Date();

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ data: null, error: 'No fields to update', meta: {} });
    return;
  }

  try {
    const [updated] = await db.update(workspaces).set(updates).where(eq(workspaces.id, req.workspaceId)).returning();
    res.json({ data: updated, error: null, meta: {} });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ data: null, error: 'Slug already taken', meta: {} });
      return;
    }
    logger.error({ err }, '[PATCH /business/:id]');
    res.status(500).json({ data: null, error: 'Failed to update workspace', meta: {} });
  }
});

// ── Properties ───────────────────────────────────────────────────────────────

// POST /:workspaceId/properties
router.post('/:workspaceId/properties', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const body = req.body as {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    property_type?: string;
    unit_count?: number;
    notes?: string;
  };

  if (!body.name || typeof body.name !== 'string') {
    res.status(400).json({ data: null, error: 'name is required', meta: {} });
    return;
  }

  try {
    const [property] = await db
      .insert(properties)
      .values({
        workspaceId: req.workspaceId,
        name: body.name.trim(),
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zipCode: body.zip_code ?? null,
        propertyType: body.property_type ?? 'residential',
        unitCount: body.unit_count ?? 1,
        notes: body.notes ?? null,
      })
      .returning();

    res.status(201).json({ data: property, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/properties]');
    res.status(500).json({ data: null, error: 'Failed to create property', meta: {} });
  }
});

// GET /:workspaceId/properties
router.get('/:workspaceId/properties', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.workspaceId, req.workspaceId))
      .orderBy(desc(properties.createdAt));

    res.json({ data: rows, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties]');
    res.status(500).json({ data: null, error: 'Failed to fetch properties', meta: {} });
  }
});

// GET /:workspaceId/properties/:propertyId
router.get('/:workspaceId/properties/:propertyId', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const [property] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, req.params.propertyId), eq(properties.workspaceId, req.workspaceId)))
      .limit(1);

    if (!property) {
      res.status(404).json({ data: null, error: 'Property not found', meta: {} });
      return;
    }

    res.json({ data: property, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:pid]');
    res.status(500).json({ data: null, error: 'Failed to fetch property', meta: {} });
  }
});

// PATCH /:workspaceId/properties/:propertyId
router.patch('/:workspaceId/properties/:propertyId', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  const fields: Record<string, string> = {
    name: 'name', address: 'address', city: 'city', state: 'state',
    zip_code: 'zipCode', property_type: 'propertyType', unit_count: 'unitCount',
    notes: 'notes', active: 'active',
  };

  for (const [bodyKey, dbKey] of Object.entries(fields)) {
    if (body[bodyKey] !== undefined) updates[dbKey] = body[bodyKey];
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ data: null, error: 'No fields to update', meta: {} });
    return;
  }

  updates.updatedAt = new Date();

  try {
    const [updated] = await db
      .update(properties)
      .set(updates)
      .where(and(eq(properties.id, req.params.propertyId), eq(properties.workspaceId, req.workspaceId)))
      .returning();

    if (!updated) {
      res.status(404).json({ data: null, error: 'Property not found', meta: {} });
      return;
    }

    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /business/:id/properties/:pid]');
    res.status(500).json({ data: null, error: 'Failed to update property', meta: {} });
  }
});

// DELETE /:workspaceId/properties/:propertyId (soft delete)
router.delete('/:workspaceId/properties/:propertyId', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    await db
      .update(properties)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(properties.id, req.params.propertyId), eq(properties.workspaceId, req.workspaceId)));

    res.json({ data: { deactivated: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /business/:id/properties/:pid]');
    res.status(500).json({ data: null, error: 'Failed to deactivate property', meta: {} });
  }
});

// ── Team Members ────────────────────────────────────────────────────────────

// GET /:workspaceId/members
router.get('/:workspaceId/members', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: workspaceMembers.id,
        role: workspaceMembers.role,
        invitedAt: workspaceMembers.invitedAt,
        acceptedAt: workspaceMembers.acceptedAt,
        homeownerId: workspaceMembers.homeownerId,
        email: homeowners.email,
        firstName: homeowners.firstName,
        lastName: homeowners.lastName,
      })
      .from(workspaceMembers)
      .innerJoin(homeowners, eq(workspaceMembers.homeownerId, homeowners.id))
      .where(eq(workspaceMembers.workspaceId, req.workspaceId))
      .orderBy(desc(workspaceMembers.createdAt));

    res.json({ data: rows, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/members]');
    res.status(500).json({ data: null, error: 'Failed to fetch members', meta: {} });
  }
});

// POST /:workspaceId/members — Invite by email
router.post('/:workspaceId/members', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const { email, role } = req.body as { email?: string; role?: string };

  if (!email || typeof email !== 'string') {
    res.status(400).json({ data: null, error: 'email is required', meta: {} });
    return;
  }

  const validRoles = ['admin', 'coordinator', 'field_tech', 'viewer'];
  const memberRole = role && validRoles.includes(role) ? role : 'viewer';

  try {
    // Find user by email
    const [user] = await db
      .select({ id: homeowners.id })
      .from(homeowners)
      .where(eq(homeowners.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      res.status(404).json({ data: null, error: 'No user found with that email. They need a Homie account first.', meta: {} });
      return;
    }

    // Check if already a member
    const [existing] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, req.workspaceId),
        eq(workspaceMembers.homeownerId, user.id),
      ))
      .limit(1);

    if (existing) {
      res.status(409).json({ data: null, error: 'User is already a member of this workspace', meta: {} });
      return;
    }

    const [member] = await db
      .insert(workspaceMembers)
      .values({
        workspaceId: req.workspaceId,
        homeownerId: user.id,
        role: memberRole,
        acceptedAt: new Date(), // auto-accept for now
      })
      .returning();

    res.status(201).json({
      data: {
        ...member,
        email: email.toLowerCase().trim(),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/members]');
    res.status(500).json({ data: null, error: 'Failed to invite member', meta: {} });
  }
});

// PATCH /:workspaceId/members/:memberId — Update role
router.patch('/:workspaceId/members/:memberId', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const { role } = req.body as { role?: string };

  const validRoles = ['admin', 'coordinator', 'field_tech', 'viewer'];
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ data: null, error: `role must be one of: ${validRoles.join(', ')}`, meta: {} });
    return;
  }

  try {
    // Don't allow changing the workspace owner's role
    const [workspace] = await db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, req.workspaceId))
      .limit(1);

    const [member] = await db
      .select({ homeownerId: workspaceMembers.homeownerId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, req.params.memberId), eq(workspaceMembers.workspaceId, req.workspaceId)))
      .limit(1);

    if (!member) {
      res.status(404).json({ data: null, error: 'Member not found', meta: {} });
      return;
    }

    if (workspace && member.homeownerId === workspace.ownerId) {
      res.status(403).json({ data: null, error: 'Cannot change the workspace owner\'s role', meta: {} });
      return;
    }

    const [updated] = await db
      .update(workspaceMembers)
      .set({ role })
      .where(and(eq(workspaceMembers.id, req.params.memberId), eq(workspaceMembers.workspaceId, req.workspaceId)))
      .returning();

    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /business/:id/members/:mid]');
    res.status(500).json({ data: null, error: 'Failed to update member', meta: {} });
  }
});

// DELETE /:workspaceId/members/:memberId — Remove member
router.delete('/:workspaceId/members/:memberId', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    // Don't allow removing the workspace owner
    const [workspace] = await db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, req.workspaceId))
      .limit(1);

    const [member] = await db
      .select({ homeownerId: workspaceMembers.homeownerId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, req.params.memberId), eq(workspaceMembers.workspaceId, req.workspaceId)))
      .limit(1);

    if (!member) {
      res.status(404).json({ data: null, error: 'Member not found', meta: {} });
      return;
    }

    if (workspace && member.homeownerId === workspace.ownerId) {
      res.status(403).json({ data: null, error: 'Cannot remove the workspace owner', meta: {} });
      return;
    }

    await db
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.id, req.params.memberId), eq(workspaceMembers.workspaceId, req.workspaceId)));

    res.json({ data: { removed: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /business/:id/members/:mid]');
    res.status(500).json({ data: null, error: 'Failed to remove member', meta: {} });
  }
});

export default router;
