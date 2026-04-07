import { Router, Request, Response } from 'express';
import { eq, and, or, desc, ne, sql, gte, lte, count } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
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
import { reservations } from '../db/schema/reservations';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace-auth';
import { generateEstimatePDF } from '../services/estimate-pdf';

const router = Router();

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── POST / — Create workspace ────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { name, slug, plan } = req.body as { name?: string; slug?: string; plan?: string };

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ data: null, error: 'name is required', meta: {} });
    return;
  }

  const finalSlug = slug ? slugify(slug) : slugify(name);
  const validPlans = ['trial', 'starter', 'professional', 'business', 'enterprise'];
  const selectedPlan = plan && validPlans.includes(plan) ? plan : 'starter';
  // Per-property model: all plans get 5 searches/property/month (fair use)
  const planSearchLimits: Record<string, number> = { trial: 5, starter: 5, professional: 5, business: 5, enterprise: 5 };
  const planPropertyLimits: Record<string, number> = { trial: 5, starter: 10, professional: 50, business: 150, enterprise: 9999 };

  try {
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: name.trim(),
        slug: finalSlug,
        plan: selectedPlan,
        searchesLimit: planSearchLimits[selectedPlan] ?? 2,
        ownerId: req.homeownerId,
      })
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
  const { name, slug, logo_url, company_address, company_phone, company_email, plan } = req.body as {
    name?: string; slug?: string; logo_url?: string | null;
    company_address?: string | null; company_phone?: string | null; company_email?: string | null;
    plan?: string;
  };
  const updates: Record<string, unknown> = {};

  if (name !== undefined) updates.name = name.trim();
  if (slug !== undefined) updates.slug = slugify(slug);
  if (logo_url !== undefined) updates.logoUrl = logo_url;
  if (company_address !== undefined) updates.companyAddress = company_address;
  if (company_phone !== undefined) updates.companyPhone = company_phone;
  if (company_email !== undefined) updates.companyEmail = company_email;
  if (plan !== undefined && ['starter', 'professional', 'business', 'enterprise'].includes(plan)) updates.plan = plan;
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
    details?: Record<string, unknown>;
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
        details: body.details ?? null,
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
    details: 'details', notes: 'notes', active: 'active',
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

    // Enforce member limit based on plan
    const planMemberLimits: Record<string, number> = { trial: 1, starter: 1, professional: 5, business: 15, enterprise: 9999 };
    const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, req.workspaceId)).limit(1);
    const maxMembers = planMemberLimits[ws?.plan ?? 'starter'] ?? 1;
    const [{ value: currentCount }] = await db.select({ value: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, req.workspaceId));
    if (currentCount >= maxMembers) {
      res.status(403).json({ data: null, error: `Team member limit reached (${maxMembers} on ${ws?.plan ?? 'starter'} plan). Upgrade to add more members.`, meta: {} });
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
        availabilitySchedule: preferredVendors.availabilitySchedule,
        active: preferredVendors.active,
        skipQuote: preferredVendors.skipQuote,
        createdAt: preferredVendors.createdAt,
        providerName: providers.name,
        providerPhone: providers.phone,
        providerEmail: providers.email,
        providerRating: providers.googleRating,
        providerReviewCount: providers.reviewCount,
      })
      .from(preferredVendors)
      .innerJoin(providers, eq(preferredVendors.providerId, providers.id))
      .where(eq(preferredVendors.workspaceId, req.workspaceId))
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
    skip_quote?: boolean;
    availability_schedule?: Record<string, { start: string; end: string } | null>;
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

    // Check for duplicate (only active entries)
    const [existing] = await db
      .select({ id: preferredVendors.id })
      .from(preferredVendors)
      .where(and(
        eq(preferredVendors.workspaceId, req.workspaceId),
        eq(preferredVendors.providerId, body.provider_id),
        eq(preferredVendors.active, true),
        body.property_id
          ? eq(preferredVendors.propertyId, body.property_id)
          : sql`${preferredVendors.propertyId} IS NULL`,
      ))
      .limit(1);

    if (existing) {
      res.status(409).json({ data: null, error: 'This provider is already a preferred vendor for this property', meta: {} });
      return;
    }

    // Enforce vendor limit based on plan
    const planVendorLimits: Record<string, number> = { trial: 5, starter: 5, professional: 9999, business: 9999, enterprise: 9999 };
    const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, req.workspaceId)).limit(1);
    const maxVendors = planVendorLimits[ws?.plan ?? 'starter'] ?? 5;
    // Count unique providers (not entries — one vendor with multiple properties counts as 1)
    const vendorRows = await db.select({ providerId: preferredVendors.providerId }).from(preferredVendors)
      .where(and(eq(preferredVendors.workspaceId, req.workspaceId), eq(preferredVendors.active, true)));
    const uniqueVendors = new Set(vendorRows.map(v => v.providerId)).size;
    // Only check limit if this is a new provider (not adding another property to an existing vendor)
    const isNewProvider = !vendorRows.some(v => v.providerId === body.provider_id);
    if (isNewProvider && uniqueVendors >= maxVendors) {
      res.status(403).json({ data: null, error: `Preferred vendor limit reached (${maxVendors} on ${ws?.plan ?? 'starter'} plan). Upgrade to Professional for unlimited vendors.`, meta: {} });
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
        skipQuote: body.skip_quote ?? false,
        availabilitySchedule: body.availability_schedule ?? null,
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
    skip_quote?: boolean;
    property_id?: string | null;
    availability_schedule?: Record<string, { start: string; end: string } | null>;
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
        skipQuote: body.skip_quote ?? false,
        availabilitySchedule: body.availability_schedule ?? null,
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
    skip_quote: 'skipQuote',
    availability_schedule: 'availabilitySchedule',
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

// DELETE /:workspaceId/vendors/:vendorId — Remove preferred vendor
router.delete('/:workspaceId/vendors/:vendorId', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    await db
      .delete(preferredVendors)
      .where(and(eq(preferredVendors.id, req.params.vendorId), eq(preferredVendors.workspaceId, req.workspaceId)));

    res.json({ data: { removed: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /business/:id/vendors/:vid]');
    res.status(500).json({ data: null, error: 'Failed to remove vendor', meta: {} });
  }
});

// PATCH /:workspaceId/vendors/provider/:providerId/toggle — Toggle active for all entries of a provider
router.patch('/:workspaceId/vendors/provider/:providerId/toggle', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { active } = req.body as { active?: boolean };
  if (active === undefined) {
    res.status(400).json({ data: null, error: 'active is required', meta: {} });
    return;
  }
  try {
    await db
      .update(preferredVendors)
      .set({ active })
      .where(and(eq(preferredVendors.workspaceId, req.workspaceId), eq(preferredVendors.providerId, req.params.providerId)));
    res.json({ data: { toggled: true, active }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /business/:id/vendors/provider/:pid/toggle]');
    res.status(500).json({ data: null, error: 'Failed to toggle vendor', meta: {} });
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

// New per-property model: $10/property/mo across all plans, tiers unlock features
const PLAN_LIMITS: Record<string, { base: number; perProperty: number; searchesPerProperty: number; maxProperties: number }> = {
  trial: { base: 0, perProperty: 0, searchesPerProperty: 5, maxProperties: 5 },
  starter: { base: 0, perProperty: 10, searchesPerProperty: 5, maxProperties: 10 },
  professional: { base: 99, perProperty: 10, searchesPerProperty: 5, maxProperties: 50 },
  business: { base: 249, perProperty: 10, searchesPerProperty: 5, maxProperties: 150 },
  enterprise: { base: 0, perProperty: 10, searchesPerProperty: 5, maxProperties: 9999 },
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

    // Fair use: 5 searches per property per month
    const effectiveLimit = Math.max(planInfo.searchesPerProperty * propertyCount, planInfo.searchesPerProperty);

    res.json({
      data: {
        plan: ws.plan,
        searches_used: ws.searchesUsed,
        searches_limit: effectiveLimit,
        searches_remaining: Math.max(0, effectiveLimit - ws.searchesUsed),
        base_price: planInfo.base,
        per_property_price: planInfo.perProperty,
        searches_per_property: planInfo.searchesPerProperty,
        max_properties: planInfo.maxProperties,
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

// POST /:workspaceId/dispatches/:jobId/cancel
router.post('/:workspaceId/dispatches/:jobId/cancel', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    // Verify job belongs to workspace
    const [job] = await db
      .select({ id: jobs.id, status: jobs.status, workspaceId: jobs.workspaceId })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, req.workspaceId)))
      .limit(1);

    if (!job) {
      res.status(404).json({ data: null, error: 'Dispatch not found', meta: {} });
      return;
    }

    if (job.status === 'expired' || job.status === 'refunded') {
      res.status(400).json({ data: null, error: 'Dispatch is already expired/cancelled', meta: {} });
      return;
    }

    // Check if there's a booking — if so, notify the provider
    const bookingRows = await db
      .select({
        id: bookings.id,
        providerId: bookings.providerId,
        providerName: providers.name,
        providerPhone: providers.phone,
        providerEmail: providers.email,
      })
      .from(bookings)
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .where(eq(bookings.jobId, jobId));

    // Cancel the job
    await db.update(jobs).set({ status: 'expired' } as Record<string, unknown>).where(eq(jobs.id, jobId));

    // Refund credit if no responses
    const [{ value: responseCount }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(providerResponses)
      .where(eq(providerResponses.jobId, jobId));

    let creditRefunded = false;
    if (responseCount === 0) {
      await db.update(workspaces)
        .set({ searchesUsed: sql`GREATEST(${workspaces.searchesUsed} - 1, 0)` } as Record<string, unknown>)
        .where(eq(workspaces.id, req.workspaceId));
      creditRefunded = true;
    }

    // Get job details for notification
    const [jobDetail] = await db
      .select({ diagnosis: jobs.diagnosis, zipCode: jobs.zipCode })
      .from(jobs).where(eq(jobs.id, jobId)).limit(1);
    const diagInfo = jobDetail?.diagnosis as { category?: string; summary?: string } | null;
    const category = diagInfo?.category?.replace(/_/g, ' ') ?? 'service';
    const summaryText = diagInfo?.summary?.replace(/\*\*(.+?)\*\*/g, '$1')?.slice(0, 150) ?? '';

    // Notify booked providers of cancellation
    const { sendSms, sendEmail } = await import('../services/notifications');
    for (const booking of bookingRows) {
      if (booking.providerPhone) {
        void sendSms(booking.providerPhone, `Hi ${booking.providerName}, your ${category} booking via Homie (${jobDetail?.zipCode ?? ''}) has been cancelled by the property manager.${summaryText ? ` Job: ${summaryText}` : ''} No action needed on your end.`);
      }
      if (booking.providerEmail) {
        void sendEmail(booking.providerEmail, `Booking Cancelled — ${category} job via Homie`,
          `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
            <h1 style="color: #E8632B; font-size: 24px;">homie</h1>
            <p style="font-size: 16px; color: #2D2926;">Hi ${booking.providerName},</p>
            <p style="font-size: 15px; color: #6B6560; line-height: 1.6;">Your <b>${category}</b> booking has been cancelled by the property manager.</p>
            ${summaryText ? `<div style="background: #F9F5F2; border-radius: 10px; padding: 14px 16px; margin: 16px 0; border: 1px solid rgba(0,0,0,0.04)">
              <div style="font-size: 12px; font-weight: bold; color: #9B9490; margin-bottom: 4px">Job Details</div>
              <div style="font-size: 14px; color: #6B6560; line-height: 1.5">${summaryText}</div>
              <div style="font-size: 12px; color: #9B9490; margin-top: 8px">Zip: <b>${jobDetail?.zipCode ?? ''}</b></div>
            </div>` : ''}
            <p style="font-size: 15px; color: #6B6560; line-height: 1.6;">No further action is needed on your end.</p>
            <p style="font-size: 13px; color: #9B9490; margin-top: 24px;">Thank you for being a Homie Pro.</p>
          </div>`);
      }

      // Update booking status
      await db.update(bookings).set({ status: 'cancelled' } as Record<string, unknown>).where(eq(bookings.id, booking.id));
    }

    res.json({
      data: {
        cancelled: true,
        credit_refunded: creditRefunded,
        providers_notified: bookingRows.length,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/dispatches/:jobId/cancel]');
    res.status(500).json({ data: null, error: 'Failed to cancel dispatch', meta: {} });
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

// POST /:workspaceId/bookings/:bookingId/cancel
router.post('/:workspaceId/bookings/:bookingId/cancel', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { bookingId } = req.params;

  try {
    // Verify booking belongs to workspace
    const [booking] = await db
      .select({
        id: bookings.id, jobId: bookings.jobId, status: bookings.status,
        providerId: bookings.providerId,
        providerName: providers.name, providerPhone: providers.phone, providerEmail: providers.email,
      })
      .from(bookings)
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .where(and(eq(bookings.id, bookingId), eq(jobs.workspaceId, req.workspaceId)))
      .limit(1);

    if (!booking) {
      res.status(404).json({ data: null, error: 'Booking not found', meta: {} });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(400).json({ data: null, error: 'Booking is already cancelled', meta: {} });
      return;
    }

    // Get job details for notification
    const [jobInfo] = await db
      .select({ diagnosis: jobs.diagnosis, zipCode: jobs.zipCode })
      .from(jobs).where(eq(jobs.id, booking.jobId)).limit(1);
    const bDiag = jobInfo?.diagnosis as { category?: string; summary?: string } | null;
    const bCategory = bDiag?.category?.replace(/_/g, ' ') ?? 'service';
    const bSummary = bDiag?.summary?.replace(/\*\*(.+?)\*\*/g, '$1')?.slice(0, 150) ?? '';

    // Cancel the booking
    await db.update(bookings).set({ status: 'cancelled' } as Record<string, unknown>).where(eq(bookings.id, bookingId));

    // Notify the provider
    const { sendSms, sendEmail } = await import('../services/notifications');
    if (booking.providerPhone) {
      void sendSms(booking.providerPhone, `Hi ${booking.providerName}, your ${bCategory} booking via Homie (${jobInfo?.zipCode ?? ''}) has been cancelled by the property manager.${bSummary ? ` Job: ${bSummary}` : ''} No action needed on your end.`);
    }
    if (booking.providerEmail) {
      void sendEmail(booking.providerEmail, `Booking Cancelled — ${bCategory} job via Homie`,
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
          <h1 style="color: #E8632B; font-size: 24px;">homie</h1>
          <p style="font-size: 16px; color: #2D2926;">Hi ${booking.providerName},</p>
          <p style="font-size: 15px; color: #6B6560; line-height: 1.6;">Your <b>${bCategory}</b> booking has been cancelled by the property manager.</p>
          ${bSummary ? `<div style="background: #F9F5F2; border-radius: 10px; padding: 14px 16px; margin: 16px 0; border: 1px solid rgba(0,0,0,0.04)">
            <div style="font-size: 12px; font-weight: bold; color: #9B9490; margin-bottom: 4px">Job Details</div>
            <div style="font-size: 14px; color: #6B6560; line-height: 1.5">${bSummary}</div>
            <div style="font-size: 12px; color: #9B9490; margin-top: 8px">Zip: <b>${jobInfo?.zipCode ?? ''}</b></div>
          </div>` : ''}
          <p style="font-size: 15px; color: #6B6560; line-height: 1.6;">No further action is needed on your end.</p>
          <p style="font-size: 13px; color: #9B9490; margin-top: 24px;">Thank you for being a Homie Pro.</p>
        </div>`);
    }

    res.json({ data: { cancelled: true, provider_notified: booking.providerName }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/bookings/:bid/cancel]');
    res.status(500).json({ data: null, error: 'Failed to cancel booking', meta: {} });
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

// ── Track PMS Import ────────────────────────────────────────────────────────

interface TrackBedType {
  id?: number;
  bedTypeId?: number;
  name?: string;
  bedType?: string;
  bedTypeName?: string;
  type?: string;
  count?: string | number;
  quantity?: string | number;
}

interface TrackRoom {
  id?: number;
  name?: string;
  type?: string;
  roomType?: string;
  description?: string;
  sleeps?: number;
  hasAttachedBathroom?: boolean;
  beds?: TrackBedType[];
  order?: number;
  sortOrder?: number;
}

interface TrackUnit {
  id: number;
  name?: string;
  shortName?: string;
  // Address fields (flat on the unit, not nested)
  streetAddress?: string;
  extendedAddress?: string;
  locality?: string; // city
  region?: string; // state
  postal?: string; // zip
  country?: string;
  // Physical
  bedrooms?: number;
  fullBathrooms?: number;
  threeQuarterBathrooms?: number;
  halfBathrooms?: number;
  maxOccupancy?: number;
  floors?: number;
  // Nested objects
  rooms?: TrackRoom[];
  bedTypes?: TrackBedType[];
  // Media
  coverImage?: string;
  // Square footage
  squareFeet?: number;
  // Legacy/fallback fields
  address?: { street?: string; city?: string; state?: string; zip?: string };
  bathrooms?: number;
  square_feet?: number;
  property_type?: string;
  unit_type?: string;
  status?: string;
  isActive?: boolean;
  bed_types?: TrackBedType[];
}

// POST /:workspaceId/import/track — Import properties from Track PMS
router.post('/:workspaceId/import/track', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const body = req.body as {
    track_domain?: string;
    api_key?: string;
    api_secret?: string;
    update_existing?: boolean;
  };

  if (!body.track_domain || !body.api_key || !body.api_secret) {
    res.status(400).json({ data: null, error: 'track_domain, api_key, and api_secret are required', meta: {} });
    return;
  }

  const domain = body.track_domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const authHeader = 'Basic ' + Buffer.from(`${body.api_key}:${body.api_secret}`).toString('base64');

  try {
    // Fetch units from Track PMS API with pagination
    // Track API base is typically https://company.trackhs.com/api — endpoint is /pms/units
    const base = domain.includes('/api') ? `https://${domain}` : `https://${domain}/api`;
    const units: TrackUnit[] = [];
    let nextUrl: string | null = `${base}/pms/units?size=50`;

    while (nextUrl) {
      const trackRes = await fetch(nextUrl, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });

      if (!trackRes.ok) {
        const errText = await trackRes.text().catch(() => '');
        logger.error({ status: trackRes.status, body: errText }, '[Track import] API call failed');
        res.status(trackRes.status === 401 ? 401 : 502).json({
          data: null,
          error: trackRes.status === 401 ? 'Invalid Track API credentials' : `Track API returned ${trackRes.status}`,
          meta: {},
        });
        return;
      }

      const trackData = await trackRes.json() as Record<string, unknown>;


      if (Array.isArray(trackData)) {
        units.push(...(trackData as unknown as TrackUnit[]));
        nextUrl = null;
      } else {
        // Track uses HAL+JSON: data is in _embedded.{collection} or top-level keys
        const embedded = trackData._embedded as Record<string, unknown> | undefined;
        const pageUnits = (
          embedded?.units ?? embedded?.unit ?? embedded?.properties ??
          trackData.contents ?? trackData.results ?? trackData.data ??
          trackData.units ?? trackData.items ?? trackData.records ?? []
        ) as TrackUnit[];
        units.push(...pageUnits);
        // Follow pagination links
        const links = trackData.links as Record<string, unknown> | undefined;
        const _links = trackData._links as Record<string, unknown> | undefined;
        const nextLink = (_links?.next as Record<string, unknown>)?.href as string | undefined;
        nextUrl = (trackData.next as string) ?? (links?.next as string) ?? nextLink ?? null;
        if (nextUrl && !nextUrl.startsWith('http')) {
          nextUrl = `${base}${nextUrl.startsWith('/') ? '' : '/'}${nextUrl}`;
        }
        // Stop if no more results
        if (pageUnits.length === 0) nextUrl = null;
      }
    }

    // Fetch cover image for each unit from /pms/units/{id}/images
    for (const u of units) {
      try {
        const imgUrl = `${base}/pms/units/${u.id}/images?size=1`;
        const imgRes = await fetch(imgUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
        if (imgRes.ok) {
          const imgData = await imgRes.json() as Record<string, unknown>;
          const embedded = imgData._embedded as Record<string, unknown> | undefined;
          const images = (embedded?.images ?? []) as Array<{ url?: string; order?: number }>;
          if (images.length > 0 && images[0].url) {
            u.coverImage = images[0].url;
          }
        }
      } catch (err) { logger.warn({ err, unitId: u.id }, '[Track import] Failed to fetch unit cover image'); }
    }

    // Fetch bed type definitions to map bedTypeId → name
    const bedTypeMap = new Map<number, string>();
    try {
      const btUrl = `${base}/pms/units/bed-types?size=100`;
      const btRes = await fetch(btUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
      if (btRes.ok) {
        const btData = await btRes.json() as Record<string, unknown>;
        const embedded = btData._embedded as Record<string, unknown> | undefined;
        const btList = (embedded?.unitBedTypes ?? embedded?.bedTypes ?? embedded?.['bed-types'] ?? btData.unitBedTypes ?? btData.bedTypes ?? (Array.isArray(btData) ? btData : [])) as Array<{ id?: number; name?: string }>;
        for (const bt of btList) {
          if (bt.id != null && bt.name) bedTypeMap.set(bt.id, bt.name);
        }
      }
    } catch (err) { logger.warn({ err }, '[Track import] Failed to fetch bed type definitions'); }

    // Fetch rooms (with nested beds) for each unit from /pms/units/{id}/rooms
    for (const u of units) {
      try {
        const roomUrl = `${base}/pms/units/${u.id}/rooms?size=50`;
        const roomRes = await fetch(roomUrl, {
          headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        });
        if (roomRes.ok) {
          const roomData = await roomRes.json() as Record<string, unknown>;
          const embedded = roomData._embedded as Record<string, unknown> | undefined;
          // Track uses _embedded.unitRooms
          const roomList = (
            embedded?.unitRooms ?? embedded?.rooms ?? embedded?.room ??
            roomData.unitRooms ?? roomData.rooms ??
            (Array.isArray(roomData) ? roomData : [])
          ) as TrackRoom[];
          if (roomList.length > 0) {
            u.rooms = roomList;
          }
        }
      } catch (err) { logger.warn({ err, unitId: u.id }, '[Track import] Failed to fetch rooms for unit'); }
    }

    // Only import active units
    const activeUnits = units.filter(u => u.isActive !== false && u.status !== 'inactive');
    const totalFetched = units.length;

    if (activeUnits.length === 0) {
      // Re-fetch first page to include debug info in response
      const debugRes = await fetch(`${base}/pms/units?size=50`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      const debugData = await debugRes.json().catch(() => ({})) as Record<string, unknown>;
      const debugKeys = Object.keys(debugData);
      let hint = '';
      // Check top-level arrays
      for (const key of debugKeys) {
        const val = debugData[key];
        if (Array.isArray(val) && val.length > 0) {
          hint = `Found array at "${key}" with ${val.length} items`;
          break;
        }
        // Check nested objects for arrays (like _embedded.units)
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const nested = val as Record<string, unknown>;
          for (const nk of Object.keys(nested)) {
            if (Array.isArray(nested[nk]) && (nested[nk] as unknown[]).length > 0) {
              hint = `Found array at "${key}.${nk}" with ${(nested[nk] as unknown[]).length} items`;
              break;
            }
          }
          if (hint) break;
        }
      }
      res.json({ data: { imported: 0, skipped: 0, total: 0 }, error: null, meta: { debug_keys: debugKeys, hint } });
      return;
    }

    // Map Track bed type names to Homie bed type values
    const BED_TYPE_MAP: Record<string, string> = {
      'king': 'king', 'king bed': 'king', 'king size': 'king', 'california king': 'king', 'cal king': 'king',
      'queen': 'queen', 'queen bed': 'queen', 'queen size': 'queen',
      'full': 'full', 'full bed': 'full', 'full size': 'full', 'double': 'full', 'double bed': 'full',
      'twin': 'twin', 'twin bed': 'twin', 'twin size': 'twin', 'single': 'twin', 'single bed': 'twin', 'twin/single': 'twin',
      'sofa bed': 'sofa_bed', 'sofa_bed': 'sofa_bed', 'sleeper sofa': 'sofa_bed', 'sofa sleeper': 'sofa_bed',
      'pull out': 'sofa_bed', 'pull-out': 'sofa_bed', 'pullout': 'sofa_bed', 'futon': 'sofa_bed',
      'bunk': 'bunk', 'bunk bed': 'bunk', 'bunk beds': 'bunk', 'bunks': 'bunk',
      'crib': 'crib', 'baby crib': 'crib', 'pack and play': 'crib', 'pack n play': 'crib',
      'daybed': 'full', 'trundle': 'twin', 'trundle bed': 'twin',
      'air mattress': 'full', 'airbed': 'full', 'air bed': 'full',
      'murphy': 'full', 'murphy bed': 'full', 'wall bed': 'full',
    };

    function normalizeBedType(name: string): string {
      const key = name.toLowerCase().trim();
      return BED_TYPE_MAP[key] ?? key.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }

    // Map a Track unit to Homie property fields
    function mapUnit(u: TrackUnit) {
      const totalBathrooms = (u.fullBathrooms ?? 0) + (u.threeQuarterBathrooms ?? 0) * 0.75 + (u.halfBathrooms ?? 0) * 0.5;
      const bathroomStr = totalBathrooms > 0 ? String(totalBathrooms) : (u.bathrooms ? String(u.bathrooms) : null);

      // Collect beds from all sources: _embedded.rooms[].beds[], rooms[].beds[], bedTypes[], _embedded.bedTypes[]
      const allBeds: { type: string; count: number }[] = [];
      const embedded = (u as unknown as Record<string, unknown>)._embedded as Record<string, unknown> | undefined;

      function addBed(name: string, count: string | number) {
        const bedType = normalizeBedType(name);
        const bedCount = typeof count === 'string' ? parseInt(count, 10) || 1 : (count ?? 1);
        const existing = allBeds.find(b => b.type === bedType);
        if (existing) { existing.count += bedCount; }
        else { allBeds.push({ type: bedType, count: bedCount }); }
      }

      function resolveBedName(bed: TrackBedType): string {
        // Try bedTypeId lookup first, then name fields
        if (bed.bedTypeId != null && bedTypeMap.has(bed.bedTypeId)) return bedTypeMap.get(bed.bedTypeId)!;
        if (bed.id != null && bedTypeMap.has(bed.id)) return bedTypeMap.get(bed.id)!;
        return bed.name ?? bed.bedType ?? bed.bedTypeName ?? bed.type ?? 'other';
      }

      // Primary source: rooms with nested beds
      const rooms = u.rooms as TrackRoom[] | undefined;
      if (rooms && rooms.length > 0) {
        for (const room of rooms) {
          if (room.beds && room.beds.length > 0) {
            for (const bed of room.beds) {
              addBed(resolveBedName(bed), bed.count ?? bed.quantity ?? 1);
            }
          }
        }
      }

      // Fallback: top-level bedTypes
      if (allBeds.length === 0) {
        const topBeds = (u.bedTypes ?? u.bed_types ?? []) as TrackBedType[];
        for (const b of topBeds) {
          addBed(resolveBedName(b), b.count ?? b.quantity ?? 1);
        }
      }

      const bedConfig = allBeds.length > 0 ? allBeds : null;

      const roomNotes = null;

      return {
        name: u.name || u.shortName || `Unit ${u.id}`,
        address: u.streetAddress ?? u.address?.street ?? null,
        city: u.locality ?? u.address?.city ?? null,
        state: u.region ?? u.address?.state ?? null,
        zipCode: u.postal ?? u.address?.zip ?? null,
        propertyType: u.property_type ?? u.unit_type ?? 'vacation_rental',
        unitCount: 1,
        bedrooms: u.bedrooms ?? null,
        bathrooms: bathroomStr,
        sqft: u.squareFeet ?? u.square_feet ?? null,
        beds: bedConfig,
        photoUrls: u.coverImage ? [u.coverImage] : null,
        notes: roomNotes || null,
      };
    }

    // Check which units are already imported (by pmsExternalId)
    const existingProps = await db
      .select({ id: properties.id, pmsExternalId: properties.pmsExternalId })
      .from(properties)
      .where(and(
        eq(properties.workspaceId, req.workspaceId),
        eq(properties.pmsSource, 'track'),
      ));
    const existingMap = new Map(existingProps.map(p => [p.pmsExternalId, p.id]));

    // Insert new properties
    const newUnits = activeUnits.filter(u => !existingMap.has(String(u.id)));
    let imported = 0;
    if (newUnits.length > 0) {
      const toInsert = newUnits.map(u => ({
        workspaceId: req.workspaceId,
        pmsSource: 'track' as const,
        pmsExternalId: String(u.id),
        ...mapUnit(u),
      }));
      const inserted = await db.insert(properties).values(toInsert as unknown as typeof properties.$inferInsert[]).returning();
      imported = inserted.length;
    }

    // Update existing properties if requested
    let updated = 0;
    if (body.update_existing) {
      const existingUnits = activeUnits.filter(u => existingMap.has(String(u.id)));
      for (const u of existingUnits) {
        const propId = existingMap.get(String(u.id))!;
        const mapped = mapUnit(u);
        await db.update(properties)
          .set({ ...mapped, updatedAt: new Date() } as Record<string, unknown>)
          .where(eq(properties.id, propId));
        updated++;
      }
    }

    res.json({
      data: {
        imported,
        updated,
        skipped: activeUnits.length - imported - updated,
        total: activeUnits.length,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/import/track]');
    res.status(500).json({ data: null, error: 'Failed to import from Track PMS', meta: {} });
  }
});

// ── Track PMS Reservations Import ───────────────────────────────────────────

interface TrackReservation {
  id?: number | string;
  unitId?: number | string;
  unit_id?: number | string;
  propertyId?: number | string;
  property_id?: number | string;
  guestName?: string;
  guest?: string;
  name?: string;
  arrivalDate?: string;
  checkIn?: string;
  startDate?: string;
  departureDate?: string;
  checkOut?: string;
  endDate?: string;
  status?: string;
  numGuests?: number;
  guests?: number;
  numberOfGuests?: number;
}

// POST /:workspaceId/import/track/reservations — Import reservations from Track PMS
router.post('/:workspaceId/import/track/reservations', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const body = req.body as {
    track_domain?: string;
    api_key?: string;
    api_secret?: string;
  };

  if (!body.track_domain || !body.api_key || !body.api_secret) {
    res.status(400).json({ data: null, error: 'track_domain, api_key, and api_secret are required', meta: {} });
    return;
  }

  const domain = body.track_domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const authHeader = 'Basic ' + Buffer.from(`${body.api_key}:${body.api_secret}`).toString('base64');
  const base = domain.includes('/api') ? `https://${domain}` : `https://${domain}/api`;

  try {
    // Find all Track-linked properties in this workspace
    const trackProperties = await db
      .select({ id: properties.id, pmsExternalId: properties.pmsExternalId })
      .from(properties)
      .where(and(
        eq(properties.workspaceId, req.workspaceId),
        eq(properties.pmsSource, 'track'),
      ));

    const linkedProps = trackProperties.filter(p => p.pmsExternalId != null && p.pmsExternalId !== '');

    if (linkedProps.length === 0) {
      res.json({ data: { imported: 0, updated: 0, total: 0 }, error: null, meta: { message: 'No Track-linked properties found in this workspace' } });
      return;
    }

    const now = new Date();
    let totalImported = 0;
    let totalUpdated = 0;
    let totalCount = 0;

    // Try to discover the correct reservations endpoint
    // Track API may use /pms/reservations (global) or /pms/units/{id}/reservations
    let reservationEndpointStyle: 'per-unit' | 'global' | null = null;

    // Test with first unit to find the right endpoint
    const testUnitId = linkedProps[0].pmsExternalId!;
    const perUnitUrl = `${base}/pms/units/${testUnitId}/reservations?size=1`;
    const globalUrl = `${base}/pms/reservations?size=1`;

    try {
      const testPerUnit = await fetch(perUnitUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
      logger.info({ status: testPerUnit.status, url: perUnitUrl }, '[Track reservations] per-unit endpoint test');
      if (testPerUnit.ok) reservationEndpointStyle = 'per-unit';
    } catch (err) { logger.warn({ err, url: perUnitUrl }, '[Track reservations] per-unit endpoint test failed'); }

    if (!reservationEndpointStyle) {
      try {
        const testGlobal = await fetch(globalUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
        logger.info({ status: testGlobal.status, url: globalUrl }, '[Track reservations] global endpoint test');
        if (testGlobal.ok) {
          reservationEndpointStyle = 'global';
          // Log sample response
          const ct = testGlobal.headers.get('content-type') || '';
          if (ct.includes('json')) {
            const sample = await testGlobal.json() as Record<string, unknown>;
            logger.info({ keys: Object.keys(sample), embeddedKeys: sample._embedded ? Object.keys(sample._embedded as Record<string, unknown>) : null, isArray: Array.isArray(sample) }, '[Track reservations] global response structure');
          }
        }
      } catch (err) { logger.warn({ err, url: globalUrl }, '[Track reservations] global endpoint test failed'); }
    }

    logger.info({ style: reservationEndpointStyle }, '[Track reservations] endpoint detection result');

    if (!reservationEndpointStyle) {
      res.json({ data: { imported: 0, updated: 0, total: 0 }, error: null, meta: { message: 'Track API does not support reservations endpoint' } });
      return;
    }

    // If global endpoint, fetch all reservations at once
    const allReservationsByUnit = new Map<string, TrackReservation[]>();

    if (reservationEndpointStyle === 'global') {
      let nextUrl: string | null = `${base}/pms/reservations?size=200`;
      while (nextUrl) {
        try {
          logger.info({ url: nextUrl }, '[Track reservations] fetching global reservations page');
          const gRes = await fetch(nextUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
          logger.info({ status: gRes.status }, '[Track reservations] global page response');
          if (!gRes.ok) break;
          const ct = gRes.headers.get('content-type') || '';
          if (!ct.includes('json')) break;
          const gData = await gRes.json() as Record<string, unknown>;

          let items: TrackReservation[] = [];
          if (Array.isArray(gData)) {
            items = gData as TrackReservation[];
          } else {
            const embedded = gData._embedded as Record<string, unknown> | undefined;
            items = (
              embedded?.reservations ?? embedded?.unitReservations ??
              gData.reservations ?? gData.contents ?? gData.results ??
              gData.data ?? gData.items ?? gData.records ?? []
            ) as TrackReservation[];
          }

          // Log first reservation's keys to understand the data shape
          if (items.length > 0) {
            const sample = items[0] as Record<string, unknown>;
            logger.info({ totalItems: (gData as Record<string, unknown>).total_items, fetchedCount: items.length, sampleKeys: Object.keys(sample), sample: JSON.stringify(sample).slice(0, 800) }, '[Track reservations] global fetch sample');
          } else {
            logger.info({ totalItems: (gData as Record<string, unknown>).total_items }, '[Track reservations] global fetch returned 0 items');
          }

          for (const r of items) {
            const rr = r as Record<string, unknown>;
            const uid = String(rr.unitId ?? rr.unit_id ?? rr.propertyId ?? rr.property_id ?? rr.unit ?? '');
            if (!uid) {
              logger.warn({ reservationId: rr.id, keys: Object.keys(rr) }, '[Track reservations] reservation has no unit ID field');
              continue;
            }
            if (!allReservationsByUnit.has(uid)) allReservationsByUnit.set(uid, []);
            allReservationsByUnit.get(uid)!.push(r);
          }

          // Pagination
          const links = gData._links as Record<string, { href?: string }> | undefined;
          const rawNext = links?.next?.href ?? (gData as Record<string, unknown>).next;
          if (rawNext && typeof rawNext === 'string' && rawNext !== nextUrl) {
            nextUrl = rawNext.startsWith('http') ? rawNext : `https://${domain}${rawNext}`;
          } else {
            nextUrl = null;
          }
        } catch { break; }
      }
    }

    for (const prop of linkedProps) {
      const unitId = prop.pmsExternalId!;

      let trackReservations: TrackReservation[] = [];

      if (reservationEndpointStyle === 'global') {
        // Use pre-fetched global data
        trackReservations = allReservationsByUnit.get(unitId) ?? [];
      } else {
        // Fetch per-unit
        const url = `${base}/pms/units/${unitId}/reservations?size=50`;

        let trackRes: globalThis.Response;
        try {
          trackRes = await fetch(url, {
            headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
          });
        } catch (err) {
          logger.warn({ err, unitId }, '[Track reservations import] Failed to fetch reservations for unit');
          continue;
        }

        if (!trackRes.ok) {
          const errText = await trackRes.text().catch(() => '');
          if (trackRes.status === 401) {
            res.status(401).json({ data: null, error: 'Invalid Track API credentials', meta: {} });
            return;
          }
          logger.warn({ status: trackRes.status, body: errText, unitId }, '[Track reservations import] API call failed for unit');
          continue;
        }

        const contentType = trackRes.headers.get('content-type') || '';
        if (!contentType.includes('json')) continue;

        let trackData: Record<string, unknown>;
        try {
          trackData = await trackRes.json() as Record<string, unknown>;
        } catch { continue; }

        if (Array.isArray(trackData)) {
          trackReservations = trackData as TrackReservation[];
        } else {
          const embedded = trackData._embedded as Record<string, unknown> | undefined;
          trackReservations = (
            embedded?.reservations ?? embedded?.unitReservations ??
            trackData.reservations ?? trackData.contents ?? trackData.results ??
            trackData.data ?? trackData.items ?? trackData.records ?? []
          ) as TrackReservation[];
        }
      }

      for (const tr of trackReservations) {
        const externalId = tr.id != null ? String(tr.id) : null;
        if (!externalId) continue;

        const guestName = tr.guestName ?? tr.guest ?? tr.name ?? null;
        const checkInStr = tr.arrivalDate ?? tr.checkIn ?? tr.startDate;
        const checkOutStr = tr.departureDate ?? tr.checkOut ?? tr.endDate;

        if (!checkInStr || !checkOutStr) continue;

        const checkIn = new Date(checkInStr);
        const checkOut = new Date(checkOutStr);

        // Skip past reservations (checkOut in the past)
        if (checkOut < now) continue;

        const guestCount = tr.numGuests ?? tr.guests ?? tr.numberOfGuests ?? null;
        const status = tr.status ?? 'confirmed';

        totalCount++;

        // Upsert: check if reservation with this pmsReservationId already exists for this property
        const [existing] = await db
          .select({ id: reservations.id })
          .from(reservations)
          .where(and(
            eq(reservations.propertyId, prop.id),
            eq(reservations.pmsReservationId, externalId),
          ))
          .limit(1);

        if (existing) {
          // Update existing reservation
          await db.update(reservations)
            .set({
              guestName,
              checkIn,
              checkOut,
              status,
              guests: guestCount,
              updatedAt: new Date(),
            })
            .where(eq(reservations.id, existing.id));
          totalUpdated++;
        } else {
          // Insert new reservation
          await db.insert(reservations).values({
            propertyId: prop.id,
            workspaceId: req.workspaceId,
            guestName,
            checkIn,
            checkOut,
            status,
            guests: guestCount,
            source: 'track',
            pmsReservationId: externalId,
          });
          totalImported++;
        }
      }
    }

    res.json({
      data: { imported: totalImported, updated: totalUpdated, total: totalCount },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/import/track/reservations]');
    res.status(500).json({ data: null, error: 'Failed to import reservations from Track PMS', meta: {} });
  }
});

// ── Property Reservations ──────────────────────────────────────────────────

// GET /:workspaceId/properties/:propertyId/reservations
router.get('/:workspaceId/properties/:propertyId/reservations', requireWorkspace, async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  const { from, to } = req.query as { from?: string; to?: string };

  try {
    // Verify property belongs to workspace
    const [prop] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId)))
      .limit(1);

    if (!prop) {
      res.status(404).json({ data: null, error: 'Property not found', meta: {} });
      return;
    }

    // Default date range: today to 90 days from now
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const defaultTo = new Date(defaultFrom.getTime() + 90 * 24 * 60 * 60 * 1000);

    const fromDate = from ? new Date(from) : defaultFrom;
    const toDate = to ? new Date(to) : defaultTo;

    const rows = await db
      .select()
      .from(reservations)
      .where(and(
        eq(reservations.propertyId, propertyId),
        gte(reservations.checkIn, fromDate),
        lte(reservations.checkIn, toDate),
      ))
      .orderBy(reservations.checkIn);

    res.json({ data: { reservations: rows }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/reservations]');
    res.status(500).json({ data: null, error: 'Failed to fetch reservations', meta: {} });
  }
});

// ── Estimate Summary PDF ────────────────────────────────────────────────────

// GET /:workspaceId/jobs/:jobId/estimate-pdf
router.get('/:workspaceId/jobs/:jobId/estimate-pdf', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    // Check plan
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, req.workspaceId))
      .limit(1);

    if (!ws) {
      res.status(404).json({ data: null, error: 'Workspace not found', meta: {} });
      return;
    }

    const allowedPlans = ['professional', 'business', 'enterprise'];
    if (!allowedPlans.includes(ws.plan)) {
      res.status(403).json({ data: null, error: 'Estimate PDF export requires a Professional, Business, or Enterprise plan.', meta: {} });
      return;
    }

    // Load job
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, req.workspaceId)))
      .limit(1);

    if (!job) {
      res.status(404).json({ data: null, error: 'Job not found', meta: {} });
      return;
    }

    // Load property
    let property = { name: 'Unknown Property', address: null as string | null, city: null as string | null, state: null as string | null, zipCode: job.zipCode as string | null };
    if (job.propertyId) {
      const [prop] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, job.propertyId))
        .limit(1);
      if (prop) {
        property = { name: prop.name, address: prop.address, city: prop.city, state: prop.state, zipCode: prop.zipCode };
      }
    }

    // Load provider responses with provider info
    const responses = await db
      .select({
        providerName: providers.name,
        providerPhone: providers.phone,
        providerEmail: providers.email,
        providerWebsite: providers.website,
        googleRating: providers.googleRating,
        reviewCount: providers.reviewCount,
        channel: providerResponses.channel,
        quotedPrice: providerResponses.quotedPrice,
        availability: providerResponses.availability,
        message: providerResponses.message,
        createdAt: providerResponses.createdAt,
        providerId: providerResponses.providerId,
        outreachAttemptId: providerResponses.outreachAttemptId,
      })
      .from(providerResponses)
      .innerJoin(providers, eq(providerResponses.providerId, providers.id))
      .where(eq(providerResponses.jobId, jobId))
      .orderBy(providerResponses.createdAt);

    // Load outreach attempts to compute response time and declined count
    const attempts = await db
      .select({
        id: outreachAttempts.id,
        providerId: outreachAttempts.providerId,
        status: outreachAttempts.status,
        attemptedAt: outreachAttempts.attemptedAt,
        respondedAt: outreachAttempts.respondedAt,
      })
      .from(outreachAttempts)
      .where(eq(outreachAttempts.jobId, jobId));

    const declinedCount = attempts.filter(a => a.status === 'declined' || a.status === 'expired' || a.status === 'no_response').length;

    // Build attempt lookup for response time
    const attemptMap = new Map(attempts.map(a => [a.id, a]));

    // Check which providers are preferred vendors
    const preferredRows = await db
      .select({ providerId: preferredVendors.providerId })
      .from(preferredVendors)
      .where(and(eq(preferredVendors.workspaceId, req.workspaceId), eq(preferredVendors.active, true)));
    const preferredSet = new Set(preferredRows.map(r => r.providerId));

    // Build estimates array
    const estimatesArr = responses.map(r => {
      let responseTimeSec: number | null = null;
      if (r.outreachAttemptId) {
        const attempt = attemptMap.get(r.outreachAttemptId);
        if (attempt?.attemptedAt && attempt?.respondedAt) {
          responseTimeSec = (new Date(attempt.respondedAt).getTime() - new Date(attempt.attemptedAt).getTime()) / 1000;
        }
      }
      return {
        providerName: r.providerName,
        providerPhone: r.providerPhone,
        providerEmail: r.providerEmail,
        providerWebsite: r.providerWebsite,
        googleRating: r.googleRating,
        reviewCount: r.reviewCount,
        channel: r.channel,
        isPreferred: preferredSet.has(r.providerId),
        quotedPrice: r.quotedPrice,
        availability: r.availability,
        message: r.message,
        responseTimeSec,
      };
    });

    const diagnosis = job.diagnosis as { category: string; severity: string; summary: string; confidence?: number } | null;

    const pdfBuffer = await generateEstimatePDF({
      workspace: {
        name: ws.name,
        logoUrl: ws.logoUrl,
        companyAddress: ws.companyAddress,
        companyPhone: ws.companyPhone,
        companyEmail: ws.companyEmail,
      },
      property,
      job: {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        diagnosis,
        preferredTiming: job.preferredTiming,
        budget: job.budget,
      },
      estimates: estimatesArr,
      declinedCount,
    });

    const filename = `estimate-summary-${job.id.substring(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/jobs/:jobId/estimate-pdf]');
    res.status(500).json({ data: null, error: 'Failed to generate estimate PDF', meta: {} });
  }
});

// ── Dashboard ────────────────────────────────────────────────────────────────

// GET /:workspaceId/dashboard
router.get('/:workspaceId/dashboard', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // KPIs
    const [{ value: activeDispatches }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(
        eq(jobs.workspaceId, req.workspaceId),
        sql`${jobs.status} IN ('open', 'collecting', 'dispatching')`,
      ));

    const [{ value: completedThisMonth }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(
        eq(jobs.workspaceId, req.workspaceId),
        eq(jobs.status, 'completed'),
        gte(jobs.createdAt, firstOfMonth),
      ));

    const [{ value: totalBookings }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .where(eq(jobs.workspaceId, req.workspaceId));

    // Avg response minutes this month
    const [avgRow] = await db
      .select({
        avg: sql<number | null>`avg(EXTRACT(EPOCH FROM (${outreachAttempts.respondedAt} - ${outreachAttempts.attemptedAt})) / 60)`,
      })
      .from(outreachAttempts)
      .innerJoin(jobs, eq(outreachAttempts.jobId, jobs.id))
      .where(and(
        eq(jobs.workspaceId, req.workspaceId),
        sql`${outreachAttempts.respondedAt} IS NOT NULL`,
        gte(outreachAttempts.attemptedAt, firstOfMonth),
      ));
    const avgResponseMinutes = avgRow.avg !== null ? Math.round(avgRow.avg * 10) / 10 : null;

    // This month vs last month dispatches
    const [{ value: dispatchesThisMonth }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, req.workspaceId), gte(jobs.createdAt, firstOfMonth)));

    const [{ value: dispatchesLastMonth }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(
        eq(jobs.workspaceId, req.workspaceId),
        gte(jobs.createdAt, firstOfLastMonth),
        lte(jobs.createdAt, firstOfMonth),
      ));

    // Bookings this/last month
    const [{ value: bookingsThisMonth }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .where(and(eq(jobs.workspaceId, req.workspaceId), gte(bookings.confirmedAt, firstOfMonth)));

    const [{ value: bookingsLastMonth }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .where(and(
        eq(jobs.workspaceId, req.workspaceId),
        gte(bookings.confirmedAt, firstOfLastMonth),
        lte(bookings.confirmedAt, firstOfMonth),
      ));

    // Recent activity (last 10 events) — union of dispatches, quotes, bookings
    const recentDispatches = await db
      .select({
        type: sql<string>`'dispatch'`,
        title: sql<string>`COALESCE(${jobs.diagnosis}->>'category', 'Job')`,
        propertyName: sql<string | null>`NULL`,
        providerName: sql<string | null>`NULL`,
        jobId: jobs.id,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .where(eq(jobs.workspaceId, req.workspaceId))
      .orderBy(desc(jobs.createdAt))
      .limit(10);

    const recentQuotes = await db
      .select({
        type: sql<string>`'quote'`,
        title: sql<string>`'Quote received'`,
        propertyName: sql<string | null>`NULL`,
        providerName: providers.name,
        jobId: providerResponses.jobId,
        createdAt: providerResponses.createdAt,
      })
      .from(providerResponses)
      .innerJoin(jobs, eq(providerResponses.jobId, jobs.id))
      .innerJoin(providers, eq(providerResponses.providerId, providers.id))
      .where(eq(jobs.workspaceId, req.workspaceId))
      .orderBy(desc(providerResponses.createdAt))
      .limit(10);

    const recentBookings = await db
      .select({
        type: sql<string>`'booking'`,
        title: sql<string>`'Booking confirmed'`,
        propertyName: sql<string | null>`NULL`,
        providerName: providers.name,
        jobId: bookings.jobId,
        createdAt: bookings.confirmedAt,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .where(eq(jobs.workspaceId, req.workspaceId))
      .orderBy(desc(bookings.confirmedAt))
      .limit(10);

    const allActivity = [
      ...recentDispatches.map(r => ({ type: r.type, title: r.title, property_name: r.propertyName, provider_name: r.providerName, job_id: r.jobId, created_at: r.createdAt.toISOString() })),
      ...recentQuotes.map(r => ({ type: r.type, title: r.title, property_name: r.propertyName, provider_name: r.providerName, job_id: r.jobId, created_at: r.createdAt.toISOString() })),
      ...recentBookings.map(r => ({ type: r.type, title: r.title, property_name: r.propertyName, provider_name: r.providerName, job_id: r.jobId, created_at: r.createdAt.toISOString() })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    // Top vendors by booking count
    const topVendors = await db
      .select({
        name: providers.name,
        bookingCount: sql<number>`count(*)::int`,
        avgRating: providers.googleRating,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .where(eq(jobs.workspaceId, req.workspaceId))
      .groupBy(providers.id, providers.name, providers.googleRating)
      .orderBy(sql`count(*) DESC`)
      .limit(5);

    // Dispatches by category
    const dispatchesByCategory = await db
      .select({
        category: sql<string>`COALESCE(${jobs.diagnosis}->>'category', 'general')`,
        count: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(eq(jobs.workspaceId, req.workspaceId))
      .groupBy(sql`${jobs.diagnosis}->>'category'`)
      .orderBy(sql`count(*) DESC`);

    res.json({
      data: {
        active_dispatches: activeDispatches,
        completed_this_month: completedThisMonth,
        total_bookings: totalBookings,
        avg_response_minutes: avgResponseMinutes,
        dispatches_this_month: dispatchesThisMonth,
        dispatches_last_month: dispatchesLastMonth,
        bookings_this_month: bookingsThisMonth,
        bookings_last_month: bookingsLastMonth,
        recent_activity: allActivity,
        top_vendors: topVendors.map(v => ({
          name: v.name,
          booking_count: v.bookingCount,
          avg_rating: v.avgRating,
        })),
        dispatches_by_category: dispatchesByCategory.map(d => ({
          category: d.category,
          count: d.count,
        })),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/dashboard]');
    res.status(500).json({ data: null, error: 'Failed to fetch dashboard data', meta: {} });
  }
});

// POST /:workspaceId/dashboard/seasonal-suggestions
router.post('/:workspaceId/dashboard/seasonal-suggestions', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const { count: maxCount } = (req.body ?? {}) as { count?: number };
    const limit = Math.min(maxCount ?? 8, 8);

    // Load workspace properties
    const props = await db
      .select({
        name: properties.name,
        city: properties.city,
        state: properties.state,
        zipCode: properties.zipCode,
        beds: properties.beds,
        propertyType: properties.propertyType,
      })
      .from(properties)
      .where(and(eq(properties.workspaceId, req.workspaceId), eq(properties.active, true)));

    if (props.length === 0) {
      res.json({ data: [], error: null, meta: {} });
      return;
    }

    const now = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonth = months[now.getMonth()];
    const seasons: Record<number, string> = { 0: 'winter', 1: 'winter', 2: 'spring', 3: 'spring', 4: 'spring', 5: 'summer', 6: 'summer', 7: 'summer', 8: 'fall', 9: 'fall', 10: 'fall', 11: 'winter' };
    const currentSeason = seasons[now.getMonth()];

    const propertyList = props.map(p => {
      const parts = [p.name];
      if (p.city || p.state) parts.push(`(${[p.city, p.state].filter(Boolean).join(', ')})`);
      if (p.propertyType) parts.push(`- ${p.propertyType}`);
      return parts.join(' ');
    }).join('\n');

    // Summarize properties by location (don't send all 44+ individual names)
    const locationGroups: Record<string, { count: number; types: Set<string>; names: string[] }> = {};
    for (const p of props) {
      const loc = [p.city, p.state].filter(Boolean).join(', ') || 'Unknown location';
      if (!locationGroups[loc]) locationGroups[loc] = { count: 0, types: new Set(), names: [] };
      locationGroups[loc].count++;
      if (p.propertyType) locationGroups[loc].types.add(p.propertyType);
      if (locationGroups[loc].names.length < 3) locationGroups[loc].names.push(p.name);
    }

    const locationSummary = Object.entries(locationGroups).map(([loc, g]) =>
      `${loc}: ${g.count} properties (${[...g.types].join(', ')}) — e.g. ${g.names.join(', ')}`
    ).join('\n');

    const anthropic = new Anthropic();

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: 'You are a property maintenance expert. Generate seasonal maintenance suggestions for vacation rental and residential properties. Each suggestion should be a specific, actionable task that a property manager can dispatch to a vendor. Keep property name arrays short — use 2-3 example names max.',
      messages: [
        {
          role: 'user',
          content: `Current month: ${currentMonth} (${currentSeason})\nTotal properties: ${props.length}\n\nProperty locations:\n${locationSummary}\n\nGenerate exactly ${limit} seasonal maintenance suggestions as a JSON array. Each item: { "title": string, "description": string (1 sentence), "category": string (e.g. hvac, plumbing, landscaping, pest_control, pool, roofing, general, cleaning), "priority": "low"|"medium"|"high", "properties": [2-3 example property names], "reason": string (1 sentence) }.\n\nRespond with ONLY a valid JSON array. No markdown, no code blocks, no explanation.`,
        },
      ],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    let responseText = textBlock ? textBlock.text.trim() : '[]';

    // Strip markdown code blocks if present
    responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    let suggestions: Array<{ title: string; description: string; category: string; priority: string; properties: string[]; reason: string }> = [];
    try {
      suggestions = JSON.parse(responseText);
    } catch {
      // Try to extract JSON array from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try { suggestions = JSON.parse(jsonMatch[0]); } catch (err) { logger.warn({ err }, '[business] Failed to parse seasonal suggestions JSON from AI response'); }
      }
    }

    res.json({ data: suggestions.slice(0, limit), error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/dashboard/seasonal-suggestions]');
    res.status(500).json({ data: null, error: 'Failed to generate seasonal suggestions', meta: {} });
  }
});

export default router;
