import { Router, Request, Response } from 'express';
import { eq, and, or, desc, ne, sql, gte, lte, count, isNull, ilike } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import twilio from 'twilio';
import logger from '../logger';
import { db } from '../db';
import { getPricingConfig } from '../services/pricing';
import { workspaces } from '../db/schema/workspaces';
import { jobs } from '../db/schema/jobs';
import { providerResponses } from '../db/schema/provider-responses';
import { bookings } from '../db/schema/bookings';
import { bookingMessages } from '../db/schema/booking-messages';
import { workspaceMembers } from '../db/schema/workspace-members';
import { properties } from '../db/schema/properties';
import { homeowners } from '../db/schema/homeowners';
import { providers } from '../db/schema/providers';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { preferredVendors } from '../db/schema/preferred-vendors';
import { reservations } from '../db/schema/reservations';
import { propertyCalendarSources } from '../db/schema/property-calendar-sources';
import { dispatchSchedules, dispatchScheduleRuns } from '../db/schema/schedules';
import { notifications } from '../db/schema/notifications';
import { propertyScans, propertyRooms, propertyInventoryItems } from '../db/schema/property-scans';
import { inArray } from 'drizzle-orm';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace-auth';
import { generateEstimatePDF } from '../services/estimate-pdf';
import { applyStandardCheckInTime, applyStandardCheckOutTime } from '../services/reservation-times';

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
  const { name, slug, logo_url, company_address, company_phone, company_email, contact_title, plan } = req.body as {
    name?: string; slug?: string; logo_url?: string | null;
    company_address?: string | null; company_phone?: string | null; company_email?: string | null;
    contact_title?: string | null;
    plan?: string;
  };
  const updates: Record<string, unknown> = {};

  if (name !== undefined) updates.name = name.trim();
  if (slug !== undefined) updates.slug = slugify(slug);
  if (logo_url !== undefined) updates.logoUrl = logo_url;
  if (company_address !== undefined) updates.companyAddress = company_address;
  if (company_phone !== undefined) updates.companyPhone = company_phone;
  if (company_email !== undefined) updates.companyEmail = company_email;
  if (contact_title !== undefined) updates.contactTitle = (contact_title?.trim() || 'Property Manager');
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

// ── Billing / Subscriptions ──────────────────────────────────────────────────

// POST /:workspaceId/billing/checkout — create a Stripe subscription checkout session
router.post('/:workspaceId/billing/checkout', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const { return_url } = req.body as { return_url?: string };
  try {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, req.workspaceId)).limit(1);
    if (!ws) { res.status(404).json({ data: null, error: 'Workspace not found', meta: {} }); return; }
    if (ws.stripeSubscriptionId && ws.subscriptionStatus === 'active') {
      res.status(400).json({ data: null, error: 'Workspace already has an active subscription. Use the billing portal to manage it.', meta: {} });
      return;
    }

    const [owner] = await db.select({ email: homeowners.email }).from(homeowners).where(eq(homeowners.id, ws.ownerId)).limit(1);
    const { getOrCreateWorkspaceCustomer, createSubscriptionCheckout } = await import('../services/stripe');
    const customerId = await getOrCreateWorkspaceCustomer(req.workspaceId, owner?.email ?? '', ws.name);
    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const checkoutUrl = await createSubscriptionCheckout(
      req.workspaceId, ws.plan, ws.customPricing as Record<string, unknown> | null,
      customerId, return_url || `${APP_URL}/business?tab=billing`,
    );
    res.json({ data: { checkoutUrl }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/billing/checkout]');
    res.status(500).json({ data: null, error: `Checkout failed: ${(err as Error).message}`, meta: {} });
  }
});

// POST /:workspaceId/billing/portal — open Stripe Customer Portal for self-service
router.post('/:workspaceId/billing/portal', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const { return_url } = req.body as { return_url?: string };
  try {
    const [ws] = await db.select({ stripeCustomerId: workspaces.stripeCustomerId }).from(workspaces).where(eq(workspaces.id, req.workspaceId)).limit(1);
    if (!ws?.stripeCustomerId) {
      res.status(400).json({ data: null, error: 'No billing account yet. Subscribe first.', meta: {} });
      return;
    }
    const { createBillingPortalSession } = await import('../services/stripe');
    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const portalUrl = await createBillingPortalSession(ws.stripeCustomerId, return_url || `${APP_URL}/business?tab=billing`);
    res.json({ data: { portalUrl }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/billing/portal]');
    res.status(500).json({ data: null, error: 'Failed to open billing portal', meta: {} });
  }
});

// GET /:workspaceId/billing/invoices — list recent invoices
router.get('/:workspaceId/billing/invoices', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const [ws] = await db.select({ stripeCustomerId: workspaces.stripeCustomerId }).from(workspaces).where(eq(workspaces.id, req.workspaceId)).limit(1);
    if (!ws?.stripeCustomerId) {
      res.json({ data: { invoices: [] }, error: null, meta: {} });
      return;
    }
    const { listInvoices } = await import('../services/stripe');
    const invoices = await listInvoices(ws.stripeCustomerId);
    res.json({ data: { invoices }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/billing/invoices]');
    res.status(500).json({ data: null, error: 'Failed to load invoices', meta: {} });
  }
});

// POST /:workspaceId/billing/sync-properties — update subscription quantity to current property count
router.post('/:workspaceId/billing/sync-properties', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    const [ws] = await db.select({
      stripeSubscriptionId: workspaces.stripeSubscriptionId,
      subscriptionStatus: workspaces.subscriptionStatus,
    }).from(workspaces).where(eq(workspaces.id, req.workspaceId)).limit(1);
    if (!ws?.stripeSubscriptionId || ws.subscriptionStatus !== 'active') {
      res.status(400).json({ data: null, error: 'No active subscription', meta: {} });
      return;
    }
    const [{ value: propCount }] = await db.select({ value: count() }).from(properties).where(eq(properties.workspaceId, req.workspaceId));
    const { updateSubscriptionPropertyCount } = await import('../services/stripe');
    await updateSubscriptionPropertyCount(ws.stripeSubscriptionId, propCount);
    res.json({ data: { synced: true, propertyCount: propCount }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/billing/sync-properties]');
    res.status(500).json({ data: null, error: 'Failed to sync property count', meta: {} });
  }
});

// GET /:workspaceId/billing/status — current subscription status
router.get('/:workspaceId/billing/status', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const [ws] = await db.select({
      stripeSubscriptionId: workspaces.stripeSubscriptionId,
      subscriptionStatus: workspaces.subscriptionStatus,
      currentPeriodEnd: workspaces.currentPeriodEnd,
      stripeCustomerId: workspaces.stripeCustomerId,
    }).from(workspaces).where(eq(workspaces.id, req.workspaceId)).limit(1);
    res.json({
      data: {
        hasSubscription: !!ws?.stripeSubscriptionId,
        status: ws?.subscriptionStatus ?? null,
        currentPeriodEnd: ws?.currentPeriodEnd?.toISOString() ?? null,
        hasPaymentMethod: !!ws?.stripeCustomerId,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/billing/status]');
    res.status(500).json({ data: null, error: 'Failed to load billing status', meta: {} });
  }
});

// GET /:workspaceId/pricing — resolved pricing for this workspace (global merged with custom)
router.get('/:workspaceId/pricing', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const [ws] = await db.select({ plan: workspaces.plan, customPricing: workspaces.customPricing })
      .from(workspaces).where(eq(workspaces.id, req.workspaceId)).limit(1);
    if (!ws) { res.status(404).json({ data: null, error: 'Workspace not found', meta: {} }); return; }
    const { getWorkspacePlanConfig } = await import('../services/pricing');
    const resolved = await getWorkspacePlanConfig(ws.plan, ws.customPricing as Record<string, unknown> | null);
    res.json({ data: { plan: ws.plan, ...resolved }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/pricing]');
    res.status(500).json({ data: null, error: 'Failed to load pricing', meta: {} });
  }
});

// ── PMS Connections ──────────────────────────────────────────────────────────

// GET /:workspaceId/pms/connections
router.get('/:workspaceId/pms/connections', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const { workspacePmsConnections } = await import('../db/schema/pms-connections');
    const connections = await db.select().from(workspacePmsConnections)
      .where(eq(workspacePmsConnections.workspaceId, req.workspaceId))
      .orderBy(workspacePmsConnections.createdAt);
    const safe = connections.map(c => ({
      id: c.id, pmsType: c.pmsType, status: c.status, lastError: c.lastError,
      lastPropertySyncAt: c.lastPropertySyncAt, lastReservationSyncAt: c.lastReservationSyncAt,
      propertiesSynced: c.propertiesSynced, reservationsSynced: c.reservationsSynced,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
    }));
    res.json({ data: safe, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/pms/connections]');
    res.status(500).json({ data: null, error: 'Failed to load PMS connections', meta: {} });
  }
});

// POST /:workspaceId/pms/connect
router.post('/:workspaceId/pms/connect', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { pms_type, credentials, update_existing } = req.body as {
    pms_type: 'track' | 'guesty';
    credentials: Record<string, string>;
    update_existing?: boolean;
  };
  if (!pms_type || !credentials) {
    res.status(400).json({ data: null, error: 'pms_type and credentials are required', meta: {} });
    return;
  }
  try {
    const { workspacePmsConnections } = await import('../db/schema/pms-connections');
    const [existing] = await db.select().from(workspacePmsConnections)
      .where(and(eq(workspacePmsConnections.workspaceId, req.workspaceId), eq(workspacePmsConnections.pmsType, pms_type)))
      .limit(1);
    let connectionId: string;
    if (existing) {
      await db.update(workspacePmsConnections).set({
        credentials, status: 'connected', lastError: null, updatedAt: new Date(),
      }).where(eq(workspacePmsConnections.id, existing.id));
      connectionId = existing.id;
    } else {
      const [created] = await db.insert(workspacePmsConnections).values({
        workspaceId: req.workspaceId, pmsType: pms_type, credentials, status: 'connected',
      }).returning({ id: workspacePmsConnections.id });
      connectionId = created.id;
    }
    // Test the connection
    if (pms_type === 'guesty') {
      const { testGuestyConnection } = await import('../services/guesty');
      const test = await testGuestyConnection(connectionId, credentials as unknown as import('../db/schema/pms-connections').GuestyCredentials);
      res.json({ data: { connectionId, tested: true, listingCount: test.listingCount }, error: null, meta: {} });
    } else {
      const domain = credentials.domain || '';
      const apiKey = credentials.apiKey || '';
      const apiSecret = credentials.apiSecret || '';
      const base = domain.includes('/api') ? `https://${domain.replace(/\/$/, '')}` : `https://${domain.replace(/\/$/, '')}/api`;
      const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
      const testRes = await fetch(`${base}/pms/units?limit=1`, { headers: { Authorization: authHeader, Accept: 'application/json' } });
      if (!testRes.ok) throw new Error(`Track API returned ${testRes.status}`);
      res.json({ data: { connectionId, tested: true }, error: null, meta: {} });
    }
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/pms/connect]');
    res.status(500).json({ data: null, error: `Connection failed: ${(err as Error).message}`, meta: {} });
  }
});

// POST /:workspaceId/pms/:connectionId/sync-properties
router.post('/:workspaceId/pms/:connectionId/sync-properties', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { connectionId } = req.params;
  const { update_existing } = req.body as { update_existing?: boolean };
  try {
    const { workspacePmsConnections } = await import('../db/schema/pms-connections');
    const [conn] = await db.select().from(workspacePmsConnections)
      .where(and(eq(workspacePmsConnections.id, connectionId), eq(workspacePmsConnections.workspaceId, req.workspaceId)))
      .limit(1);
    if (!conn) { res.status(404).json({ data: null, error: 'Connection not found', meta: {} }); return; }

    if (conn.pmsType === 'guesty') {
      const { importGuestyProperties } = await import('../services/guesty');
      const result = await importGuestyProperties(connectionId, conn.credentials as unknown as import('../db/schema/pms-connections').GuestyCredentials, req.workspaceId, update_existing);
      res.json({ data: result, error: null, meta: {} });
    } else if (conn.pmsType === 'track') {
      const creds = conn.credentials as Record<string, string>;
      const domain = creds.domain || '';
      const base = domain.includes('/api') ? `https://${domain.replace(/\/$/, '')}` : `https://${domain.replace(/\/$/, '')}/api`;
      const authHeader = 'Basic ' + Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
      const unitsRes = await fetch(`${base}/pms/units`, { headers: { Authorization: authHeader, Accept: 'application/json' } });
      if (!unitsRes.ok) throw new Error(`Track API returned ${unitsRes.status}`);
      const unitsData = await unitsRes.json() as Record<string, unknown>;
      const units = (Array.isArray(unitsData) ? unitsData : (unitsData._embedded as Record<string, unknown> | undefined)?.units ?? unitsData.contents ?? unitsData.results ?? unitsData.data ?? []) as Array<Record<string, unknown>>;
      let imported = 0; let updated = 0; let skipped = 0;
      for (const unit of units) {
        const externalId = String(unit.id ?? unit._id ?? '');
        if (!externalId) continue;
        // Skip inactive/archived units (Track uses isActive boolean + status string)
        if (unit.isActive === false || unit.active === false || unit.status === 'inactive' || unit.status === 'archived') { skipped++; continue; }
        const name = String(unit.name ?? unit.shortName ?? unit.title ?? `Unit ${externalId}`);
        // Track puts address fields both at top level (streetAddress, locality,
        // region, postal) and nested under unit.address — check both.
        const addr = unit.address as Record<string, string> | undefined;
        const street = (unit.streetAddress ?? unit.street ?? addr?.street ?? addr?.full ?? null) as string | null;
        const city = (unit.locality ?? unit.city ?? addr?.city ?? null) as string | null;
        const state = (unit.region ?? unit.state ?? addr?.state ?? null) as string | null;
        const zip = (unit.postal ?? unit.zip ?? unit.zipCode ?? addr?.zip ?? addr?.zipCode ?? addr?.postalCode ?? null) as string | null;
        const [ex] = await db.select({ id: properties.id }).from(properties)
          .where(and(eq(properties.workspaceId, req.workspaceId), eq(properties.pmsExternalId, externalId))).limit(1);
        if (ex) {
          if (update_existing) { await db.update(properties).set({ name, address: street, city, state, zipCode: zip, updatedAt: new Date() }).where(eq(properties.id, ex.id)); updated++; }
          else skipped++;
        } else {
          await db.insert(properties).values({ workspaceId: req.workspaceId, name, address: street, city, state, zipCode: zip, propertyType: 'residential', unitCount: 1, pmsSource: 'track', pmsExternalId: externalId });
          imported++;
        }
      }
      await db.update(workspacePmsConnections).set({ propertiesSynced: imported + updated, lastPropertySyncAt: new Date(), status: 'connected', lastError: null, updatedAt: new Date() }).where(eq(workspacePmsConnections.id, connectionId));
      res.json({ data: { imported, updated, skipped, total: units.length }, error: null, meta: {} });
    } else {
      res.status(400).json({ data: null, error: `Unsupported PMS type: ${conn.pmsType}`, meta: {} });
    }
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/pms/:connId/sync-properties]');
    try { const { workspacePmsConnections } = await import('../db/schema/pms-connections'); await db.update(workspacePmsConnections).set({ status: 'error', lastError: (err as Error).message, updatedAt: new Date() }).where(eq(workspacePmsConnections.id, connectionId)); } catch { /* ignore */ }
    res.status(500).json({ data: null, error: `Sync failed: ${(err as Error).message}`, meta: {} });
  }
});

// POST /:workspaceId/pms/:connectionId/sync-reservations
router.post('/:workspaceId/pms/:connectionId/sync-reservations', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { connectionId } = req.params;
  try {
    const { workspacePmsConnections } = await import('../db/schema/pms-connections');
    const [conn] = await db.select().from(workspacePmsConnections)
      .where(and(eq(workspacePmsConnections.id, connectionId), eq(workspacePmsConnections.workspaceId, req.workspaceId)))
      .limit(1);
    if (!conn) { res.status(404).json({ data: null, error: 'Connection not found', meta: {} }); return; }

    if (conn.pmsType === 'guesty') {
      const { syncGuestyReservations } = await import('../services/guesty');
      const result = await syncGuestyReservations(connectionId, conn.credentials as unknown as import('../db/schema/pms-connections').GuestyCredentials, req.workspaceId);
      res.json({ data: result, error: null, meta: {} });
    } else if (conn.pmsType === 'track') {
      const creds = conn.credentials as Record<string, string>;
      const { syncTrackReservationsForWorkspace } = await import('../services/reservation-sync');
      const result = await syncTrackReservationsForWorkspace(req.workspaceId, creds.domain, creds.apiKey, creds.apiSecret);
      await db.update(workspacePmsConnections).set({ reservationsSynced: result.imported + result.updated, lastReservationSyncAt: new Date(), status: 'connected', lastError: null, updatedAt: new Date() }).where(eq(workspacePmsConnections.id, connectionId));
      res.json({ data: result, error: null, meta: {} });
    } else {
      res.status(400).json({ data: null, error: `Unsupported PMS type: ${conn.pmsType}`, meta: {} });
    }
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/pms/:connId/sync-reservations]');
    try { const { workspacePmsConnections } = await import('../db/schema/pms-connections'); await db.update(workspacePmsConnections).set({ status: 'error', lastError: (err as Error).message, updatedAt: new Date() }).where(eq(workspacePmsConnections.id, connectionId)); } catch { /* ignore */ }
    res.status(500).json({ data: null, error: `Reservation sync failed: ${(err as Error).message}`, meta: {} });
  }
});

// DELETE /:workspaceId/pms/:connectionId — disconnect
router.delete('/:workspaceId/pms/:connectionId', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const { connectionId } = req.params;
  try {
    const { workspacePmsConnections } = await import('../db/schema/pms-connections');
    const [conn] = await db.select({ id: workspacePmsConnections.id }).from(workspacePmsConnections)
      .where(and(eq(workspacePmsConnections.id, connectionId), eq(workspacePmsConnections.workspaceId, req.workspaceId)))
      .limit(1);
    if (!conn) { res.status(404).json({ data: null, error: 'Connection not found', meta: {} }); return; }
    await db.delete(workspacePmsConnections).where(eq(workspacePmsConnections.id, connectionId));
    res.json({ data: { disconnected: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /business/:id/pms/:connId]');
    res.status(500).json({ data: null, error: 'Failed to disconnect PMS', meta: {} });
  }
});

// ── Properties ──────────────────────────────────────────────────────────────

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

// NOTE: export/import routes must come BEFORE /:propertyId to avoid matching "export" as a propertyId
// They are defined below the helper functions but registered here via forward references
// (Actual route handlers moved inline)

// GET /:workspaceId/properties/export — CSV download
router.get('/:workspaceId/properties/export', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.workspaceId, req.workspaceId))
      .orderBy(desc(properties.createdAt));

    const allColumns = [...CSV_COLUMNS, ...DETAIL_COLUMNS];
    const headerRow = allColumns.map(c => escapeCsvField(c)).join(',');

    const dataRows = rows.map(row => {
      const vals: string[] = [];
      for (const col of CSV_COLUMNS) {
        vals.push(escapeCsvField(row[col as keyof typeof row] as string | number | boolean | null));
      }
      const details = row.details as Record<string, unknown> | null;
      for (const col of DETAIL_COLUMNS) {
        vals.push(escapeCsvField(getDetailValue(details, col)));
      }
      return vals.join(',');
    });

    const csv = [headerRow, ...dataRows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="properties.csv"');
    res.send(csv);
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/export]');
    res.status(500).json({ data: null, error: 'Failed to export properties', meta: {} });
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

// DELETE /:workspaceId/properties/:propertyId
router.delete('/:workspaceId/properties/:propertyId', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    await db
      .delete(properties)
      .where(and(eq(properties.id, req.params.propertyId), eq(properties.workspaceId, req.workspaceId)));

    res.json({ data: { deleted: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /business/:id/properties/:pid]');
    res.status(500).json({ data: null, error: 'Failed to delete property', meta: {} });
  }
});

// ── CSV Export / Import ────────────────────────────────────────────────────

const CSV_COLUMNS = [
  'id', 'name', 'address', 'city', 'state', 'zipCode', 'propertyType',
  'bedrooms', 'bathrooms', 'sqft', 'unitCount', 'active', 'notes',
  'pmsSource', 'pmsExternalId',
] as const;

const DETAIL_COLUMNS = [
  'hvac_acType', 'hvac_acBrand', 'hvac_acModel', 'hvac_heatingType',
  'hvac_thermostatBrand', 'hvac_filterSize',
  'waterHeater_type', 'waterHeater_brand', 'waterHeater_fuel',
  'waterHeater_capacity', 'waterHeater_location',
  'appliances_refrigerator_brand', 'appliances_washer_brand',
  'appliances_dryer_brand', 'appliances_dishwasher_brand',
  'appliances_oven_brand',
  'plumbing_kitchenFaucetBrand', 'plumbing_toiletBrand',
  'plumbing_mainShutoffLocation',
  'electrical_breakerBoxLocation', 'electrical_panelAmperage',
  'access_lockboxCode', 'access_gateCode', 'access_alarmBrand',
  'access_alarmCode', 'access_wifiNetwork', 'access_wifiPassword',
] as const;

function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getDetailValue(details: Record<string, unknown> | null | undefined, column: string): string {
  if (!details) return '';
  const parts = column.split('_');
  // e.g. 'hvac_acType' -> details.hvac.acType
  // e.g. 'appliances_refrigerator_brand' -> details.appliances.refrigerator.brand
  // e.g. 'waterHeater_type' -> details.waterHeater.type
  const section = parts[0];
  const sectionData = details[section] as Record<string, unknown> | undefined;
  if (!sectionData) return '';

  if (section === 'appliances') {
    // appliances_refrigerator_brand -> appliances.refrigerator.brand
    const appliance = parts[1];
    const field = parts[2];
    const appData = sectionData[appliance] as Record<string, unknown> | undefined;
    return appData?.[field] != null ? String(appData[field]) : '';
  }

  // For all others: section_fieldName -> details[section][fieldName]
  const fieldName = parts.slice(1).join('_');
  // Convert back: acType stays acType (camelCase)
  return sectionData[fieldName] != null ? String(sectionData[fieldName]) : '';
}

function setDetailValue(details: Record<string, unknown>, column: string, value: string): void {
  const parts = column.split('_');
  const section = parts[0];

  if (!details[section]) details[section] = {};
  const sectionData = details[section] as Record<string, unknown>;

  if (section === 'appliances') {
    const appliance = parts[1];
    const field = parts[2];
    if (!sectionData[appliance]) sectionData[appliance] = {};
    (sectionData[appliance] as Record<string, unknown>)[field] = value;
  } else {
    const fieldName = parts.slice(1).join('_');
    sectionData[fieldName] = value;
  }
}

// (export route moved above /:propertyId to avoid route conflict)

// POST /:workspaceId/properties/import
router.post('/:workspaceId/properties/import', requireWorkspace, requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    let csvText: string;
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('text/csv')) {
      csvText = typeof req.body === 'string' ? req.body : String(req.body);
    } else {
      const body = req.body as { csv?: string };
      if (!body.csv || typeof body.csv !== 'string') {
        res.status(400).json({ data: null, error: 'Missing csv field in request body', meta: {} });
        return;
      }
      csvText = body.csv;
    }

    // Parse CSV
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      res.status(400).json({ data: null, error: 'CSV must have a header row and at least one data row', meta: {} });
      return;
    }

    const headers = parseCsvLine(lines[0]);
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCsvLine(lines[i]);
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j] ?? '';
        }

        const id = row['id']?.trim() || '';
        const name = row['name']?.trim() || '';

        if (!id && !name) {
          errors.push(`Row ${i + 1}: skipped (no id or name)`);
          continue;
        }

        // Build base fields (skip PMS fields)
        const baseFields: Record<string, unknown> = {};
        if (row['name'] !== undefined && row['name'].trim()) baseFields.name = row['name'].trim();
        if (row['address'] !== undefined) baseFields.address = row['address'] || null;
        if (row['city'] !== undefined) baseFields.city = row['city'] || null;
        if (row['state'] !== undefined) baseFields.state = row['state'] || null;
        if (row['zipCode'] !== undefined) baseFields.zipCode = row['zipCode'] || null;
        if (row['propertyType'] !== undefined && row['propertyType'].trim()) baseFields.propertyType = row['propertyType'].trim();
        if (row['bedrooms'] !== undefined && row['bedrooms'].trim()) baseFields.bedrooms = parseInt(row['bedrooms'], 10) || null;
        if (row['bathrooms'] !== undefined && row['bathrooms'].trim()) baseFields.bathrooms = row['bathrooms'].trim();
        if (row['sqft'] !== undefined && row['sqft'].trim()) baseFields.sqft = parseInt(row['sqft'], 10) || null;
        if (row['unitCount'] !== undefined && row['unitCount'].trim()) baseFields.unitCount = parseInt(row['unitCount'], 10) || 1;
        if (row['active'] !== undefined && row['active'].trim()) baseFields.active = row['active'].trim().toLowerCase() === 'true';
        if (row['notes'] !== undefined) baseFields.notes = row['notes'] || null;

        // Build details from detail columns (merge)
        const detailUpdates: Record<string, string> = {};
        for (const col of DETAIL_COLUMNS) {
          if (row[col] !== undefined && row[col].trim()) {
            detailUpdates[col] = row[col].trim();
          }
        }

        if (id) {
          // UPDATE existing property
          const [existing] = await db
            .select()
            .from(properties)
            .where(and(eq(properties.id, id), eq(properties.workspaceId, req.workspaceId)))
            .limit(1);

          if (!existing) {
            errors.push(`Row ${i + 1}: property id "${id}" not found in workspace`);
            continue;
          }

          // For PMS-synced properties, only update non-empty CSV fields
          const isPms = !!existing.pmsSource;
          const updateFields: Record<string, unknown> = {};

          for (const [key, val] of Object.entries(baseFields)) {
            if (isPms && (val === null || val === '')) continue;
            updateFields[key] = val;
          }

          // Merge details
          if (Object.keys(detailUpdates).length > 0) {
            const existingDetails = (existing.details as Record<string, unknown>) ?? {};
            const merged = JSON.parse(JSON.stringify(existingDetails));
            for (const [col, val] of Object.entries(detailUpdates)) {
              setDetailValue(merged, col, val);
            }
            updateFields.details = merged;
          }

          if (Object.keys(updateFields).length > 0) {
            updateFields.updatedAt = new Date();
            await db
              .update(properties)
              .set(updateFields)
              .where(and(eq(properties.id, id), eq(properties.workspaceId, req.workspaceId)));
          }
          updated++;
        } else {
          // CREATE new property
          if (!baseFields.name) {
            errors.push(`Row ${i + 1}: name is required for new properties`);
            continue;
          }

          const newDetails: Record<string, unknown> = {};
          for (const [col, val] of Object.entries(detailUpdates)) {
            setDetailValue(newDetails, col, val);
          }

          await db.insert(properties).values({
            workspaceId: req.workspaceId,
            name: baseFields.name as string,
            address: (baseFields.address as string) ?? null,
            city: (baseFields.city as string) ?? null,
            state: (baseFields.state as string) ?? null,
            zipCode: (baseFields.zipCode as string) ?? null,
            propertyType: (baseFields.propertyType as string) ?? 'residential',
            unitCount: (baseFields.unitCount as number) ?? 1,
            bedrooms: (baseFields.bedrooms as number) ?? null,
            bathrooms: (baseFields.bathrooms as string) ?? null,
            sqft: (baseFields.sqft as number) ?? null,
            notes: (baseFields.notes as string) ?? null,
            active: (baseFields.active as boolean) ?? true,
            details: Object.keys(newDetails).length > 0 ? newDetails : null,
          });
          imported++;
        }
      } catch (rowErr) {
        errors.push(`Row ${i + 1}: ${rowErr instanceof Error ? rowErr.message : 'unknown error'}`);
      }
    }

    res.json({ data: { imported, updated, errors }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/properties/import]');
    res.status(500).json({ data: null, error: 'Failed to import properties', meta: {} });
  }
});

/** Parse a single CSV line respecting quoted fields */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

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
        providerRating: providers.rating,
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
        rating: providers.rating,
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

    const pricing = await getPricingConfig();
    const planInfo = pricing.business[ws.plan] ?? pricing.business.starter;
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
        providerRating: providers.rating,
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

// POST /:workspaceId/dispatches/:jobId/archive
router.post('/:workspaceId/dispatches/:jobId/archive', requireWorkspace, async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const [job] = await db
      .select({ id: jobs.id, status: jobs.status, workspaceId: jobs.workspaceId })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, req.workspaceId)))
      .limit(1);

    if (!job) {
      res.status(404).json({ data: null, error: 'Dispatch not found', meta: {} });
      return;
    }

    if (job.status !== 'completed' && job.status !== 'expired') {
      res.status(400).json({ data: null, error: 'Only completed or expired dispatches can be archived', meta: {} });
      return;
    }

    await db.update(jobs).set({ status: 'archived' } as Record<string, unknown>).where(eq(jobs.id, jobId));

    res.json({ data: { archived: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/dispatches/:jobId/archive]');
    res.status(500).json({ data: null, error: 'Failed to archive dispatch', meta: {} });
  }
});

// POST /:workspaceId/dispatches/:jobId/resend-magic-link
// Generates a fresh portal token for the given provider and texts/emails them
// a working login link. Use when a previously sent magic link expired or
// stopped working (e.g. JWT_SECRET rotation, link > 30 days old).
router.post('/:workspaceId/dispatches/:jobId/resend-magic-link', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const { providerId, channel } = req.body as { providerId?: string; channel?: 'sms' | 'email' };

  if (!providerId) {
    res.status(400).json({ data: null, error: 'providerId is required', meta: {} });
    return;
  }

  try {
    // Verify the job belongs to this workspace
    const [job] = await db.select({ id: jobs.id, workspaceId: jobs.workspaceId, diagnosis: jobs.diagnosis })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, req.workspaceId)))
      .limit(1);
    if (!job) {
      res.status(404).json({ data: null, error: 'Dispatch not found', meta: {} });
      return;
    }

    // Look up the provider
    const [provider] = await db
      .select({ id: providers.id, name: providers.name, phone: providers.phone, email: providers.email })
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);
    if (!provider) {
      res.status(404).json({ data: null, error: 'Provider not found', meta: {} });
      return;
    }

    // Generate a fresh token + link
    const { signProviderToken } = await import('../middleware/provider-auth');
    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const token = signProviderToken(provider.id);
    const link = `${APP_URL}/portal/login?token=${token}`;

    // Decide channel: explicit > sms if phone available > email
    const useSms = channel === 'sms' || (!channel && !!provider.phone);
    const useEmail = channel === 'email' || (!useSms && !!provider.email);

    const diagnosis = job.diagnosis as { category?: string } | null;
    const cat = (diagnosis?.category || 'job').replace(/_/g, ' ');

    const { sendSms, sendEmail } = await import('../services/notifications');
    const sentVia: string[] = [];

    if (useSms && provider.phone) {
      try {
        await sendSms(
          provider.phone,
          `Hey ${provider.name}! Here's a fresh link to view the ${cat} job in your Homie Pro portal: ${link}`,
        );
        sentVia.push('sms');
      } catch (err) {
        logger.warn({ err, providerId }, '[business] resend-magic-link: SMS failed');
      }
    }

    if (useEmail && provider.email) {
      try {
        await sendEmail(
          provider.email,
          `Your Homie Pro portal link`,
          `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h1 style="color:#E8632B;font-size:24px;font-family:Georgia,serif">homie</h1>
            <p style="color:#2D2926;font-size:16px">Hey ${provider.name}!</p>
            <p style="color:#6B6560;font-size:15px;line-height:1.6">Here's a fresh link to view the ${cat} job in your Homie Pro portal:</p>
            <p><a href="${link}" style="display:inline-block;background:#E8632B;color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px;margin-top:16px">Open Portal</a></p>
            <p style="color:#9B9490;font-size:12px;margin-top:24px">This link is valid for 30 days.</p>
          </div>`,
        );
        sentVia.push('email');
      } catch (err) {
        logger.warn({ err, providerId }, '[business] resend-magic-link: email failed');
      }
    }

    if (sentVia.length === 0) {
      res.status(400).json({
        data: null,
        error: 'Could not send: provider has no phone/email on file or sending failed.',
        meta: { providerName: provider.name },
      });
      return;
    }

    res.json({
      data: { sent: true, sentVia, providerName: provider.name, link },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/dispatches/:jobId/resend-magic-link]');
    res.status(500).json({ data: null, error: 'Failed to resend magic link', meta: {} });
  }
});

// POST /:workspaceId/dispatches/:jobId/reopen
// Re-opens a completed or archived dispatch for booking. Use this when a job
// got stuck in "completed" without an actual booking row, or when the user
// wants to recover an accidentally archived dispatch. Also re-runs the quote
// parser on every provider response so prices like "$70/hr 3 hr min, possibly
// 4 hours" come out as "$210-$280" instead of "$70".
router.post('/:workspaceId/dispatches/:jobId/reopen', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const [job] = await db
      .select({ id: jobs.id, status: jobs.status, workspaceId: jobs.workspaceId })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, req.workspaceId)))
      .limit(1);

    if (!job) {
      res.status(404).json({ data: null, error: 'Dispatch not found', meta: {} });
      return;
    }

    // Refunded dispatches can't be re-opened — money came back, the booking
    // contract is over.
    if (job.status === 'refunded') {
      res.status(400).json({ data: null, error: 'Refunded dispatches cannot be re-opened', meta: {} });
      return;
    }

    // If status is 'completed', verify there's no ACTIVE booking row before
    // reverting. We never want to silently break a confirmed booking, but
    // cancelled bookings shouldn't block recovery.
    if (job.status === 'completed') {
      const [booking] = await db
        .select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(and(eq(bookings.jobId, jobId), ne(bookings.status, 'cancelled')))
        .limit(1);
      if (booking) {
        res.status(409).json({
          data: null,
          error: 'This dispatch has an active booking and cannot be re-opened. Cancel the booking first.',
          meta: { bookingId: booking.id, bookingStatus: booking.status },
        });
        return;
      }
    }

    // Reparse provider responses so prices benefit from the latest parser
    const responseRows = await db.select().from(providerResponses).where(eq(providerResponses.jobId, jobId));
    const { formatQuotedPrice } = await import('../services/quote-parser');
    const reparsed: Array<{ id: string; before: string | null; after: string | null }> = [];
    for (const r of responseRows) {
      // Prefer the longer of (message, quotedPrice) — message often has the
      // full sentence ("$70/hr 3 hour minimum...") while quotedPrice may have
      // been truncated by an earlier parser pass.
      const sourceText = (r.message && r.message.length > (r.quotedPrice?.length ?? 0))
        ? r.message
        : r.quotedPrice;
      const newPrice = formatQuotedPrice(sourceText);
      if (newPrice && newPrice !== r.quotedPrice) {
        await db.update(providerResponses)
          .set({ quotedPrice: newPrice })
          .where(eq(providerResponses.id, r.id));
        reparsed.push({ id: r.id, before: r.quotedPrice, after: newPrice });
      }
    }

    // Revert status. We use 'expired' as the bookable-but-not-actively-collecting
    // state — quotes stay visible and the Book button reappears.
    if (job.status === 'completed' || job.status === 'archived') {
      await db.update(jobs)
        .set({ status: 'expired' } as Record<string, unknown>)
        .where(eq(jobs.id, jobId));
      logger.info({ jobId, previousStatus: job.status, reparsedCount: reparsed.length }, '[business] Dispatch re-opened for booking');
    }

    res.json({
      data: { reopened: true, previousStatus: job.status, newStatus: 'expired', reparsedQuotes: reparsed },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/dispatches/:jobId/reopen]');
    res.status(500).json({ data: null, error: 'Failed to re-open dispatch', meta: {} });
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

    // Enrich with property names + addresses
    const propertyIds = [...new Set(rows.filter(r => r.propertyId).map(r => r.propertyId!))];
    let propertyMap: Record<string, { name: string; address: string | null }> = {};
    if (propertyIds.length > 0) {
      const propRows = await db
        .select({ id: properties.id, name: properties.name, address: properties.address, city: properties.city, state: properties.state, zipCode: properties.zipCode })
        .from(properties)
        .where(sql`${properties.id} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`);
      propertyMap = Object.fromEntries(propRows.map(p => {
        const fullAddress = [p.address, p.city, p.state, p.zipCode].filter(Boolean).join(', ');
        return [p.id, { name: p.name, address: fullAddress || null }];
      }));
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
      propertyName: r.propertyId ? propertyMap[r.propertyId]?.name || null : null,
      propertyAddress: r.propertyId ? propertyMap[r.propertyId]?.address || null : null,
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
        providerRating: providers.rating,
        providerReviewCount: providers.reviewCount,
        diagnosis: jobs.diagnosis,
        zipCode: jobs.zipCode,
        preferredTiming: jobs.preferredTiming,
        propertyId: jobs.propertyId,
        jobCreatedAt: jobs.createdAt,
        quotedPrice: providerResponses.quotedPrice,
        availability: providerResponses.availability,
        channel: providerResponses.channel,
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

    // Unread message counts per booking (provider messages with read_at IS NULL)
    const bookingIds = rows.map(r => r.id);
    let unreadMap: Record<string, number> = {};
    if (bookingIds.length > 0) {
      const unreadRows = await db
        .select({ bookingId: bookingMessages.bookingId, c: sql<number>`count(*)::int` })
        .from(bookingMessages)
        .where(and(
          sql`${bookingMessages.bookingId} IN (${sql.join(bookingIds.map(id => sql`${id}`), sql`, `)})`,
          eq(bookingMessages.senderType, 'provider'),
          isNull(bookingMessages.readAt),
        ))
        .groupBy(bookingMessages.bookingId);
      unreadMap = Object.fromEntries(unreadRows.map(r => [r.bookingId, r.c]));
    }

    const enriched = rows.map(r => ({
      ...r,
      propertyName: r.propertyId ? propertyMap[r.propertyId] || null : null,
      unreadMessageCount: unreadMap[r.id] || 0,
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

  // Persist Track credentials for auto-sync
  await db.update(workspaces).set({
    trackDomain: domain,
    trackApiKey: body.api_key,
    trackApiSecret: body.api_secret,
    trackSyncEnabled: 1,
    updatedAt: new Date(),
  }).where(eq(workspaces.id, req.workspaceId));

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
      // First: fix any mismatched pmsExternalId by matching on property name
      const allWorkspaceProps = await db
        .select({ id: properties.id, name: properties.name, pmsExternalId: properties.pmsExternalId })
        .from(properties)
        .where(and(eq(properties.workspaceId, req.workspaceId), eq(properties.pmsSource, 'track')));

      for (const u of activeUnits) {
        const mapped = mapUnit(u);
        const trackId = String(u.id);

        // Check if this unit's ID is already correctly mapped
        const correctlyMapped = allWorkspaceProps.find(p => p.pmsExternalId === trackId);
        if (correctlyMapped) {
          // Update the property data
          await db.update(properties)
            .set({ ...mapped, pmsExternalId: trackId, updatedAt: new Date() } as Record<string, unknown>)
            .where(eq(properties.id, correctlyMapped.id));
          updated++;
          continue;
        }

        // Try to match by name (property name contains the Track unit name or vice versa)
        const nameMatch = allWorkspaceProps.find(p =>
          p.name && mapped.name && (
            p.name.toLowerCase().includes(mapped.name.toLowerCase().split(' - ')[0].trim()) ||
            mapped.name.toLowerCase().includes(p.name.toLowerCase().split(' - ')[0].trim())
          )
        );
        if (nameMatch) {
          logger.info({ propId: nameMatch.id, oldExternalId: nameMatch.pmsExternalId, newExternalId: trackId, name: mapped.name }, '[Track import] Fixing pmsExternalId by name match');
          await db.update(properties)
            .set({ ...mapped, pmsExternalId: trackId, updatedAt: new Date() } as Record<string, unknown>)
            .where(eq(properties.id, nameMatch.id));
          updated++;
        }
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
  contactId?: number | string;
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

  // Persist Track credentials for auto-sync
  await db.update(workspaces).set({
    trackDomain: domain,
    trackApiKey: body.api_key,
    trackApiSecret: body.api_secret,
    trackSyncEnabled: 1,
    updatedAt: new Date(),
  }).where(eq(workspaces.id, req.workspaceId));

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
      if (testPerUnit.ok) reservationEndpointStyle = 'per-unit';
    } catch { /* per-unit endpoint not available */ }

    if (!reservationEndpointStyle) {
      try {
        const testGlobal = await fetch(globalUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
        if (testGlobal.ok) {
          reservationEndpointStyle = 'global';
        }
      } catch { /* global endpoint not available */ }
    }

    if (!reservationEndpointStyle) {
      res.json({ data: { imported: 0, updated: 0, total: 0 }, error: null, meta: { message: 'Track API does not support reservations endpoint' } });
      return;
    }

    // If global endpoint, fetch all reservations at once
    const allReservationsByUnit = new Map<string, TrackReservation[]>();

    if (reservationEndpointStyle === 'global') {
      // First, get total page count, then fetch pages backward from the last page
      // (Track doesn't support sort or date filters, and newest reservations are at the end)
      let nextUrl: string | null = `${base}/pms/reservations?size=50`;
      let stopPaginating = false;

      // Get page count from first request
      const metaRes = await fetch(`${base}/pms/reservations?size=50&page=1`, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
      if (!metaRes.ok) { res.json({ data: { imported: 0, updated: 0, total: 0 }, error: null, meta: { message: 'Failed to fetch reservations' } }); return; }
      const metaData = await metaRes.json() as Record<string, unknown>;
      const pageCount = (metaData.page_count as number) || 1;
      logger.info({ pageCount, totalItems: metaData.total_items }, '[Track reservations] starting backward pagination');

      // Track has a hard limit of page*size <= 10,000, so we must filter by date
      // to get recent reservations. Try various date filter param formats.
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dateFilters = [
        `arrivalStart=${sixMonthsAgo}`,      // Track documented filter
        `arrival_start=${sixMonthsAgo}`,      // snake_case variant
        `startDate=${sixMonthsAgo}`,          // alternative name
        `from=${sixMonthsAgo}`,               // generic
        `arrivalDate[gte]=${sixMonthsAgo}`,   // bracket filter syntax
      ];

      // Test which date filter Track accepts by checking if it reduces total_items
      let dateFilterParam = '';
      for (const filter of dateFilters) {
        try {
          const testUrl = `${base}/pms/reservations?size=1&${filter}`;
          const testRes = await fetch(testUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
          if (testRes.ok) {
            const testData = await testRes.json() as Record<string, unknown>;
            const filteredTotal = testData.total_items as number;
            if (filteredTotal != null && filteredTotal < 11000) {
              dateFilterParam = filter;
              break;
            }
          }
        } catch { /* try next */ }
      }

      // If no date filter works, fall back to paginating from page 1 forward and skip old ones
      const pageSize = 50;
      let currentPage = 1;
      const maxPages = 200;

      if (dateFilterParam) {
        // With date filter, paginate forward — all results should be recent
        nextUrl = `${base}/pms/reservations?size=${pageSize}&${dateFilterParam}`;
      } else {
        logger.warn('[Track reservations] no date filter worked, paginating forward from page 1');
        nextUrl = `${base}/pms/reservations?size=${pageSize}`;
      }

      while (nextUrl && currentPage <= maxPages && !stopPaginating) {
        currentPage--;
        try {
          const gRes = await fetch(nextUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
          if (!gRes.ok) {
            logger.warn({ status: gRes.status, page: currentPage + 1 }, '[Track reservations] page fetch failed');
            if (gRes.status === 422 || gRes.status === 404) continue; // skip invalid page, try next
            break;
          }
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

          // Stop if all reservations on this page have old departure dates (>90 days ago)
          const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          let allOld = items.length > 0;
          for (const r of items) {
            const rr = r as Record<string, unknown>;
            const depStr = (rr.departureDate ?? rr.checkOut ?? rr.endDate) as string | undefined;
            if (depStr && new Date(depStr) > ninetyDaysAgo) {
              allOld = false;
            }
            const uid = String(rr.unitId ?? rr.unit_id ?? rr.propertyId ?? rr.property_id ?? rr.unit ?? '');
            if (!uid) continue;
            if (!allReservationsByUnit.has(uid)) allReservationsByUnit.set(uid, []);
            allReservationsByUnit.get(uid)!.push(r);
          }

          if (allOld) {
            logger.info('[Track reservations] all reservations on page are old, stopping pagination');
            stopPaginating = true;
          }

          // Forward pagination via _links.next
          currentPage++;
          const links = gData._links as Record<string, { href?: string }> | undefined;
          const rawNext = links?.next?.href;
          if (rawNext && typeof rawNext === 'string') {
            nextUrl = rawNext.startsWith('http') ? rawNext : `https://${domain}${rawNext}`;
          } else {
            nextUrl = null;
          }
        } catch (pageErr) {
          logger.warn({ err: pageErr, page: currentPage }, '[Track reservations] page fetch error');
          break;
        }
      }
    }

    // Fetch Track units to build a mapping from Track internal id → unitId used in reservations
    // Track units have an `id` field (internal DB id) but reservations may reference a different `unitId`
    const unitIdMapping = new Map<string, string>(); // Track unit.id → the id used in reservations
    try {
      let unitsUrl: string | null = `${base}/pms/units?size=50`;
      while (unitsUrl) {
        const uRes = await fetch(unitsUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
        if (!uRes.ok) break;
        const uData = await uRes.json() as Record<string, unknown>;
        const embedded = uData._embedded as Record<string, unknown> | undefined;
        const trackUnits = (embedded?.units ?? embedded?.unit ?? embedded?.properties ?? []) as Array<Record<string, unknown>>;

        // Log all units with their id and name to identify the mapping
        for (const tu of trackUnits) {
          const internalId = String(tu.id ?? '');
          unitIdMapping.set(internalId, internalId);
        }


        const links = uData._links as Record<string, { href?: string }> | undefined;
        const rawNext = links?.next?.href;
        if (rawNext && typeof rawNext === 'string' && rawNext !== unitsUrl) {
          unitsUrl = rawNext.startsWith('http') ? rawNext : `https://${domain}${rawNext}`;
        } else {
          unitsUrl = null;
        }
      }
    } catch (err) {
      logger.warn({ err }, '[Track reservations] Failed to fetch units for ID mapping');
    }

    // ── Batch-fetch contact details for all reservations ──────────────
    const contactCache = new Map<string, { name: string; email: string | null; phone: string | null }>();

    // First check if contact data is already embedded in reservations
    let contactsEmbedded = false;
    for (const resList of allReservationsByUnit.values()) {
      if (resList.length > 0) {
        const sample = resList[0] as Record<string, unknown>;
        const embedded = sample._embedded as Record<string, unknown> | undefined;
        const links = sample._links as Record<string, unknown> | undefined;
        logger.info({
          hasEmbedded: !!embedded,
          embeddedKeys: embedded ? Object.keys(embedded) : null,
          linkKeys: links ? Object.keys(links) : null,
          contactId: sample.contactId,
        }, '[Track reservations] embedded contact check');
        if (embedded?.contact || embedded?.guest) {
          contactsEmbedded = true;
        }
        break;
      }
    }

    // Try to extract contacts from _embedded if available
    let loggedContactSample = false;
    if (contactsEmbedded) {
      for (const resList of allReservationsByUnit.values()) {
        for (const r of resList) {
          const rr = r as Record<string, unknown>;
          const embedded = rr._embedded as Record<string, unknown> | undefined;
          const contact = (embedded?.contact ?? embedded?.guest) as Record<string, unknown> | undefined;
          if (contact) {
            if (!loggedContactSample) {
              loggedContactSample = true;
            }
            const cid = String(rr.contactId ?? rr.contact_id ?? '');
            const firstName = String(contact.firstName ?? contact.first_name ?? contact.givenName ?? '');
            const lastName = String(contact.lastName ?? contact.last_name ?? contact.familyName ?? '');
            const name = [firstName, lastName].filter(Boolean).join(' ');
            const email = (contact.primaryEmail ?? contact.email ?? contact.emailAddress ?? contact.secondaryEmail ?? null) as string | null ?? null;
            const phone = (contact.cellPhone ?? contact.homePhone ?? contact.phone ?? contact.phoneNumber ?? contact.mobile ?? contact.workPhone ?? contact.otherPhone ?? null) as string | null ?? null;
            if (cid) contactCache.set(cid, { name, email, phone });
          }
        }
      }
      logger.info({ cached: contactCache.size }, '[Track reservations] contacts extracted from embedded data');
    }

    // Collect unique contactIds from all reservations
    const allContactIds = new Set<string>();
    for (const resList of allReservationsByUnit.values()) {
      for (const r of resList) {
        const cid = (r as Record<string, unknown>).contactId ?? (r as Record<string, unknown>).contact_id;
        if (cid != null && String(cid) !== '' && !contactCache.has(String(cid))) {
          allContactIds.add(String(cid));
        }
      }
    }

    // Fetch contacts in parallel with concurrency limit of 5
    if (allContactIds.size > 0) {
      const contactIdArr = Array.from(allContactIds);
      let loggedSample = false;

      // Discover the correct contact endpoint path
      const testContactId = contactIdArr[0];
      const contactPaths = [`${base}/crm/contacts/${testContactId}`, `${base}/pms/contacts/${testContactId}`, `${base}/contacts/${testContactId}`, `${base}/pms/reservations/${testContactId}/contact`];
      let contactBasePath = '';
      for (const path of contactPaths) {
        try {
          const res = await fetch(path, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
          if (res.ok) {
            // Extract the base path pattern (everything before the contactId)
            contactBasePath = path.replace(testContactId, '{ID}');
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('json')) {
              const sample = await res.json() as Record<string, unknown>;
              logger.info({ path, contactKeys: Object.keys(sample) }, '[Track reservations] found working contact endpoint');
            }
            break;
          } else {
          }
        } catch { /* try next */ }
      }

      if (!contactBasePath) {
        logger.warn({ triedPaths: contactPaths }, '[Track reservations] no working contact endpoint found');
      }

      const fetchContact = async (contactId: string): Promise<void> => {
        if (!contactBasePath) return;
        try {
          const url = contactBasePath.replace('{ID}', contactId);
          const contactRes = await fetch(url, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
          if (!contactRes.ok) return;
          const ct = contactRes.headers.get('content-type') || '';
          if (!ct.includes('json')) return;
          const contactData = await contactRes.json() as Record<string, unknown>;

          if (!loggedSample) {
            loggedSample = true;
          }

          const firstName = String(contactData.firstName ?? contactData.first_name ?? contactData.name ?? '').trim();
          const lastName = String(contactData.lastName ?? contactData.last_name ?? '').trim();
          const fullName = [firstName, lastName].filter(Boolean).join(' ');

          const email = (contactData.primaryEmail ?? contactData.email ?? contactData.emailAddress ?? contactData.secondaryEmail ?? null) as string | null;
          const phone = (contactData.cellPhone ?? contactData.homePhone ?? contactData.phone ?? contactData.phoneNumber ?? contactData.mobile ?? contactData.workPhone ?? null) as string | null;

          contactCache.set(contactId, {
            name: fullName || '',
            email: email || null,
            phone: phone || null,
          });
        } catch { /* skip */ }
      };

      // Process in chunks of 5 for concurrency control
      for (let i = 0; i < contactIdArr.length; i += 5) {
        const chunk = contactIdArr.slice(i, i + 5);
        await Promise.all(chunk.map(fetchContact));
      }

      logger.info({ total: allContactIds.size, fetched: contactCache.size }, '[Track reservations] contact fetch complete');
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

      // For per-unit fetches, batch-fetch any contacts not already cached
      if (reservationEndpointStyle === 'per-unit' && trackReservations.length > 0) {
        const missingContactIds: string[] = [];
        for (const r of trackReservations) {
          const cid = String((r as Record<string, unknown>).contactId ?? (r as Record<string, unknown>).contact_id ?? '');
          if (cid && !contactCache.has(cid)) missingContactIds.push(cid);
        }
        const uniqueMissing = [...new Set(missingContactIds)];
        let loggedSample = contactCache.size > 0;
        const fetchContact = async (cId: string): Promise<void> => {
          try {
            const cRes = await fetch(`${base}/pms/contacts/${cId}`, {
              headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
            });
            if (!cRes.ok) return;
            const ct = cRes.headers.get('content-type') || '';
            if (!ct.includes('json')) return;
            const cData = await cRes.json() as Record<string, unknown>;
            if (!loggedSample) {
              logger.info({ contactKeys: Object.keys(cData) }, '[Track reservations] sample contact fields');
              loggedSample = true;
            }
            const firstName = String(cData.firstName ?? cData.first_name ?? cData.name ?? '').trim();
            const lastName = String(cData.lastName ?? cData.last_name ?? '').trim();
            const fullName = [firstName, lastName].filter(Boolean).join(' ');
            const email = (cData.email ?? cData.emailAddress ?? cData.email_address ?? null) as string | null;
            const phone = (cData.phone ?? cData.phoneNumber ?? cData.phone_number ?? cData.mobile ?? null) as string | null;
            contactCache.set(cId, { name: fullName || '', email: email || null, phone: phone || null });
          } catch (err) {
            logger.warn({ err, contactId: cId }, '[Track reservations] failed to fetch contact');
          }
        };
        for (let i = 0; i < uniqueMissing.length; i += 5) {
          await Promise.all(uniqueMissing.slice(i, i + 5).map(fetchContact));
        }
      }

      for (const tr of trackReservations) {
        const externalId = tr.id != null ? String(tr.id) : null;
        if (!externalId) continue;

        // Resolve contact info if available
        const contactId = String((tr as Record<string, unknown>).contactId ?? (tr as Record<string, unknown>).contact_id ?? '');
        const contact = contactId ? contactCache.get(contactId) : undefined;

        const rawGuestName = tr.guestName ?? tr.guest ?? tr.name ?? null;
        const guestName = (contact?.name && contact.name.length > 0) ? contact.name : rawGuestName;
        const guestEmail = contact?.email ?? null;
        const guestPhone = contact?.phone ?? null;

        const checkInStr = tr.arrivalDate ?? tr.checkIn ?? tr.startDate;
        const checkOutStr = tr.departureDate ?? tr.checkOut ?? tr.endDate;

        if (!checkInStr || !checkOutStr) continue;

        // Normalize to standard times: 4 PM check-in, 11 AM check-out
        const checkIn = applyStandardCheckInTime(new Date(checkInStr));
        const checkOut = applyStandardCheckOutTime(new Date(checkOutStr));

        // Skip past reservations (checkOut in the past)
        if (checkOut < now) continue;

        const guestCount = tr.numGuests ?? tr.guests ?? tr.numberOfGuests ?? null;
        const status = tr.status ?? 'confirmed';

        // Skip cancelled reservations
        if (status.toLowerCase() === 'cancelled' || status.toLowerCase() === 'canceled') continue;

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
              guestEmail,
              guestPhone,
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
            guestEmail,
            guestPhone,
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
        ne(reservations.status, 'Cancelled'),
        ne(reservations.status, 'cancelled'),
        ne(reservations.status, 'canceled'),
      ))
      .orderBy(reservations.checkIn);

    res.json({ data: { reservations: rows }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/reservations]');
    res.status(500).json({ data: null, error: 'Failed to fetch reservations', meta: {} });
  }
});

// ── Current Reservation Check ────────────────────────────────────────────────

// GET /:workspaceId/properties/:propertyId/current-reservation
router.get('/:workspaceId/properties/:propertyId/current-reservation', requireWorkspace, async (req: Request, res: Response) => {
  const { propertyId } = req.params;

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

    const now = new Date();

    const [current] = await db
      .select()
      .from(reservations)
      .where(and(
        eq(reservations.propertyId, propertyId),
        lte(reservations.checkIn, now),
        gte(reservations.checkOut, now),
        ne(reservations.status, 'cancelled'),
        ne(reservations.status, 'Cancelled'),
        ne(reservations.status, 'canceled'),
      ))
      .limit(1);

    res.json({
      data: {
        occupied: !!current,
        reservation: current ?? null,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/current-reservation]');
    res.status(500).json({ data: null, error: 'Failed to check current reservation', meta: {} });
  }
});

// ── Calendar Sources (iCal sync) ───────────────────────────────────────────

// GET /:workspaceId/properties/:propertyId/calendar-source
// Returns the property's calendar source configuration (if any)
router.get('/:workspaceId/properties/:propertyId/calendar-source', requireWorkspace, async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const [source] = await db.select().from(propertyCalendarSources)
      .where(eq(propertyCalendarSources.propertyId, propertyId))
      .orderBy(desc(propertyCalendarSources.createdAt))
      .limit(1);

    res.json({ data: source ?? null, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/calendar-source]');
    res.status(500).json({ data: null, error: 'Failed to fetch calendar source', meta: {} });
  }
});

// POST /:workspaceId/properties/:propertyId/calendar-source
// Add or update an iCal feed for a property
router.post('/:workspaceId/properties/:propertyId/calendar-source', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  const { ical_url, sync_frequency_minutes } = req.body as { ical_url?: string; sync_frequency_minutes?: number };

  if (!ical_url || typeof ical_url !== 'string') {
    res.status(400).json({ data: null, error: 'ical_url is required', meta: {} });
    return;
  }

  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    // Validate the URL is reachable + parses
    const { validateIcalUrl, syncCalendarSource } = await import('../services/ical-sync');
    const validation = await validateIcalUrl(ical_url);
    if (!validation.valid) {
      res.status(400).json({ data: null, error: validation.error || 'Could not validate iCal feed', meta: {} });
      return;
    }

    // Check if a source already exists for this property — update if so, insert if not
    const [existing] = await db.select().from(propertyCalendarSources)
      .where(eq(propertyCalendarSources.propertyId, propertyId)).limit(1);

    let source;
    if (existing) {
      const [updated] = await db.update(propertyCalendarSources)
        .set({
          icalUrl: ical_url,
          syncFrequencyMinutes: sync_frequency_minutes ?? 60,
          lastSyncStatus: 'never_synced',
          lastSyncError: null,
          consecutiveFailures: 0,
          updatedAt: new Date(),
        })
        .where(eq(propertyCalendarSources.id, existing.id))
        .returning();
      source = updated;
    } else {
      const [inserted] = await db.insert(propertyCalendarSources).values({
        propertyId,
        workspaceId: req.workspaceId,
        sourceType: 'ical_url',
        icalUrl: ical_url,
        syncFrequencyMinutes: sync_frequency_minutes ?? 60,
      }).returning();
      source = inserted;
    }

    // Trigger an immediate first sync
    const result = await syncCalendarSource(source);

    // Return the updated source
    const [refreshed] = await db.select().from(propertyCalendarSources)
      .where(eq(propertyCalendarSources.id, source.id)).limit(1);

    res.status(201).json({ data: { source: refreshed, syncResult: result }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/properties/:propertyId/calendar-source]');
    res.status(500).json({ data: null, error: 'Failed to add calendar source', meta: {} });
  }
});

// DELETE /:workspaceId/properties/:propertyId/calendar-source/:sourceId
// Disconnect a calendar source. Existing reservation rows are preserved.
router.delete('/:workspaceId/properties/:propertyId/calendar-source/:sourceId', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { propertyId, sourceId } = req.params;
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    await db.delete(propertyCalendarSources)
      .where(and(eq(propertyCalendarSources.id, sourceId), eq(propertyCalendarSources.propertyId, propertyId)));

    res.json({ data: { ok: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /business/:id/properties/:propertyId/calendar-source/:sourceId]');
    res.status(500).json({ data: null, error: 'Failed to disconnect calendar source', meta: {} });
  }
});

// POST /:workspaceId/properties/:propertyId/calendar-source/:sourceId/sync
// Manually trigger a sync (e.g. PM updated their Airbnb calendar and wants Homie to pick it up now)
router.post('/:workspaceId/properties/:propertyId/calendar-source/:sourceId/sync', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { propertyId, sourceId } = req.params;
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const [source] = await db.select().from(propertyCalendarSources)
      .where(and(eq(propertyCalendarSources.id, sourceId), eq(propertyCalendarSources.propertyId, propertyId))).limit(1);
    if (!source) { res.status(404).json({ data: null, error: 'Calendar source not found', meta: {} }); return; }

    // Reset paused state on manual trigger
    if (source.lastSyncStatus === 'paused') {
      await db.update(propertyCalendarSources)
        .set({ lastSyncStatus: 'never_synced', consecutiveFailures: 0 })
        .where(eq(propertyCalendarSources.id, source.id));
    }

    const { syncCalendarSource } = await import('../services/ical-sync');
    const result = await syncCalendarSource(source);

    const [refreshed] = await db.select().from(propertyCalendarSources)
      .where(eq(propertyCalendarSources.id, source.id)).limit(1);

    res.json({ data: { source: refreshed, syncResult: result }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/properties/:propertyId/calendar-source/:sourceId/sync]');
    res.status(500).json({ data: null, error: 'Failed to sync calendar source', meta: {} });
  }
});

// POST /:workspaceId/properties/:propertyId/reservations/import-csv
// Manually import reservations from a CSV (for PMs without iCal/PMS)
router.post('/:workspaceId/properties/:propertyId/reservations/import-csv', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  const { csv } = req.body as { csv?: string };

  if (!csv || typeof csv !== 'string') {
    res.status(400).json({ data: null, error: 'csv body is required', meta: {} });
    return;
  }

  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    // Parse CSV — expect a header row
    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      res.status(400).json({ data: null, error: 'CSV must have a header row and at least one data row', meta: {} });
      return;
    }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const checkInIdx = header.findIndex(h => h === 'checkin_date' || h === 'check_in' || h === 'checkin');
    const checkOutIdx = header.findIndex(h => h === 'checkout_date' || h === 'check_out' || h === 'checkout');
    const guestNameIdx = header.findIndex(h => h === 'guest_name' || h === 'name');
    const guestCountIdx = header.findIndex(h => h === 'guest_count' || h === 'guests' || h === 'count');

    if (checkInIdx === -1 || checkOutIdx === -1) {
      res.status(400).json({ data: null, error: 'CSV must have checkin_date and checkout_date columns', meta: {} });
      return;
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const checkInStr = cols[checkInIdx];
      const checkOutStr = cols[checkOutIdx];
      if (!checkInStr || !checkOutStr) { skipped++; continue; }
      const rawCheckIn = new Date(checkInStr);
      const rawCheckOut = new Date(checkOutStr);
      if (isNaN(rawCheckIn.getTime()) || isNaN(rawCheckOut.getTime())) {
        errors.push(`Row ${i + 1}: invalid date`);
        skipped++;
        continue;
      }
      // Normalize to standard times: 4 PM check-in, 11 AM check-out
      const checkIn = applyStandardCheckInTime(rawCheckIn);
      const checkOut = applyStandardCheckOutTime(rawCheckOut);
      const guestName = guestNameIdx >= 0 ? cols[guestNameIdx] || null : null;
      const guestCountRaw = guestCountIdx >= 0 ? cols[guestCountIdx] : null;
      const guestCount = guestCountRaw ? parseInt(guestCountRaw, 10) || null : null;

      try {
        await db.insert(reservations).values({
          propertyId,
          workspaceId: req.workspaceId,
          guestName,
          guests: guestCount,
          checkIn,
          checkOut,
          status: 'confirmed',
          source: 'manual_csv',
        });
        imported++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'insert failed'}`);
        skipped++;
      }
    }

    res.json({ data: { imported, skipped, errors: errors.slice(0, 20) }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/properties/:propertyId/reservations/import-csv]');
    res.status(500).json({ data: null, error: 'Failed to import CSV', meta: {} });
  }
});

// GET /:workspaceId/properties/:propertyId/timeline
// Combined view of upcoming reservations + turnover gaps + auto-dispatch runs
router.get('/:workspaceId/properties/:propertyId/timeline', requireWorkspace, async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  const { days } = req.query as { days?: string };
  const dayCount = Math.min(parseInt(days || '30', 10) || 30, 90);

  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const now = new Date();
    const horizon = new Date(now.getTime() + dayCount * 24 * 60 * 60 * 1000);

    const reservationRows = await db
      .select()
      .from(reservations)
      .where(and(
        eq(reservations.propertyId, propertyId),
        gte(reservations.checkOut, now),
        lte(reservations.checkIn, horizon),
        ne(reservations.status, 'cancelled'),
        ne(reservations.status, 'Cancelled'),
        ne(reservations.status, 'canceled'),
      ))
      .orderBy(reservations.checkIn);

    // Pull active per_checkout schedules + their pending runs for these reservations
    const reservationIds = reservationRows.map(r => r.id);
    let runRows: Array<{
      id: string; scheduleId: string; reservationId: string | null; scheduledFor: Date;
      status: string; jobId: string | null;
      scheduleTitle: string; scheduleCategory: string;
    }> = [];
    if (reservationIds.length > 0) {
      runRows = await db
        .select({
          id: dispatchScheduleRuns.id,
          scheduleId: dispatchScheduleRuns.scheduleId,
          reservationId: dispatchScheduleRuns.reservationId,
          scheduledFor: dispatchScheduleRuns.scheduledFor,
          status: dispatchScheduleRuns.status,
          jobId: dispatchScheduleRuns.jobId,
          scheduleTitle: dispatchSchedules.title,
          scheduleCategory: dispatchSchedules.category,
        })
        .from(dispatchScheduleRuns)
        .innerJoin(dispatchSchedules, eq(dispatchScheduleRuns.scheduleId, dispatchSchedules.id))
        .where(inArray(dispatchScheduleRuns.reservationId, reservationIds));
    }
    const runsByReservation = new Map<string, typeof runRows>();
    for (const r of runRows) {
      if (!r.reservationId) continue;
      const list = runsByReservation.get(r.reservationId) || [];
      list.push(r);
      runsByReservation.set(r.reservationId, list);
    }

    // Compute turnover gap to next reservation, flag tight windows
    const TIGHT_GAP_HOURS = 5;
    const items = reservationRows.map((r, i) => {
      const next = reservationRows[i + 1];
      const turnoverGapHours = next ? (next.checkIn.getTime() - r.checkOut.getTime()) / 3_600_000 : null;
      const tight = turnoverGapHours !== null && turnoverGapHours < TIGHT_GAP_HOURS;
      return {
        id: r.id,
        guestName: r.guestName,
        guestCount: r.guests,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status: r.status,
        source: r.source,
        turnoverGapHours,
        tightTurnover: tight,
        runs: (runsByReservation.get(r.id) || []).map(run => ({
          id: run.id,
          scheduleId: run.scheduleId,
          scheduledFor: run.scheduledFor,
          status: run.status,
          jobId: run.jobId,
          scheduleTitle: run.scheduleTitle,
          scheduleCategory: run.scheduleCategory,
        })),
      };
    });

    res.json({ data: { items, days: dayCount }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/timeline]');
    res.status(500).json({ data: null, error: 'Failed to load timeline', meta: {} });
  }
});

// GET /:workspaceId/dashboard/turnovers
// This week's checkouts across all workspace properties
router.get('/:workspaceId/dashboard/turnovers', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Workspace properties
    const propRows = await db
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .where(and(eq(properties.workspaceId, req.workspaceId), eq(properties.active, true)));

    if (propRows.length === 0) { res.json({ data: { items: [] }, error: null, meta: {} }); return; }

    const propIds = propRows.map(p => p.id);
    const propNameById = new Map(propRows.map(p => [p.id, p.name] as const));

    // Upcoming checkouts within 7 days
    const checkouts = await db
      .select()
      .from(reservations)
      .where(and(
        inArray(reservations.propertyId, propIds),
        gte(reservations.checkOut, now),
        lte(reservations.checkOut, sevenDaysOut),
        ne(reservations.status, 'cancelled'),
        ne(reservations.status, 'Cancelled'),
        ne(reservations.status, 'canceled'),
      ))
      .orderBy(reservations.checkOut);

    // Group by property to compute turnover gap (next reservation per property)
    const byProperty = new Map<string, typeof checkouts>();
    for (const r of checkouts) {
      const list = byProperty.get(r.propertyId) || [];
      list.push(r);
      byProperty.set(r.propertyId, list);
    }
    // We also need NEXT checkin (which may be outside the 7-day window)
    const allUpcoming = await db
      .select({ id: reservations.id, propertyId: reservations.propertyId, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
      .from(reservations)
      .where(and(
        inArray(reservations.propertyId, propIds),
        gte(reservations.checkIn, now),
        ne(reservations.status, 'cancelled'),
      ))
      .orderBy(reservations.checkIn);
    const checkinByProperty = new Map<string, typeof allUpcoming>();
    for (const r of allUpcoming) {
      const list = checkinByProperty.get(r.propertyId) || [];
      list.push(r);
      checkinByProperty.set(r.propertyId, list);
    }

    // Pull dispatch runs for these reservations
    const reservationIds = checkouts.map(r => r.id);
    let runRows: Array<{ reservationId: string | null; status: string }> = [];
    if (reservationIds.length > 0) {
      runRows = await db
        .select({ reservationId: dispatchScheduleRuns.reservationId, status: dispatchScheduleRuns.status })
        .from(dispatchScheduleRuns)
        .where(inArray(dispatchScheduleRuns.reservationId, reservationIds));
    }
    const runsByReservation = new Map<string, typeof runRows>();
    for (const r of runRows) {
      if (!r.reservationId) continue;
      const list = runsByReservation.get(r.reservationId) || [];
      list.push(r);
      runsByReservation.set(r.reservationId, list);
    }

    const TIGHT_GAP_HOURS = 5;
    const items = checkouts.map(r => {
      const propUpcoming = checkinByProperty.get(r.propertyId) || [];
      const nextCheckin = propUpcoming.find(x => x.checkIn > r.checkOut);
      const gapHours = nextCheckin ? (nextCheckin.checkIn.getTime() - r.checkOut.getTime()) / 3_600_000 : null;
      const runs = runsByReservation.get(r.id) || [];
      const totalRuns = runs.length;
      const confirmedRuns = runs.filter(x => x.status === 'completed' || x.status === 'dispatched').length;
      const failedRuns = runs.filter(x => x.status === 'failed').length;
      let dispatchStatus: 'confirmed' | 'pending' | 'attention' | 'none' = 'none';
      if (totalRuns > 0) {
        if (failedRuns > 0) dispatchStatus = 'attention';
        else if (confirmedRuns === totalRuns) dispatchStatus = 'confirmed';
        else dispatchStatus = 'pending';
      }
      return {
        reservationId: r.id,
        propertyId: r.propertyId,
        propertyName: propNameById.get(r.propertyId) ?? '',
        guestName: r.guestName,
        checkOut: r.checkOut,
        nextCheckIn: nextCheckin?.checkIn ?? null,
        turnoverGapHours: gapHours,
        tightTurnover: gapHours !== null && gapHours < TIGHT_GAP_HOURS,
        dispatchStatus,
        runCount: totalRuns,
      };
    });

    res.json({ data: { items }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/dashboard/turnovers]');
    res.status(500).json({ data: null, error: 'Failed to load turnovers', meta: {} });
  }
});

// GET /:workspaceId/dashboard/reservations
// Returns three buckets — currently occupied, upcoming check-outs, upcoming check-ins —
// with per-property details and any attached dispatch schedule runs.
router.get('/:workspaceId/dashboard/reservations', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const propRows = await db
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .where(and(eq(properties.workspaceId, req.workspaceId), eq(properties.active, true)));

    if (propRows.length === 0) {
      res.json({ data: { occupied: [], checkouts: [], checkins: [] }, error: null, meta: {} });
      return;
    }

    const propIds = propRows.map(p => p.id);
    const propNameById = new Map(propRows.map(p => [p.id, p.name] as const));

    // Pull all relevant reservations in one query: anything that's currently
    // happening or starting/ending within the next 7 days.
    const allRes = await db
      .select()
      .from(reservations)
      .where(and(
        inArray(reservations.propertyId, propIds),
        ne(reservations.status, 'cancelled'),
        ne(reservations.status, 'Cancelled'),
        ne(reservations.status, 'canceled'),
        gte(reservations.checkOut, now),
        lte(reservations.checkIn, horizon),
      ))
      .orderBy(reservations.checkIn);

    // Bucket them — check-outs and check-ins are today only
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const occupied = allRes.filter(r => r.checkIn <= now && r.checkOut > now);
    const checkouts = allRes.filter(r => r.checkOut >= todayStart && r.checkOut < todayEnd);
    const checkins = allRes.filter(r => r.checkIn >= todayStart && r.checkIn < todayEnd);

    // Pull dispatch schedule runs for any of these reservations (joined with schedule for title)
    const reservationIds = allRes.map(r => r.id);
    let runRows: Array<{ id: string; reservationId: string | null; scheduledFor: Date; status: string; jobId: string | null; scheduleId: string; scheduleTitle: string; scheduleCategory: string }> = [];
    if (reservationIds.length > 0) {
      runRows = await db
        .select({
          id: dispatchScheduleRuns.id,
          reservationId: dispatchScheduleRuns.reservationId,
          scheduledFor: dispatchScheduleRuns.scheduledFor,
          status: dispatchScheduleRuns.status,
          jobId: dispatchScheduleRuns.jobId,
          scheduleId: dispatchScheduleRuns.scheduleId,
          scheduleTitle: dispatchSchedules.title,
          scheduleCategory: dispatchSchedules.category,
        })
        .from(dispatchScheduleRuns)
        .innerJoin(dispatchSchedules, eq(dispatchScheduleRuns.scheduleId, dispatchSchedules.id))
        .where(inArray(dispatchScheduleRuns.reservationId, reservationIds));
    }
    const runsByReservation = new Map<string, typeof runRows>();
    for (const r of runRows) {
      if (!r.reservationId) continue;
      const list = runsByReservation.get(r.reservationId) || [];
      list.push(r);
      runsByReservation.set(r.reservationId, list);
    }

    function shape(r: typeof allRes[number]) {
      return {
        reservationId: r.id,
        propertyId: r.propertyId,
        propertyName: propNameById.get(r.propertyId) ?? '',
        guestName: r.guestName,
        guestCount: r.guests,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        source: r.source,
        runs: (runsByReservation.get(r.id) || []).map(run => ({
          id: run.id,
          scheduleId: run.scheduleId,
          scheduleTitle: run.scheduleTitle,
          scheduleCategory: run.scheduleCategory,
          scheduledFor: run.scheduledFor,
          status: run.status,
          jobId: run.jobId,
        })),
      };
    }

    res.json({
      data: {
        occupied: occupied.map(shape),
        checkouts: checkouts.map(shape),
        checkins: checkins.map(shape),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/dashboard/reservations]');
    res.status(500).json({ data: null, error: 'Failed to load dashboard reservations', meta: {} });
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
        rating: providers.rating,
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
        rating: r.rating,
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
        propertyName: properties.name,
        providerName: sql<string | null>`NULL`,
        jobId: jobs.id,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .leftJoin(properties, eq(jobs.propertyId, properties.id))
      .where(eq(jobs.workspaceId, req.workspaceId))
      .orderBy(desc(jobs.createdAt))
      .limit(10);

    const recentQuotes = await db
      .select({
        type: sql<string>`'quote'`,
        title: sql<string>`'Quote received'`,
        propertyName: properties.name,
        providerName: providers.name,
        jobId: providerResponses.jobId,
        createdAt: providerResponses.createdAt,
      })
      .from(providerResponses)
      .innerJoin(jobs, eq(providerResponses.jobId, jobs.id))
      .innerJoin(providers, eq(providerResponses.providerId, providers.id))
      .leftJoin(properties, eq(jobs.propertyId, properties.id))
      .where(eq(jobs.workspaceId, req.workspaceId))
      .orderBy(desc(providerResponses.createdAt))
      .limit(10);

    const recentBookings = await db
      .select({
        type: sql<string>`'booking'`,
        title: sql<string>`'Booking confirmed'`,
        propertyName: properties.name,
        providerName: providers.name,
        jobId: bookings.jobId,
        createdAt: bookings.confirmedAt,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .leftJoin(properties, eq(jobs.propertyId, properties.id))
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
        avgRating: providers.rating,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .where(eq(jobs.workspaceId, req.workspaceId))
      .groupBy(providers.id, providers.name, providers.rating)
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
      system: 'You are a property maintenance expert. Generate seasonal maintenance suggestions for vacation rental and residential property portfolios. Each suggestion should be a general recommendation applicable to multiple properties — do NOT name or reference specific properties. Use the portfolio locations and property types as context for region-appropriate suggestions (e.g. desert climate prep, coastal salt air maintenance, etc.).',
      messages: [
        {
          role: 'user',
          content: `Current month: ${currentMonth} (${currentSeason})\nTotal properties: ${props.length}\n\nPortfolio locations:\n${locationSummary}\n\nGenerate exactly ${limit} seasonal maintenance suggestions as a JSON array. Each suggestion should be a general recommendation the property manager can apply to any relevant property in their portfolio.\n\nEach item: { "title": string (short, actionable), "description": string (1-2 sentences explaining what to do and why), "category": string (e.g. hvac, plumbing, landscaping, pest_control, pool, roofing, general, cleaning), "priority": "low"|"medium"|"high", "reason": string (brief — why now, based on season/climate) }.\n\nDo NOT include a "properties" field. Respond with ONLY a valid JSON array. No markdown, no code blocks, no explanation.`,
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

// ── Booking Messages ─────────────────────────────────────────────────────────
// GET /:workspaceId/bookings/:bookingId/messages
// List all messages for a booking (team member must belong to workspace)

router.get('/:workspaceId/bookings/:bookingId/messages', requireWorkspace, async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  try {
    // Verify booking belongs to this workspace
    const [booking] = await db
      .select({ id: bookings.id, providerId: bookings.providerId })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .where(and(eq(bookings.id, bookingId), eq(jobs.workspaceId, req.workspaceId)))
      .limit(1);

    if (!booking) {
      res.status(404).json({ data: null, error: 'Booking not found', meta: {} });
      return;
    }

    const messages = await db
      .select()
      .from(bookingMessages)
      .where(eq(bookingMessages.bookingId, bookingId))
      .orderBy(bookingMessages.createdAt);

    res.json({ data: messages, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/bookings/:bid/messages]');
    res.status(500).json({ data: null, error: 'Failed to fetch messages', meta: {} });
  }
});

// POST /:workspaceId/bookings/:bookingId/messages
// Send a message from the property manager to the provider via SMS

router.post('/:workspaceId/bookings/:bookingId/messages', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const { content, photo_url: photoUrl } = req.body as { content?: string; photo_url?: string };

  const trimmedContent = (content ?? '').trim();
  if (!trimmedContent && !photoUrl) {
    res.status(400).json({ data: null, error: 'content or photo_url is required', meta: {} });
    return;
  }

  // Reject overly large data URLs (~7MB after base64 → ~5MB binary)
  if (photoUrl && photoUrl.length > 7_500_000) {
    res.status(413).json({ data: null, error: 'Photo too large (max ~5MB)', meta: {} });
    return;
  }

  try {
    // Verify booking belongs to workspace, get provider phone
    const [booking] = await db
      .select({
        id: bookings.id,
        providerId: bookings.providerId,
        providerPhone: providers.phone,
        providerName: providers.name,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .where(and(eq(bookings.id, bookingId), eq(jobs.workspaceId, req.workspaceId)))
      .limit(1);

    if (!booking) {
      res.status(404).json({ data: null, error: 'Booking not found', meta: {} });
      return;
    }

    // Get sender name
    const [member] = await db
      .select({ firstName: homeowners.firstName, lastName: homeowners.lastName })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);

    const senderName = [member?.firstName, member?.lastName].filter(Boolean).join(' ') || 'Property Manager';

    // Save message
    const [msg] = await db
      .insert(bookingMessages)
      .values({
        bookingId,
        senderType: 'team',
        senderId: req.homeownerId,
        senderName,
        content: trimmedContent,
        photoUrl: photoUrl ?? null,
      })
      .returning();

    // Send SMS/MMS via Twilio if provider has a phone number
    if (booking.providerPhone) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      if (accountSid && authToken && fromNumber) {
        const client = twilio(accountSid, authToken);
        const apiBase = process.env.API_BASE_URL ?? '';
        const mediaUrl = photoUrl && apiBase
          ? [`${apiBase}/api/v1/booking-messages/${msg.id}/photo`]
          : undefined;
        const body = trimmedContent
          ? `HomiePro - ${senderName}: ${trimmedContent}`
          : `HomiePro - ${senderName} sent a photo`;
        await client.messages.create({
          body,
          from: fromNumber,
          to: booking.providerPhone,
          ...(mediaUrl ? { mediaUrl } : {}),
        }).catch(err => logger.warn({ err, bookingId }, '[booking-messages] Twilio send failed'));
      }
    }

    res.status(201).json({ data: msg, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/bookings/:bid/messages]');
    res.status(500).json({ data: null, error: 'Failed to send message', meta: {} });
  }
});

// POST /:workspaceId/bookings/:bookingId/messages/read
// Mark all unread provider messages as read

router.post('/:workspaceId/bookings/:bookingId/messages/read', requireWorkspace, async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  try {
    await db
      .update(bookingMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(bookingMessages.bookingId, bookingId),
          eq(bookingMessages.senderType, 'provider'),
          isNull(bookingMessages.readAt),
        ),
      );

    res.json({ data: { ok: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/bookings/:bid/messages/read]');
    res.status(500).json({ data: null, error: 'Failed to mark read', meta: {} });
  }
});

// ── GET /:workspaceId/search — Site-wide search ────────────────────────────

router.get('/:workspaceId/search', requireWorkspace, async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q || q.length < 2) {
    res.json({ data: { properties: [], providers: [], dispatches: [] }, error: null, meta: {} });
    return;
  }

  const escaped = q.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  try {
    // 1. Properties
    const propertyRows = await db
      .select({
        id: properties.id,
        name: properties.name,
        address: properties.address,
      })
      .from(properties)
      .where(
        and(
          eq(properties.workspaceId, req.workspaceId),
          or(
            ilike(properties.name, pattern),
            sql`${properties.address} ILIKE ${pattern}`,
            sql`${properties.city} ILIKE ${pattern}`,
            sql`${properties.state} ILIKE ${pattern}`,
            sql`${properties.zipCode} ILIKE ${pattern}`,
          ),
        ),
      )
      .limit(5);

    // 2. Providers — all providers associated with this workspace (preferred, booked, or quoted)
    const providerRows = await db.execute(sql`
      SELECT DISTINCT p.id, p.name, p.phone,
        EXISTS(SELECT 1 FROM preferred_vendors pv WHERE pv.provider_id = p.id AND pv.workspace_id = ${req.workspaceId}) AS is_preferred,
        (SELECT COUNT(*)::int FROM provider_responses pr WHERE pr.provider_id = p.id AND pr.job_id IN (SELECT id FROM jobs WHERE workspace_id = ${req.workspaceId})) AS quote_count,
        (SELECT COUNT(*)::int FROM bookings b WHERE b.provider_id = p.id AND b.job_id IN (SELECT id FROM jobs WHERE workspace_id = ${req.workspaceId})) AS booking_count
      FROM providers p
      WHERE (
        p.id IN (SELECT provider_id FROM preferred_vendors WHERE workspace_id = ${req.workspaceId})
        OR p.id IN (SELECT provider_id FROM bookings WHERE job_id IN (SELECT id FROM jobs WHERE workspace_id = ${req.workspaceId}))
        OR p.id IN (SELECT provider_id FROM provider_responses WHERE job_id IN (SELECT id FROM jobs WHERE workspace_id = ${req.workspaceId}))
      )
      AND (
        p.name ILIKE ${pattern}
        OR p.phone ILIKE ${pattern}
        OR p.email ILIKE ${pattern}
      )
      LIMIT 5
    `) as unknown as Array<{ id: string; name: string; phone: string | null; is_preferred: boolean; quote_count: number; booking_count: number }>;

    // 2b. For matched providers, fetch their related jobs (quotes + bookings)
    const providerIds = providerRows.map(p => p.id);
    let providerJobs: Array<{ provider_id: string; job_id: string; summary: string; category: string; status: string; property_name: string | null; created_at: Date | null; relation: string }> = [];
    if (providerIds.length > 0) {
      try {
        const idList = sql.join(providerIds.map(id => sql`${id}::uuid`), sql`, `);
        providerJobs = await db.execute(sql`
          (
            SELECT pr.provider_id, j.id AS job_id, COALESCE(j.diagnosis->>'summary','') AS summary,
              COALESCE(j.diagnosis->>'category','') AS category, j.status, p.name AS property_name, j.created_at, 'quote' AS relation
            FROM provider_responses pr
            JOIN jobs j ON j.id = pr.job_id
            LEFT JOIN properties p ON p.id = j.property_id
            WHERE pr.provider_id IN (${idList}) AND j.workspace_id = ${req.workspaceId}
            ORDER BY j.created_at DESC LIMIT 10
          )
          UNION ALL
          (
            SELECT b.provider_id, j.id AS job_id, COALESCE(j.diagnosis->>'summary','') AS summary,
              COALESCE(j.diagnosis->>'category','') AS category, j.status, p.name AS property_name, j.created_at, 'booking' AS relation
            FROM bookings b
            JOIN jobs j ON j.id = b.job_id
            LEFT JOIN properties p ON p.id = j.property_id
            WHERE b.provider_id IN (${idList}) AND j.workspace_id = ${req.workspaceId}
            ORDER BY j.created_at DESC LIMIT 10
          )
        `) as unknown as typeof providerJobs;
      } catch (jobsErr) {
        logger.warn({ err: jobsErr }, '[search] failed to fetch provider jobs');
      }
    }

    // Group jobs by provider
    const jobsByProvider = new Map<string, typeof providerJobs>();
    for (const pj of providerJobs) {
      const list = jobsByProvider.get(pj.provider_id) || [];
      // Deduplicate by job_id — keep booking over quote
      if (!list.some(x => x.job_id === pj.job_id)) list.push(pj);
      jobsByProvider.set(pj.provider_id, list);
    }

    // 3. Dispatches (jobs for this workspace)
    const dispatchRows = await db
      .select({
        id: jobs.id,
        diagnosis: jobs.diagnosis,
        status: jobs.status,
        createdAt: jobs.createdAt,
        propertyName: properties.name,
      })
      .from(jobs)
      .leftJoin(properties, eq(jobs.propertyId, properties.id))
      .where(
        and(
          eq(jobs.workspaceId, req.workspaceId),
          or(
            sql`${jobs.diagnosis}->>'summary' ILIKE ${pattern}`,
            sql`${jobs.diagnosis}->>'category' ILIKE ${pattern}`,
          ),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(5);

    res.json({
      data: {
        properties: propertyRows.map(p => ({
          id: p.id,
          name: p.name,
          address: p.address || '',
          tab: 'properties',
        })),
        providers: providerRows.map(p => ({
          id: p.id,
          name: p.name,
          phone: p.phone || '',
          isPreferred: p.is_preferred,
          quoteCount: p.quote_count,
          bookingCount: p.booking_count,
          relatedJobs: (jobsByProvider.get(p.id) || []).slice(0, 5).map(j => ({
            jobId: j.job_id,
            summary: j.summary,
            category: (j.category || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            status: j.status,
            propertyName: j.property_name || '',
            relation: j.relation,
            date: j.created_at,
          })),
          tab: 'vendors',
        })),
        dispatches: dispatchRows.map(d => {
          const diag = d.diagnosis as Record<string, string> | null;
          const cat = (diag?.category || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return {
            id: d.id,
            category: cat,
            summary: diag?.summary || '',
            status: d.status,
            propertyName: d.propertyName || '',
            date: d.createdAt,
            tab: 'dispatches',
          };
        }),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/search]');
    res.status(500).json({ data: null, error: 'Failed to search', meta: {} });
  }
});

// ── GET /:workspaceId/notifications — List notifications ───────────────────

router.get('/:workspaceId/notifications', requireWorkspace, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 100);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, req.workspaceId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const [{ unread }] = await db
      .select({ unread: count() })
      .from(notifications)
      .where(and(eq(notifications.workspaceId, req.workspaceId), eq(notifications.read, false)));

    res.json({
      data: {
        items: rows.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          jobId: n.jobId,
          propertyId: n.propertyId,
          guestIssueId: n.guestIssueId,
          link: n.link,
          read: n.read,
          createdAt: n.createdAt,
        })),
        unreadCount: unread,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/notifications]');
    res.status(500).json({ data: null, error: 'Failed to load notifications', meta: {} });
  }
});

// ── Property Scans ─────────────────────────────────────────────────────────

// POST /:workspaceId/properties/:propertyId/scans — start a new scan
router.post('/:workspaceId/properties/:propertyId/scans', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  const { scan_type } = req.body as { scan_type?: 'full' | 'quick' };

  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const [scan] = await db.insert(propertyScans).values({
      propertyId,
      workspaceId: req.workspaceId,
      scanType: scan_type ?? 'full',
      scannedBy: req.homeownerId ?? null,
      status: 'in_progress',
    }).returning();

    res.status(201).json({ data: scan, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/properties/:propertyId/scans]');
    res.status(500).json({ data: null, error: 'Failed to start scan', meta: {} });
  }
});

// POST /:workspaceId/scans/:scanId/photos — upload + process a photo
router.post('/:workspaceId/scans/:scanId/photos', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { scanId } = req.params;
  const { image_data_url, room_hint, is_label_photo, notes } = req.body as {
    image_data_url?: string; room_hint?: string; is_label_photo?: boolean; notes?: string;
  };

  if (!image_data_url) {
    res.status(400).json({ data: null, error: 'image_data_url is required', meta: {} });
    return;
  }

  try {
    // Verify scan belongs to workspace
    const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    if (!scan || scan.workspaceId !== req.workspaceId) {
      res.status(404).json({ data: null, error: 'Scan not found', meta: {} });
      return;
    }

    // Parse data URL: "data:image/jpeg;base64,..."
    const match = image_data_url.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
    if (!match) {
      res.status(400).json({ data: null, error: 'image_data_url must be a base64-encoded data URL (image/jpeg, png, or webp)', meta: {} });
      return;
    }
    const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp';
    const base64 = match[3];

    const { processScanPhoto, detectChanges } = await import('../services/property-scan-processor');
    const result = await processScanPhoto({
      scanId,
      imageBase64: base64,
      imageMediaType: mediaType,
      roomHint: room_hint,
      isLabelPhoto: is_label_photo ?? false,
      notes,
    });

    // Quick scans: detect and persist changes against existing inventory
    let changes: Array<{ changeType: string; description: string; severity: string }> = [];
    if (scan.scanType === 'quick' && result.itemsDetected.length > 0 && scan.propertyId) {
      changes = await detectChanges({
        scanId,
        propertyId: scan.propertyId,
        detectedItems: result.itemsDetected.map(i => ({
          itemType: i.itemType,
          brand: i.brand,
          modelNumber: i.modelNumber,
        })),
        roomType: result.roomType,
      });
      if (changes.length > 0) {
        const { propertyScanChanges } = await import('../db/schema/property-scans');
        await db.insert(propertyScanChanges).values(changes.map(c => ({
          propertyId: scan.propertyId ?? undefined,
          scanId,
          changeType: c.changeType,
          description: c.description,
          severity: c.severity,
        })));
        await db.update(propertyScans)
          .set({ changesDetected: scan.changesDetected + changes.length })
          .where(eq(propertyScans.id, scanId));
      }
    }

    res.json({ data: { ...result, changes }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/scans/:scanId/photos]');
    res.status(500).json({ data: null, error: 'Failed to process photo', meta: {} });
  }
});

// GET /:workspaceId/scans/room-targets — return the static per-room target lists
// Used by the frontend to render the checklist immediately when switching rooms,
// before the first coaching call comes back.
router.get('/:workspaceId/scans/room-targets', requireWorkspace, async (_req: Request, res: Response) => {
  try {
    const { ROOM_TARGETS } = await import('../services/property-scan-processor');
    res.json({ data: { targets: ROOM_TARGETS }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/scans/room-targets]');
    res.status(500).json({ data: null, error: 'Failed to load room targets', meta: {} });
  }
});

// POST /:workspaceId/scans/:scanId/coaching — generate next coaching message
router.post('/:workspaceId/scans/:scanId/coaching', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { scanId } = req.params;
  const { current_room, last_detected_items } = req.body as {
    current_room?: string;
    last_detected_items?: Array<{ itemType: string; brand: string | null; confidence: number }>;
  };
  try {
    const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    if (!scan || scan.workspaceId !== req.workspaceId) {
      res.status(404).json({ data: null, error: 'Scan not found', meta: {} });
      return;
    }

    const rooms = await db
      .select({ roomType: propertyRooms.roomType })
      .from(propertyRooms)
      .where(eq(propertyRooms.scanId, scanId));

    const { generateCoachingMessage } = await import('../services/property-scan-processor');
    const result = await generateCoachingMessage({
      scanId,
      currentRoom: current_room || 'kitchen',
      lastDetectedItems: last_detected_items || [],
      totalItemsSoFar: scan.itemsCataloged,
      roomsScanned: rooms.map(r => r.roomType.replace(/_/g, ' ')),
    });

    res.json({ data: { message: result.message, roomProgress: result.roomProgress }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/scans/:scanId/coaching]');
    res.status(500).json({ data: null, error: 'Failed to generate coaching message', meta: {} });
  }
});

// GET /:workspaceId/scans/:scanId/changes — list quick-scan changes
router.get('/:workspaceId/scans/:scanId/changes', requireWorkspace, async (req: Request, res: Response) => {
  const { scanId } = req.params;
  try {
    const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    if (!scan || scan.workspaceId !== req.workspaceId) {
      res.status(404).json({ data: null, error: 'Scan not found', meta: {} });
      return;
    }
    const { propertyScanChanges } = await import('../db/schema/property-scans');
    const changes = await db.select().from(propertyScanChanges)
      .where(eq(propertyScanChanges.scanId, scanId))
      .orderBy(desc(propertyScanChanges.createdAt));
    res.json({ data: changes, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/scans/:scanId/changes]');
    res.status(500).json({ data: null, error: 'Failed to load changes', meta: {} });
  }
});

// POST /:workspaceId/scans/:scanId/complete — finalize a scan
router.post('/:workspaceId/scans/:scanId/complete', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { scanId } = req.params;
  try {
    const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    if (!scan || scan.workspaceId !== req.workspaceId) {
      res.status(404).json({ data: null, error: 'Scan not found', meta: {} });
      return;
    }
    const { completeScan } = await import('../services/property-scan-processor');
    const { settingsUpdatedPaths } = await completeScan(scanId);
    const [updated] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    res.json({ data: updated, error: null, meta: { settingsUpdatedPaths } });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/scans/:scanId/complete]');
    res.status(500).json({ data: null, error: 'Failed to complete scan', meta: {} });
  }
});

// GET /:workspaceId/properties/:propertyId/inventory — full inventory grouped by room
// Rooms with the same type are merged into a single group, and duplicate items
// within each merged group are collapsed (keeping the one with the most fields).
router.get('/:workspaceId/properties/:propertyId/inventory', requireWorkspace, async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const rooms = await db.select().from(propertyRooms)
      .where(eq(propertyRooms.propertyId, propertyId))
      .orderBy(propertyRooms.sortOrder, propertyRooms.createdAt);

    const items = await db.select().from(propertyInventoryItems)
      .where(and(
        eq(propertyInventoryItems.propertyId, propertyId),
        ne(propertyInventoryItems.status, 'pm_dismissed'),
      ))
      .orderBy(desc(propertyInventoryItems.confidenceScore));

    const { mergeDuplicateInventoryItems } = await import('../services/property-scan-processor');

    // Bucket items by their roomId
    const itemsByRoomId = new Map<string | null, typeof items>();
    for (const it of items) {
      const list = itemsByRoomId.get(it.roomId) || [];
      list.push(it);
      itemsByRoomId.set(it.roomId, list);
    }

    // Merge rooms by roomType — multiple "kitchen" rows collapse into one
    type MergedRoom = (typeof rooms)[number] & {
      items: typeof items;
      roomCount: number;
      mergedRoomIds: string[];
    };
    const mergedByType = new Map<string, MergedRoom>();
    for (const room of rooms) {
      const roomItems = itemsByRoomId.get(room.id) ?? [];
      const existing = mergedByType.get(room.roomType);
      if (existing) {
        existing.items.push(...roomItems);
        existing.roomCount += 1;
        existing.mergedRoomIds.push(room.id);
        // Prefer the earliest createdAt (already sorted) for stable display order
      } else {
        mergedByType.set(room.roomType, {
          ...room,
          items: [...roomItems],
          roomCount: 1,
          mergedRoomIds: [room.id],
        });
      }
    }

    // Dedupe items within each merged group
    const mergedRooms: MergedRoom[] = [];
    for (const merged of mergedByType.values()) {
      merged.items = mergeDuplicateInventoryItems(merged.items);
      mergedRooms.push(merged);
    }
    // Maintain original sortOrder/createdAt order
    mergedRooms.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Dedupe unassigned items too
    const unassignedItems = mergeDuplicateInventoryItems(itemsByRoomId.get(null) ?? []);

    // Recompute summary stats from the deduped + merged result
    let totalItems = unassignedItems.length;
    let totalAge = 0;
    let agedCount = 0;
    let agingItems = 0;
    let safetyFlags = 0;
    const allDedupedItems = [...mergedRooms.flatMap(r => r.items), ...unassignedItems];
    for (const it of allDedupedItems) {
      if (it.roomId !== null) totalItems++;
      const age = it.estimatedAgeYears ? parseFloat(it.estimatedAgeYears) : null;
      if (age !== null) { totalAge += age; agedCount++; }
      if (it.maintenanceFlags && it.maintenanceFlags.length > 0) {
        if (it.maintenanceFlags.some(f => /safety|electrical/i.test(f))) safetyFlags++;
        if (it.maintenanceFlags.some(f => /end_of_life|aging/i.test(f))) agingItems++;
      }
    }
    // Override: totalItems should just be allDedupedItems.length
    totalItems = allDedupedItems.length;

    res.json({
      data: {
        rooms: mergedRooms,
        unassignedItems,
        summary: {
          totalItems,
          averageAge: agedCount > 0 ? Math.round((totalAge / agedCount) * 10) / 10 : null,
          agingItems,
          safetyFlags,
        },
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/inventory]');
    res.status(500).json({ data: null, error: 'Failed to load inventory', meta: {} });
  }
});

// GET /:workspaceId/properties/:propertyId/scan-sources —
// Returns a map of dotted-path settings fields that the property's scan
// inventory could fill (i.e. fields whose values came from or could come
// from a scan). Used by the Equipment & Systems panel to show "scanned"
// badges next to fields. The map only lists paths the scan has data for.
router.get('/:workspaceId/properties/:propertyId/scan-sources', requireWorkspace, async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const items = await db.select().from(propertyInventoryItems)
      .where(eq(propertyInventoryItems.propertyId, propertyId));
    const rooms = await db.select().from(propertyRooms)
      .where(eq(propertyRooms.propertyId, propertyId));

    const { buildSettingsPatchFromInventory } = await import('../services/scan-to-settings-mapper');
    const patch = buildSettingsPatchFromInventory(items, rooms);

    // Flatten the patch into a list of dotted paths
    const paths: string[] = [];
    for (const [section, sectionVal] of Object.entries(patch)) {
      if (!sectionVal || typeof sectionVal !== 'object') continue;
      for (const [field, fieldVal] of Object.entries(sectionVal)) {
        if (fieldVal === undefined || fieldVal === null || fieldVal === '') continue;
        if (section === 'appliances' && typeof fieldVal === 'object') {
          for (const [subField, subVal] of Object.entries(fieldVal as Record<string, unknown>)) {
            if (subVal !== undefined && subVal !== null && subVal !== '') {
              paths.push(`appliances.${field}.${subField}`);
            }
          }
        } else {
          paths.push(`${section}.${field}`);
        }
      }
    }

    res.json({ data: { paths }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/scan-sources]');
    res.status(500).json({ data: null, error: 'Failed to load scan sources', meta: {} });
  }
});

// POST /:workspaceId/properties/:propertyId/inventory/apply-to-settings —
// re-merge the property's confirmed inventory into the property settings
// (Equipment & Systems). Useful after the PM confirms flagged items late.
router.post('/:workspaceId/properties/:propertyId/inventory/apply-to-settings', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const { applyScanToPropertySettings } = await import('../services/scan-to-settings-mapper');
    const updatedPaths = await applyScanToPropertySettings(propertyId);
    res.json({ data: { updatedPaths, count: updatedPaths.length }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/properties/:propertyId/inventory/apply-to-settings]');
    res.status(500).json({ data: null, error: 'Failed to apply scan results to settings', meta: {} });
  }
});

// PUT /:workspaceId/inventory/:itemId — confirm / correct / dismiss
router.put('/:workspaceId/inventory/:itemId', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const body = req.body as {
    status?: 'pm_confirmed' | 'pm_corrected' | 'pm_dismissed';
    brand?: string | null;
    model_number?: string | null;
    estimated_age_years?: number | null;
    condition?: string | null;
    notes?: string | null;
  };
  try {
    // Verify ownership through property → workspace
    const [item] = await db.select().from(propertyInventoryItems).where(eq(propertyInventoryItems.id, itemId)).limit(1);
    if (!item || !item.propertyId) { res.status(404).json({ data: null, error: 'Item not found', meta: {} }); return; }
    const [prop] = await db.select({ workspaceId: properties.workspaceId }).from(properties).where(eq(properties.id, item.propertyId)).limit(1);
    if (!prop || prop.workspaceId !== req.workspaceId) {
      res.status(403).json({ data: null, error: 'Forbidden', meta: {} });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) {
      updates.status = body.status;
      if (body.status === 'pm_confirmed' || body.status === 'pm_corrected') {
        updates.confirmedBy = req.homeownerId ?? null;
        updates.confirmedAt = new Date();
      }
    }
    if (body.brand !== undefined) updates.brand = body.brand;
    if (body.model_number !== undefined) updates.modelNumber = body.model_number;
    if (body.estimated_age_years !== undefined) updates.estimatedAgeYears = body.estimated_age_years !== null ? body.estimated_age_years.toString() : null;
    if (body.condition !== undefined) updates.condition = body.condition;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await db.update(propertyInventoryItems).set(updates).where(eq(propertyInventoryItems.id, itemId)).returning();
    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PUT /business/:id/inventory/:itemId]');
    res.status(500).json({ data: null, error: 'Failed to update item', meta: {} });
  }
});

// DELETE /:workspaceId/inventory/:itemId — permanently remove an item
router.delete('/:workspaceId/inventory/:itemId', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { itemId } = req.params;
  try {
    const [item] = await db.select().from(propertyInventoryItems).where(eq(propertyInventoryItems.id, itemId)).limit(1);
    if (!item || !item.propertyId) { res.status(404).json({ data: null, error: 'Item not found', meta: {} }); return; }
    const [prop] = await db.select({ workspaceId: properties.workspaceId }).from(properties).where(eq(properties.id, item.propertyId)).limit(1);
    if (!prop || prop.workspaceId !== req.workspaceId) {
      res.status(403).json({ data: null, error: 'Forbidden', meta: {} });
      return;
    }

    await db.delete(propertyInventoryItems).where(eq(propertyInventoryItems.id, itemId));
    res.json({ data: { deleted: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /business/:id/inventory/:itemId]');
    res.status(500).json({ data: null, error: 'Failed to delete item', meta: {} });
  }
});

// POST /:workspaceId/properties/:propertyId/inventory/manual — add an item manually
router.post('/:workspaceId/properties/:propertyId/inventory/manual', requireWorkspace, requireWorkspaceRole('admin', 'coordinator'), async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  const body = req.body as {
    room_id?: string;
    category: string;
    item_type: string;
    brand?: string;
    model_number?: string;
    estimated_age_years?: number;
    condition?: string;
    notes?: string;
  };
  if (!body.category || !body.item_type) {
    res.status(400).json({ data: null, error: 'category and item_type are required', meta: {} });
    return;
  }
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const [inserted] = await db.insert(propertyInventoryItems).values({
      propertyId,
      roomId: body.room_id ?? null,
      category: body.category,
      itemType: body.item_type,
      brand: body.brand ?? null,
      modelNumber: body.model_number ?? null,
      estimatedAgeYears: body.estimated_age_years !== undefined ? body.estimated_age_years.toString() : null,
      condition: body.condition ?? null,
      notes: body.notes ?? null,
      identificationMethod: 'pm_manual',
      confidenceScore: '1.00',
      status: 'pm_confirmed',
      confirmedBy: req.homeownerId ?? null,
      confirmedAt: new Date(),
    }).returning();

    res.status(201).json({ data: inserted, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/properties/:propertyId/inventory/manual]');
    res.status(500).json({ data: null, error: 'Failed to add item', meta: {} });
  }
});

// GET /:workspaceId/properties/:propertyId/scan-history — list past scans
router.get('/:workspaceId/properties/:propertyId/scan-history', requireWorkspace, async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const scans = await db.select().from(propertyScans)
      .where(eq(propertyScans.propertyId, propertyId))
      .orderBy(desc(propertyScans.createdAt))
      .limit(20);
    res.json({ data: scans, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/scan-history]');
    res.status(500).json({ data: null, error: 'Failed to load scan history', meta: {} });
  }
});

// GET /:workspaceId/properties/:propertyId/maintenance-flags
router.get('/:workspaceId/properties/:propertyId/maintenance-flags', requireWorkspace, async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  try {
    const [prop] = await db.select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, req.workspaceId))).limit(1);
    if (!prop) { res.status(404).json({ data: null, error: 'Property not found', meta: {} }); return; }

    const items = await db.select().from(propertyInventoryItems)
      .where(and(
        eq(propertyInventoryItems.propertyId, propertyId),
        ne(propertyInventoryItems.status, 'pm_dismissed'),
      ));

    const flags: Array<{ itemId: string; itemType: string; brand: string | null; description: string; severity: string }> = [];
    for (const item of items) {
      if (!item.maintenanceFlags) continue;
      for (const f of item.maintenanceFlags) {
        let description = '';
        let severity = 'info';
        if (f === 'approaching_end_of_life') {
          description = `${item.brand ? item.brand + ' ' : ''}${item.itemType.replace(/_/g, ' ')} is ${item.estimatedAgeYears ?? '?'} years old — approaching end of life`;
          severity = 'attention';
        } else {
          description = f.replace(/_/g, ' ');
        }
        flags.push({
          itemId: item.id,
          itemType: item.itemType,
          brand: item.brand,
          description,
          severity,
        });
      }
    }

    res.json({ data: flags, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /business/:id/properties/:propertyId/maintenance-flags]');
    res.status(500).json({ data: null, error: 'Failed to load flags', meta: {} });
  }
});

// POST /:workspaceId/notifications/mark-read — Mark notifications as read
router.post('/:workspaceId/notifications/mark-read', requireWorkspace, async (req: Request, res: Response) => {
  const body = req.body as { ids?: string[]; all?: boolean };
  try {
    if (body.all) {
      await db.update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.workspaceId, req.workspaceId), eq(notifications.read, false)));
    } else if (body.ids && body.ids.length > 0) {
      const idList = sql.join(body.ids.map(id => sql`${id}::uuid`), sql`, `);
      await db.execute(sql`UPDATE notifications SET read = true WHERE workspace_id = ${req.workspaceId} AND id IN (${idList})`);
    }
    res.json({ data: { ok: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /business/:id/notifications/mark-read]');
    res.status(500).json({ data: null, error: 'Failed to mark as read', meta: {} });
  }
});

export default router;
