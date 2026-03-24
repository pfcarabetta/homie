import { Router, Request, Response } from 'express';
import { eq, and, or, desc, ne, sql, gte, lte } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { workspaces } from '../db/schema/workspaces';
import { jobs } from '../db/schema/jobs';
import { providerResponses } from '../db/schema/provider-responses';
import { bookings } from '../db/schema/bookings';
import { workspaceMembers } from '../db/schema/workspace-members';
import { properties } from '../db/schema/properties';
import { homeowners } from '../db/schema/homeowners';
import { providers } from '../db/schema/providers';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { preferredVendors } from '../db/schema/preferred-vendors';
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
    bedrooms?: number;
    bathrooms?: string;
    sqft?: number;
    beds?: { type: string; count: number }[];
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
        bedrooms: body.bedrooms ?? null,
        bathrooms: body.bathrooms ?? null,
        sqft: body.sqft ?? null,
        beds: body.beds ?? null,
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
    bedrooms: 'bedrooms', bathrooms: 'bathrooms', sqft: 'sqft', beds: 'beds',
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

// ── Preferred Vendors ──────────────────────────────────────────────────────

// GET /:workspaceId/vendors
router.get('/:workspaceId/vendors', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: preferredVendors.id,
        providerId: preferredVendors.providerId,
        propertyId: preferredVendors.propertyId,
        categories: preferredVendors.categories,
        priority: preferredVendors.priority,
        notes: preferredVendors.notes,
        active: preferredVendors.active,
        createdAt: preferredVendors.createdAt,
        providerName: providers.name,
        providerPhone: providers.phone,
        providerEmail: providers.email,
        providerRating: providers.googleRating,
        providerReviewCount: providers.reviewCount,
      })
      .from(preferredVendors)
      .innerJoin(providers, eq(preferredVendors.providerId, providers.id))
      .where(and(eq(preferredVendors.workspaceId, req.workspaceId), eq(preferredVendors.active, true)))
      .orderBy(preferredVendors.priority);

    res.json({ data: rows, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/vendors]');
    res.status(500).json({ data: null, error: 'Failed to fetch vendors', meta: {} });
  }
});

// POST /:workspaceId/vendors — Add preferred vendor
router.post('/:workspaceId/vendors', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const body = req.body as {
    provider_id?: string;
    property_id?: string | null;
    categories?: string[];
    priority?: number;
    notes?: string;
  };

  if (!body.provider_id) {
    res.status(400).json({ data: null, error: 'provider_id is required', meta: {} });
    return;
  }

  try {
    // Verify provider exists
    const [provider] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.id, body.provider_id))
      .limit(1);

    if (!provider) {
      res.status(404).json({ data: null, error: 'Provider not found', meta: {} });
      return;
    }

    // Check for duplicate
    const conditions = [
      eq(preferredVendors.workspaceId, req.workspaceId),
      eq(preferredVendors.providerId, body.provider_id),
    ];
    const [existing] = await db
      .select({ id: preferredVendors.id })
      .from(preferredVendors)
      .where(and(...conditions))
      .limit(1);

    if (existing) {
      res.status(409).json({ data: null, error: 'This provider is already a preferred vendor', meta: {} });
      return;
    }

    const [vendor] = await db
      .insert(preferredVendors)
      .values({
        workspaceId: req.workspaceId,
        providerId: body.provider_id,
        propertyId: body.property_id ?? null,
        categories: body.categories ?? null,
        priority: body.priority ?? 0,
        notes: body.notes ?? null,
      })
      .returning();

    res.status(201).json({ data: vendor, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/vendors]');
    res.status(500).json({ data: null, error: 'Failed to add vendor', meta: {} });
  }
});

// POST /:workspaceId/vendors/create — Create a new provider and add as preferred vendor
router.post('/:workspaceId/vendors/create', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const body = req.body as {
    name?: string;
    phone?: string;
    email?: string;
    categories?: string[];
    priority?: number;
    notes?: string;
    property_id?: string | null;
  };

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    res.status(400).json({ data: null, error: 'name is required', meta: {} });
    return;
  }

  if (!body.phone && !body.email) {
    res.status(400).json({ data: null, error: 'At least a phone number or email is required', meta: {} });
    return;
  }

  try {
    // Create the provider
    const [newProvider] = await db
      .insert(providers)
      .values({
        name: body.name.trim(),
        phone: body.phone ?? null,
        email: body.email ?? null,
        categories: body.categories ?? null,
      })
      .returning();

    // Add as preferred vendor
    const [vendor] = await db
      .insert(preferredVendors)
      .values({
        workspaceId: req.workspaceId,
        providerId: newProvider.id,
        propertyId: body.property_id ?? null,
        categories: body.categories ?? null,
        priority: body.priority ?? 0,
        notes: body.notes ?? null,
      })
      .returning();

    res.status(201).json({
      data: {
        ...vendor,
        providerName: newProvider.name,
        providerPhone: newProvider.phone,
        providerEmail: newProvider.email,
        providerRating: null,
        providerReviewCount: 0,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/vendors/create]');
    res.status(500).json({ data: null, error: 'Failed to create vendor', meta: {} });
  }
});

// PATCH /:workspaceId/vendors/:vendorId — Update preferred vendor
router.patch('/:workspaceId/vendors/:vendorId', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  const fields: Record<string, string> = {
    property_id: 'propertyId',
    categories: 'categories',
    priority: 'priority',
    notes: 'notes',
    active: 'active',
  };

  for (const [bodyKey, dbKey] of Object.entries(fields)) {
    if (body[bodyKey] !== undefined) updates[dbKey] = body[bodyKey];
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ data: null, error: 'No fields to update', meta: {} });
    return;
  }

  try {
    const [updated] = await db
      .update(preferredVendors)
      .set(updates)
      .where(and(eq(preferredVendors.id, req.params.vendorId), eq(preferredVendors.workspaceId, req.workspaceId)))
      .returning();

    if (!updated) {
      res.status(404).json({ data: null, error: 'Vendor not found', meta: {} });
      return;
    }

    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /business/:id/vendors/:vid]');
    res.status(500).json({ data: null, error: 'Failed to update vendor', meta: {} });
  }
});

// DELETE /:workspaceId/vendors/:vendorId — Remove preferred vendor (soft delete)
router.delete('/:workspaceId/vendors/:vendorId', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    await db
      .update(preferredVendors)
      .set({ active: false })
      .where(and(eq(preferredVendors.id, req.params.vendorId), eq(preferredVendors.workspaceId, req.workspaceId)));

    res.json({ data: { removed: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /business/:id/vendors/:vid]');
    res.status(500).json({ data: null, error: 'Failed to remove vendor', meta: {} });
  }
});

// GET /:workspaceId/vendors/search?q=name — Search providers to add as preferred
router.get('/:workspaceId/vendors/search', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q || q.length < 2) {
    res.json({ data: [], error: null, meta: {} });
    return;
  }

  try {
    const rows = await db
      .select({
        id: providers.id,
        name: providers.name,
        phone: providers.phone,
        email: providers.email,
        googleRating: providers.googleRating,
        reviewCount: providers.reviewCount,
        categories: providers.categories,
      })
      .from(providers)
      .where(sql`LOWER(${providers.name}) LIKE ${`%${q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`}`)
      .limit(20);

    res.json({ data: rows, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/vendors/search]');
    res.status(500).json({ data: null, error: 'Failed to search providers', meta: {} });
  }
});

// ── Dispatches (workspace jobs) ─────────────────────────────────────────────

// ── Billing & Usage ─────────────────────────────────────────────────────────

const PLAN_LIMITS: Record<string, { base: number; perProperty: number; searchesPerProperty: number; extraCost: string }> = {
  trial: { base: 0, perProperty: 0, searchesPerProperty: 0, extraCost: 'N/A' },
  starter: { base: 29, perProperty: 5, searchesPerProperty: 2, extraCost: '$6.99' },
  professional: { base: 49, perProperty: 8, searchesPerProperty: 3, extraCost: '$4.99' },
  business: { base: 99, perProperty: 10, searchesPerProperty: 5, extraCost: '$3.49' },
  enterprise: { base: 299, perProperty: 10, searchesPerProperty: 10, extraCost: '$2.49' },
};

// GET /:workspaceId/usage
router.get('/:workspaceId/usage', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const [ws] = await db
      .select({
        plan: workspaces.plan,
        searchesUsed: workspaces.searchesUsed,
        searchesLimit: workspaces.searchesLimit,
        billingCycleStart: workspaces.billingCycleStart,
      })
      .from(workspaces)
      .where(eq(workspaces.id, req.workspaceId))
      .limit(1);

    if (!ws) {
      res.status(404).json({ data: null, error: 'Workspace not found', meta: {} });
      return;
    }

    const planInfo = PLAN_LIMITS[ws.plan] || PLAN_LIMITS.starter;
    const billingCycleEnd = new Date(ws.billingCycleStart);
    billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);

    // Count active properties to calculate dynamic search limit
    const [{ value: propertyCount }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(properties)
      .where(and(eq(properties.workspaceId, req.workspaceId), eq(properties.active, true)));

    const dynamicLimit = ws.plan === 'trial' ? 5 : Math.max(planInfo.searchesPerProperty * propertyCount, planInfo.searchesPerProperty);
    const effectiveLimit = Math.max(ws.searchesLimit, dynamicLimit);

    res.json({
      data: {
        plan: ws.plan,
        searches_used: ws.searchesUsed,
        searches_limit: effectiveLimit,
        searches_remaining: Math.max(0, effectiveLimit - ws.searchesUsed),
        extra_search_cost: planInfo.extraCost,
        base_price: planInfo.base,
        per_property_price: planInfo.perProperty,
        searches_per_property: planInfo.searchesPerProperty,
        property_count: propertyCount,
        billing_cycle_start: ws.billingCycleStart,
        billing_cycle_end: billingCycleEnd.toISOString(),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/usage]');
    res.status(500).json({ data: null, error: 'Failed to fetch usage', meta: {} });
  }
});

// GET /:workspaceId/reports/costs
router.get('/:workspaceId/reports/costs', requireWorkspace, async (req: Request, res: Response) => {
  try {
    // Get all booked jobs for this workspace with quoted prices
    const rows = await db
      .select({
        jobId: jobs.id,
        propertyId: jobs.propertyId,
        category: sql<string>`${jobs.diagnosis}->>'category'`,
        jobCreatedAt: jobs.createdAt,
        providerId: bookings.providerId,
        providerName: providers.name,
        quotedPrice: providerResponses.quotedPrice,
        confirmedAt: bookings.confirmedAt,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .leftJoin(providerResponses, eq(bookings.responseId, providerResponses.id))
      .where(eq(jobs.workspaceId, req.workspaceId))
      .orderBy(desc(bookings.confirmedAt));

    // Enrich with property names
    const propertyIds = [...new Set(rows.filter(r => r.propertyId).map(r => r.propertyId!))];
    let propertyMap: Record<string, string> = {};
    if (propertyIds.length > 0) {
      const propRows = await db
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(sql`${properties.id} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`);
      propertyMap = Object.fromEntries(propRows.map(p => [p.id, p.name]));
    }

    // Parse costs and build aggregations
    function parseCost(price: string | null): number {
      if (!price) return 0;
      const match = price.replace(/[^0-9.,\-]/g, '').match(/[\d,.]+/);
      return match ? parseFloat(match[0].replace(/,/g, '')) : 0;
    }

    const enriched = rows.map(r => ({
      ...r,
      propertyName: r.propertyId ? propertyMap[r.propertyId] || 'Unknown' : 'No property',
      cost: parseCost(r.quotedPrice),
    }));

    const totalCost = enriched.reduce((sum, r) => sum + r.cost, 0);
    const totalBookings = enriched.length;

    // By property
    const byProperty: Record<string, { name: string; cost: number; count: number }> = {};
    for (const r of enriched) {
      const key = r.propertyId || 'none';
      if (!byProperty[key]) byProperty[key] = { name: r.propertyName, cost: 0, count: 0 };
      byProperty[key].cost += r.cost;
      byProperty[key].count++;
    }

    // By category
    const byCategory: Record<string, { cost: number; count: number }> = {};
    for (const r of enriched) {
      const cat = r.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = { cost: 0, count: 0 };
      byCategory[cat].cost += r.cost;
      byCategory[cat].count++;
    }

    // By vendor
    const byVendor: Record<string, { name: string; cost: number; count: number }> = {};
    for (const r of enriched) {
      if (!byVendor[r.providerId]) byVendor[r.providerId] = { name: r.providerName, cost: 0, count: 0 };
      byVendor[r.providerId].cost += r.cost;
      byVendor[r.providerId].count++;
    }

    // By month
    const byMonth: Record<string, { cost: number; count: number }> = {};
    for (const r of enriched) {
      const month = new Date(r.confirmedAt).toISOString().slice(0, 7); // YYYY-MM
      if (!byMonth[month]) byMonth[month] = { cost: 0, count: 0 };
      byMonth[month].cost += r.cost;
      byMonth[month].count++;
    }

    res.json({
      data: {
        total_cost: totalCost,
        total_bookings: totalBookings,
        avg_cost: totalBookings > 0 ? totalCost / totalBookings : 0,
        by_property: Object.entries(byProperty).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.cost - a.cost),
        by_category: Object.entries(byCategory).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.cost - a.cost),
        by_vendor: Object.entries(byVendor).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.cost - a.cost),
        by_month: Object.entries(byMonth).map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
        line_items: enriched.map(r => ({
          jobId: r.jobId,
          propertyName: r.propertyName,
          category: r.category,
          providerName: r.providerName,
          quotedPrice: r.quotedPrice,
          cost: r.cost,
          confirmedAt: r.confirmedAt,
        })),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/reports/costs]');
    res.status(500).json({ data: null, error: 'Failed to generate cost report', meta: {} });
  }
});

// GET /:workspaceId/reports/vendors — Vendor scorecards
router.get('/:workspaceId/reports/vendors', requireWorkspace, async (req: Request, res: Response) => {
  try {
    // Get all outreach attempts for this workspace's jobs
    const attempts = await db
      .select({
        providerId: outreachAttempts.providerId,
        providerName: providers.name,
        providerPhone: providers.phone,
        providerRating: providers.googleRating,
        providerReviewCount: providers.reviewCount,
        providerCategories: providers.categories,
        channel: outreachAttempts.channel,
        status: outreachAttempts.status,
        attemptedAt: outreachAttempts.attemptedAt,
        respondedAt: outreachAttempts.respondedAt,
      })
      .from(outreachAttempts)
      .innerJoin(jobs, eq(outreachAttempts.jobId, jobs.id))
      .innerJoin(providers, eq(outreachAttempts.providerId, providers.id))
      .where(eq(jobs.workspaceId, req.workspaceId));

    // Get all responses
    const responses = await db
      .select({
        providerId: providerResponses.providerId,
        quotedPrice: providerResponses.quotedPrice,
        createdAt: providerResponses.createdAt,
      })
      .from(providerResponses)
      .innerJoin(jobs, eq(providerResponses.jobId, jobs.id))
      .where(eq(jobs.workspaceId, req.workspaceId));

    // Get bookings
    const bookingRows = await db
      .select({
        providerId: bookings.providerId,
        status: bookings.status,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .where(eq(jobs.workspaceId, req.workspaceId));

    // Build scorecards per provider
    const vendors: Record<string, {
      id: string; name: string; phone: string | null; rating: string | null;
      reviewCount: number; categories: string[] | null;
      totalOutreach: number; totalResponded: number; totalAccepted: number;
      totalDeclined: number; totalBookings: number;
      responseTimes: number[]; quotes: number[];
    }> = {};

    for (const a of attempts) {
      if (!vendors[a.providerId]) {
        vendors[a.providerId] = {
          id: a.providerId, name: a.providerName, phone: a.providerPhone,
          rating: a.providerRating, reviewCount: a.providerReviewCount,
          categories: a.providerCategories,
          totalOutreach: 0, totalResponded: 0, totalAccepted: 0,
          totalDeclined: 0, totalBookings: 0, responseTimes: [], quotes: [],
        };
      }
      const v = vendors[a.providerId];
      v.totalOutreach++;
      if (a.status === 'accepted' || a.status === 'responded') {
        v.totalResponded++;
        v.totalAccepted++;
        if (a.respondedAt && a.attemptedAt) {
          v.responseTimes.push((new Date(a.respondedAt).getTime() - new Date(a.attemptedAt).getTime()) / 1000);
        }
      }
      if (a.status === 'declined') { v.totalResponded++; v.totalDeclined++; }
    }

    for (const r of responses) {
      if (vendors[r.providerId] && r.quotedPrice) {
        const match = r.quotedPrice.replace(/[^0-9.,]/g, '').match(/[\d,.]+/);
        if (match) vendors[r.providerId].quotes.push(parseFloat(match[0].replace(/,/g, '')));
      }
    }

    for (const b of bookingRows) {
      if (vendors[b.providerId]) vendors[b.providerId].totalBookings++;
    }

    // Calculate scores and grades
    function grade(score: number): string {
      if (score >= 90) return 'A';
      if (score >= 75) return 'B';
      if (score >= 60) return 'C';
      if (score >= 40) return 'D';
      return 'F';
    }

    function badges(v: typeof vendors[string]): string[] {
      const b: string[] = [];
      const responseRate = v.totalOutreach > 0 ? v.totalResponded / v.totalOutreach : 0;
      const avgTime = v.responseTimes.length > 0 ? v.responseTimes.reduce((a, b) => a + b, 0) / v.responseTimes.length : 0;
      if (responseRate >= 0.8) b.push('Reliable');
      if (avgTime > 0 && avgTime < 300) b.push('Fast Responder');
      if (v.totalBookings >= 5) b.push('Veteran');
      if (v.rating && parseFloat(v.rating) >= 4.5) b.push('Top Rated');
      return b;
    }

    const scorecards = Object.values(vendors)
      .filter(v => v.totalOutreach >= 1)
      .map(v => {
        const responseRate = v.totalOutreach > 0 ? v.totalResponded / v.totalOutreach : 0;
        const acceptanceRate = v.totalResponded > 0 ? v.totalAccepted / v.totalResponded : 0;
        const avgResponseSec = v.responseTimes.length > 0 ? v.responseTimes.reduce((a, b) => a + b, 0) / v.responseTimes.length : null;
        const avgQuote = v.quotes.length > 0 ? v.quotes.reduce((a, b) => a + b, 0) / v.quotes.length : null;
        const bookingRate = v.totalAccepted > 0 ? v.totalBookings / v.totalAccepted : 0;
        const overallScore = Math.round(responseRate * 40 + acceptanceRate * 30 + bookingRate * 30);

        return {
          id: v.id,
          name: v.name,
          phone: v.phone,
          google_rating: v.rating,
          review_count: v.reviewCount,
          categories: v.categories,
          total_outreach: v.totalOutreach,
          response_rate: Math.round(responseRate * 100),
          acceptance_rate: Math.round(acceptanceRate * 100),
          avg_response_sec: avgResponseSec ? Math.round(avgResponseSec) : null,
          avg_quote: avgQuote ? Math.round(avgQuote) : null,
          total_bookings: v.totalBookings,
          booking_rate: Math.round(bookingRate * 100),
          overall_score: overallScore,
          grade: grade(overallScore),
          badges: badges(v),
        };
      })
      .sort((a, b) => b.overall_score - a.overall_score);

    res.json({ data: { vendors: scorecards }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/reports/vendors]');
    res.status(500).json({ data: null, error: 'Failed to generate vendor scorecards', meta: {} });
  }
});

// GET /:workspaceId/dispatches
router.get('/:workspaceId/dispatches', requireWorkspace, async (req: Request, res: Response) => {
  try {
    // Get all jobs for this workspace, or all jobs created by workspace members
    const memberRows = await db
      .select({ homeownerId: workspaceMembers.homeownerId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, req.workspaceId));

    const memberIds = memberRows.map(m => m.homeownerId);
    if (memberIds.length === 0) {
      res.json({ data: [], error: null, meta: {} });
      return;
    }

    const rows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        paymentStatus: jobs.paymentStatus,
        tier: jobs.tier,
        zipCode: jobs.zipCode,
        diagnosis: jobs.diagnosis,
        preferredTiming: jobs.preferredTiming,
        propertyId: jobs.propertyId,
        createdAt: jobs.createdAt,
        expiresAt: jobs.expiresAt,
      })
      .from(jobs)
      .where(eq(jobs.workspaceId, req.workspaceId))
      .orderBy(desc(jobs.createdAt))
      .limit(100);

    // Enrich with property names
    const propertyIds = [...new Set(rows.filter(r => r.propertyId).map(r => r.propertyId!))];
    let propertyMap: Record<string, string> = {};
    if (propertyIds.length > 0) {
      const propRows = await db
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(sql`${properties.id} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`);
      propertyMap = Object.fromEntries(propRows.map(p => [p.id, p.name]));
    }

    // Get response counts per job
    const jobIds = rows.map(r => r.id);
    let responseCountMap: Record<string, number> = {};
    if (jobIds.length > 0) {
      const countRows = await db
        .select({ jobId: providerResponses.jobId, count: sql<number>`count(*)::int` })
        .from(providerResponses)
        .where(sql`${providerResponses.jobId} IN (${sql.join(jobIds.map(id => sql`${id}`), sql`, `)})`)
        .groupBy(providerResponses.jobId);
      responseCountMap = Object.fromEntries(countRows.map(r => [r.jobId, r.count]));
    }

    const enriched = rows.map(r => ({
      ...r,
      propertyName: r.propertyId ? propertyMap[r.propertyId] || null : null,
      responseCount: responseCountMap[r.id] || 0,
    }));

    res.json({ data: enriched, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/dispatches]');
    res.status(500).json({ data: null, error: 'Failed to fetch dispatches', meta: {} });
  }
});

// GET /:workspaceId/bookings
router.get('/:workspaceId/bookings', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        serviceAddress: bookings.serviceAddress,
        confirmedAt: bookings.confirmedAt,
        jobId: bookings.jobId,
        providerId: bookings.providerId,
        providerName: providers.name,
        providerPhone: providers.phone,
        providerEmail: providers.email,
        providerRating: providers.googleRating,
        providerReviewCount: providers.reviewCount,
        diagnosis: jobs.diagnosis,
        zipCode: jobs.zipCode,
        preferredTiming: jobs.preferredTiming,
        propertyId: jobs.propertyId,
        jobCreatedAt: jobs.createdAt,
        quotedPrice: providerResponses.quotedPrice,
        availability: providerResponses.availability,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .leftJoin(providerResponses, eq(bookings.responseId, providerResponses.id))
      .where(eq(jobs.workspaceId, req.workspaceId))
      .orderBy(desc(bookings.confirmedAt));

    // Enrich with property names
    const propertyIds = [...new Set(rows.filter(r => r.propertyId).map(r => r.propertyId!))];
    let propertyMap: Record<string, string> = {};
    if (propertyIds.length > 0) {
      const propRows = await db
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(sql`${properties.id} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`);
      propertyMap = Object.fromEntries(propRows.map(p => [p.id, p.name]));
    }

    const enriched = rows.map(r => ({
      ...r,
      propertyName: r.propertyId ? propertyMap[r.propertyId] || null : null,
    }));

    res.json({ data: { bookings: enriched }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/bookings]');
    res.status(500).json({ data: null, error: 'Failed to fetch bookings', meta: {} });
  }
});

export default router;
