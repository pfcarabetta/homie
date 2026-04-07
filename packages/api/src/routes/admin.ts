import { Router, Request, Response } from 'express';
import { count, desc, eq, sql, or, ilike, and } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners, jobs, bookings, providers, providerScores, outreachAttempts, providerResponses, suppressionList, workspaces, workspaceMembers, properties } from '../db/schema';
import { ApiResponse } from '../types/api';

const router = Router();

// GET /api/v1/admin/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [[{ value: totalHomeowners }], [{ value: totalJobs }], [{ value: totalBookings }], [{ value: totalProviders }], [{ value: totalOutreach }], jobsByStatus] = await Promise.all([
      db.select({ value: count() }).from(homeowners),
      db.select({ value: count() }).from(jobs),
      db.select({ value: count() }).from(bookings),
      db.select({ value: count() }).from(providers),
      db.select({ value: count() }).from(outreachAttempts),
      db.select({ status: jobs.status, count: count() }).from(jobs).groupBy(jobs.status),
    ]);

    const out: ApiResponse<unknown> = {
      data: {
        total_homeowners: totalHomeowners,
        total_jobs: totalJobs,
        total_bookings: totalBookings,
        total_providers: totalProviders,
        total_outreach: totalOutreach,
        jobs_by_status: Object.fromEntries(jobsByStatus.map((r) => [r.status, r.count])),
      },
      error: null,
      meta: {},
    };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[GET /admin/stats]');
    res.status(500).json({ data: null, error: 'Failed to fetch stats', meta: {} });
  }
});

// GET /api/v1/admin/homeowners
router.get('/homeowners', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const q = (req.query.q as string || '').trim();

  try {
    const escaped = q.replace(/[%_\\]/g, '\\$&');
    const searchFilter = q ? or(
      ilike(homeowners.email, `%${escaped}%`),
      sql`${homeowners.phone} ILIKE ${'%' + escaped + '%'}`,
      ilike(homeowners.zipCode, `%${escaped}%`),
    ) : undefined;

    const [[{ value: total }], rows] = await Promise.all([
      db.select({ value: count() }).from(homeowners).where(searchFilter),
      db
        .select({
          id: homeowners.id,
          email: homeowners.email,
          phone: homeowners.phone,
          zipCode: homeowners.zipCode,
          membershipTier: homeowners.membershipTier,
          createdAt: homeowners.createdAt,
        })
        .from(homeowners)
        .where(searchFilter)
        .orderBy(desc(homeowners.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    res.json({ data: rows, error: null, meta: { total, limit, offset } });
  } catch (err) {
    logger.error({ err }, '[GET /admin/homeowners]');
    res.status(500).json({ data: null, error: 'Failed to fetch homeowners', meta: {} });
  }
});

// GET /api/v1/admin/homeowners/:id
router.get('/homeowners/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [ho] = await db
      .select({
        id: homeowners.id,
        firstName: homeowners.firstName,
        lastName: homeowners.lastName,
        email: homeowners.email,
        phone: homeowners.phone,
        zipCode: homeowners.zipCode,
        membershipTier: homeowners.membershipTier,
        stripeCustomerId: homeowners.stripeCustomerId,
        emailVerified: homeowners.emailVerified,
        createdAt: homeowners.createdAt,
      })
      .from(homeowners)
      .where(eq(homeowners.id, id))
      .limit(1);

    if (!ho) { res.status(404).json({ data: null, error: 'Not found', meta: {} }); return; }

    const jobRows = await db
      .select({ id: jobs.id, status: jobs.status, tier: jobs.tier, diagnosis: jobs.diagnosis, zipCode: jobs.zipCode, workspaceId: jobs.workspaceId, createdAt: jobs.createdAt })
      .from(jobs).where(eq(jobs.homeownerId, id)).orderBy(desc(jobs.createdAt)).limit(20);

    const bookingRows = await db
      .select({ id: bookings.id, jobId: bookings.jobId, providerName: providers.name, status: bookings.status, confirmedAt: bookings.confirmedAt })
      .from(bookings).leftJoin(providers, eq(bookings.providerId, providers.id)).where(eq(bookings.homeownerId, id)).orderBy(desc(bookings.confirmedAt)).limit(20);

    const wsMemberships = await db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role, workspaceName: workspaces.name, workspacePlan: workspaces.plan })
      .from(workspaceMembers).innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id)).where(eq(workspaceMembers.homeownerId, id));

    const [[{ value: totalJobs }], [{ value: totalBookings }]] = await Promise.all([
      db.select({ value: count() }).from(jobs).where(eq(jobs.homeownerId, id)),
      db.select({ value: count() }).from(bookings).where(eq(bookings.homeownerId, id)),
    ]);

    res.json({ data: { homeowner: ho, jobs: jobRows, bookings: bookingRows, workspaces: wsMemberships, stats: { total_jobs: totalJobs, total_bookings: totalBookings } }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /admin/homeowners/:id]');
    res.status(500).json({ data: null, error: 'Failed to fetch details', meta: {} });
  }
});

// GET /api/v1/admin/jobs
router.get('/jobs', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const statusFilter = req.query.status as string | undefined;
  const q = (req.query.q as string || '').trim();

  try {
    const conditions = [];
    if (statusFilter) conditions.push(eq(jobs.status, statusFilter));
    const escaped = q.replace(/[%_\\]/g, '\\$&');
    if (q) conditions.push(or(
      sql`${jobs.id}::text ILIKE ${'%' + escaped + '%'}`,
      sql`${homeowners.email} ILIKE ${'%' + escaped + '%'}`,
      ilike(jobs.zipCode, `%${escaped}%`),
      sql`${jobs.diagnosis}->>'category' ILIKE ${'%' + escaped + '%'}`,
    ));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [[{ value: total }], rows] = await Promise.all([
      db.select({ value: count() }).from(jobs).leftJoin(homeowners, eq(jobs.homeownerId, homeowners.id)).where(where),
      db
        .select({
          id: jobs.id,
          homeownerEmail: homeowners.email,
          diagnosis: jobs.diagnosis,
          tier: jobs.tier,
          status: jobs.status,
          zipCode: jobs.zipCode,
          preferredTiming: jobs.preferredTiming,
          budget: jobs.budget,
          workspaceId: jobs.workspaceId,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .leftJoin(homeowners, eq(jobs.homeownerId, homeowners.id))
        .where(where)
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    res.json({ data: rows, error: null, meta: { total, limit, offset } });
  } catch (err) {
    logger.error({ err }, '[GET /admin/jobs]');
    res.status(500).json({ data: null, error: 'Failed to fetch jobs', meta: {} });
  }
});

// GET /api/v1/admin/jobs/:id
router.get('/jobs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [job] = await db
      .select({
        id: jobs.id,
        homeownerEmail: homeowners.email,
        homeownerPhone: homeowners.phone,
        homeownerName: sql`COALESCE(${homeowners.firstName} || ' ' || ${homeowners.lastName}, ${homeowners.email})`,
        diagnosis: jobs.diagnosis,
        tier: jobs.tier,
        status: jobs.status,
        paymentStatus: jobs.paymentStatus,
        zipCode: jobs.zipCode,
        preferredTiming: jobs.preferredTiming,
        budget: jobs.budget,
        createdAt: jobs.createdAt,
        expiresAt: jobs.expiresAt,
      })
      .from(jobs)
      .leftJoin(homeowners, eq(jobs.homeownerId, homeowners.id))
      .where(eq(jobs.id, id))
      .limit(1);

    if (!job) {
      res.status(404).json({ data: null, error: 'Job not found', meta: {} });
      return;
    }

    // Get outreach attempts
    const attempts = await db
      .select({
        id: outreachAttempts.id,
        channel: outreachAttempts.channel,
        status: outreachAttempts.status,
        providerName: providers.name,
        providerPhone: providers.phone,
        providerEmail: providers.email,
        attemptedAt: outreachAttempts.attemptedAt,
        respondedAt: outreachAttempts.respondedAt,
        scriptUsed: outreachAttempts.scriptUsed,
        responseRaw: outreachAttempts.responseRaw,
      })
      .from(outreachAttempts)
      .leftJoin(providers, eq(outreachAttempts.providerId, providers.id))
      .where(eq(outreachAttempts.jobId, id))
      .orderBy(desc(outreachAttempts.attemptedAt));

    // Get provider responses
    const responses = await db
      .select({
        id: providerResponses.id,
        providerName: providers.name,
        providerPhone: providers.phone,
        channel: providerResponses.channel,
        quotedPrice: providerResponses.quotedPrice,
        availability: providerResponses.availability,
        message: providerResponses.message,
        createdAt: providerResponses.createdAt,
      })
      .from(providerResponses)
      .leftJoin(providers, eq(providerResponses.providerId, providers.id))
      .where(eq(providerResponses.jobId, id))
      .orderBy(desc(providerResponses.createdAt));

    // Get bookings
    const jobBookings = await db
      .select({
        id: bookings.id,
        providerName: providers.name,
        status: bookings.status,
        confirmedAt: bookings.confirmedAt,
      })
      .from(bookings)
      .leftJoin(providers, eq(bookings.providerId, providers.id))
      .where(eq(bookings.jobId, id));

    res.json({
      data: {
        job,
        outreach_attempts: attempts,
        provider_responses: responses,
        bookings: jobBookings,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /admin/jobs/:id]');
    res.status(500).json({ data: null, error: 'Failed to fetch job details', meta: {} });
  }
});

// GET /api/v1/admin/providers
router.get('/providers', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const q = (req.query.q as string || '').trim();

  try {
    const escaped = q.replace(/[%_\\]/g, '\\$&');
    const searchFilter = q ? or(
      ilike(providers.name, `%${escaped}%`),
      sql`${providers.phone} ILIKE ${'%' + escaped + '%'}`,
      sql`${providers.email} ILIKE ${'%' + escaped + '%'}`,
      sql`array_to_string(${providers.categories}, ',') ILIKE ${'%' + escaped + '%'}`,
    ) : undefined;

    const [[{ value: total }], rows] = await Promise.all([
      db.select({ value: count() }).from(providers).where(searchFilter),
      db
        .select({
          id: providers.id,
          name: providers.name,
          phone: providers.phone,
          email: providers.email,
          website: providers.website,
          googleRating: providers.googleRating,
          reviewCount: providers.reviewCount,
          categories: providers.categories,
          discoveredAt: providers.discoveredAt,
          acceptanceRate: providerScores.acceptanceRate,
          totalOutreach: providerScores.totalOutreach,
          totalAccepted: providerScores.totalAccepted,
        })
        .from(providers)
        .leftJoin(providerScores, eq(providers.id, providerScores.providerId))
        .where(searchFilter)
        .orderBy(desc(providers.discoveredAt))
        .limit(limit)
        .offset(offset),
    ]);

    res.json({ data: rows, error: null, meta: { total, limit, offset } });
  } catch (err) {
    logger.error({ err }, '[GET /admin/providers]');
    res.status(500).json({ data: null, error: 'Failed to fetch providers', meta: {} });
  }
});

// GET /api/v1/admin/providers/:id
router.get('/providers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [provider] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
    if (!provider) {
      res.status(404).json({ data: null, error: 'Provider not found', meta: {} });
      return;
    }

    const [scores] = await db.select().from(providerScores).where(eq(providerScores.providerId, id)).limit(1);

    const attempts = await db
      .select({
        id: outreachAttempts.id,
        channel: outreachAttempts.channel,
        status: outreachAttempts.status,
        jobCategory: sql`${jobs.diagnosis}->>'category'`,
        jobZip: jobs.zipCode,
        attemptedAt: outreachAttempts.attemptedAt,
        respondedAt: outreachAttempts.respondedAt,
      })
      .from(outreachAttempts)
      .leftJoin(jobs, eq(outreachAttempts.jobId, jobs.id))
      .where(eq(outreachAttempts.providerId, id))
      .orderBy(desc(outreachAttempts.attemptedAt));

    const responses = await db
      .select({
        id: providerResponses.id,
        jobId: providerResponses.jobId,
        channel: providerResponses.channel,
        quotedPrice: providerResponses.quotedPrice,
        availability: providerResponses.availability,
        message: providerResponses.message,
        createdAt: providerResponses.createdAt,
      })
      .from(providerResponses)
      .where(eq(providerResponses.providerId, id))
      .orderBy(desc(providerResponses.createdAt));

    const providerBookings = await db
      .select({
        id: bookings.id,
        jobId: bookings.jobId,
        status: bookings.status,
        serviceAddress: bookings.serviceAddress,
        confirmedAt: bookings.confirmedAt,
      })
      .from(bookings)
      .where(eq(bookings.providerId, id))
      .orderBy(desc(bookings.confirmedAt));

    const suppressedRows = await db.select().from(suppressionList).where(eq(suppressionList.providerId, id));

    res.json({
      data: {
        provider: {
          id: provider.id,
          name: provider.name,
          phone: provider.phone,
          email: provider.email,
          website: provider.website,
          googlePlaceId: provider.googlePlaceId,
          googleRating: provider.googleRating,
          reviewCount: provider.reviewCount,
          categories: provider.categories,
          notificationPref: provider.notificationPref,
          vacationMode: provider.vacationMode,
          serviceZips: provider.serviceZips,
          discoveredAt: provider.discoveredAt,
        },
        scores: scores ? {
          acceptanceRate: scores.acceptanceRate,
          avgResponseSec: scores.avgResponseSec,
          completionRate: scores.completionRate,
          avgHomeownerRating: scores.avgHomeownerRating,
          totalOutreach: scores.totalOutreach,
          totalAccepted: scores.totalAccepted,
        } : null,
        outreach_attempts: attempts,
        provider_responses: responses,
        bookings: providerBookings,
        suppressed: suppressedRows.length > 0,
        suppression_reason: suppressedRows[0]?.reason ?? null,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /admin/providers/:id]');
    res.status(500).json({ data: null, error: 'Failed to fetch provider details', meta: {} });
  }
});

// GET /api/v1/admin/bookings
router.get('/bookings', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const q = (req.query.q as string || '').trim();

  try {
    const escaped = q.replace(/[%_\\]/g, '\\$&');
    const searchFilter = q ? or(
      sql`${bookings.id}::text ILIKE ${'%' + escaped + '%'}`,
      sql`${bookings.jobId}::text ILIKE ${'%' + escaped + '%'}`,
      ilike(providers.name, `%${escaped}%`),
      sql`${homeowners.email} ILIKE ${'%' + escaped + '%'}`,
    ) : undefined;

    const [[{ value: total }], rows] = await Promise.all([
      db.select({ value: count() }).from(bookings)
        .leftJoin(providers, eq(bookings.providerId, providers.id))
        .leftJoin(homeowners, eq(bookings.homeownerId, homeowners.id))
        .where(searchFilter),
      db
        .select({
          id: bookings.id,
          jobId: bookings.jobId,
          providerId: bookings.providerId,
          providerName: providers.name,
          providerPhone: providers.phone,
          providerEmail: providers.email,
          providerRating: providers.googleRating,
          providerReviewCount: providers.reviewCount,
          googlePlaceId: providers.googlePlaceId,
          homeownerEmail: homeowners.email,
          homeownerPhone: homeowners.phone,
          homeownerName: sql<string>`COALESCE(${homeowners.firstName} || ' ' || ${homeowners.lastName}, ${homeowners.firstName}, ${homeowners.email})`,
          serviceAddress: bookings.serviceAddress,
          status: bookings.status,
          confirmedAt: bookings.confirmedAt,
          quotedPrice: providerResponses.quotedPrice,
          availability: providerResponses.availability,
          message: providerResponses.message,
          channel: providerResponses.channel,
          jobCategory: sql<string>`${jobs.diagnosis}->>'category'`,
          jobSummary: sql<string>`${jobs.diagnosis}->>'summary'`,
          jobZipCode: jobs.zipCode,
          workspaceId: jobs.workspaceId,
        })
        .from(bookings)
        .leftJoin(providers, eq(bookings.providerId, providers.id))
        .leftJoin(homeowners, eq(bookings.homeownerId, homeowners.id))
        .leftJoin(providerResponses, eq(bookings.responseId, providerResponses.id))
        .leftJoin(jobs, eq(bookings.jobId, jobs.id))
        .where(searchFilter)
        .orderBy(desc(bookings.confirmedAt))
        .limit(limit)
        .offset(offset),
    ]);

    res.json({ data: rows, error: null, meta: { total, limit, offset } });
  } catch (err) {
    logger.error({ err }, '[GET /admin/bookings]');
    res.status(500).json({ data: null, error: 'Failed to fetch bookings', meta: {} });
  }
});

// POST /api/v1/admin/bookings/:id/cancel
router.post('/bookings/:id/cancel', async (req: Request, res: Response) => {
  try {
    const [updated] = await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, req.params.id)).returning();
    if (!updated) {
      res.status(404).json({ data: null, error: 'Booking not found', meta: {} });
      return;
    }
    res.json({ data: { id: updated.id, status: 'cancelled' }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/bookings/:id/cancel]');
    res.status(500).json({ data: null, error: 'Failed to cancel booking', meta: {} });
  }
});

// ── Business Account Management ─────────────────────────────────────────────

// POST /api/v1/admin/business-accounts — Create a business account for a user
router.post('/business-accounts', async (req: Request, res: Response) => {
  const { email, workspace_name, plan } = req.body as {
    email?: string;
    workspace_name?: string;
    plan?: string;
  };

  if (!email || typeof email !== 'string') {
    res.status(400).json({ data: null, error: 'email is required', meta: {} });
    return;
  }
  if (!workspace_name || typeof workspace_name !== 'string') {
    res.status(400).json({ data: null, error: 'workspace_name is required', meta: {} });
    return;
  }

  const validPlans = ['trial', 'starter', 'professional', 'business', 'enterprise'];
  const selectedPlan = plan && validPlans.includes(plan) ? plan : 'starter';
  const planSearchLimits: Record<string, number> = { trial: 5, starter: 2, professional: 3, business: 5, enterprise: 10 }; // per-property defaults

  try {
    // Find user
    const [user] = await db
      .select({ id: homeowners.id, email: homeowners.email, firstName: homeowners.firstName, lastName: homeowners.lastName })
      .from(homeowners)
      .where(eq(homeowners.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      res.status(404).json({ data: null, error: 'No user found with that email', meta: {} });
      return;
    }

    // Create slug from workspace name
    const slug = workspace_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Create workspace
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: workspace_name.trim(),
        slug,
        plan: selectedPlan,
        searchesLimit: planSearchLimits[selectedPlan] ?? 10,
        ownerId: user.id,
      })
      .returning();

    // Add user as admin member
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      homeownerId: user.id,
      role: 'admin',
      acceptedAt: new Date(),
    });

    res.status(201).json({
      data: {
        workspace,
        owner: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      },
      error: null,
      meta: {},
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ data: null, error: 'A workspace with that slug already exists', meta: {} });
      return;
    }
    logger.error({ err }, '[POST /admin/business-accounts]');
    res.status(500).json({ data: null, error: 'Failed to create business account', meta: {} });
  }
});

// GET /api/v1/admin/business-accounts — List all business workspaces
router.get('/business-accounts', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        plan: workspaces.plan,
        searchesUsed: workspaces.searchesUsed,
        searchesLimit: workspaces.searchesLimit,
        ownerEmail: homeowners.email,
        ownerName: sql`COALESCE(${homeowners.firstName} || ' ' || ${homeowners.lastName}, ${homeowners.email})`,
        createdAt: workspaces.createdAt,
      })
      .from(workspaces)
      .leftJoin(homeowners, eq(workspaces.ownerId, homeowners.id))
      .orderBy(desc(workspaces.createdAt));

    res.json({ data: rows, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /admin/business-accounts]');
    res.status(500).json({ data: null, error: 'Failed to fetch business accounts', meta: {} });
  }
});

// GET /api/v1/admin/business-accounts/:id — Get workspace detail
router.get('/business-accounts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [ws] = await db
      .select({
        id: workspaces.id, name: workspaces.name, slug: workspaces.slug,
        plan: workspaces.plan, stripeCustomerId: workspaces.stripeCustomerId,
        searchesUsed: workspaces.searchesUsed, searchesLimit: workspaces.searchesLimit,
        billingCycleStart: workspaces.billingCycleStart,
        ownerId: workspaces.ownerId, createdAt: workspaces.createdAt,
        ownerEmail: homeowners.email,
        ownerName: sql`COALESCE(${homeowners.firstName} || ' ' || ${homeowners.lastName}, ${homeowners.email})`,
        ownerPhone: homeowners.phone,
      })
      .from(workspaces)
      .leftJoin(homeowners, eq(workspaces.ownerId, homeowners.id))
      .where(eq(workspaces.id, id))
      .limit(1);

    if (!ws) { res.status(404).json({ data: null, error: 'Not found', meta: {} }); return; }

    // Team members
    const members = await db
      .select({
        id: workspaceMembers.id, role: workspaceMembers.role,
        email: homeowners.email,
        name: sql<string>`COALESCE(${homeowners.firstName} || ' ' || ${homeowners.lastName}, ${homeowners.email})`,
      })
      .from(workspaceMembers)
      .innerJoin(homeowners, eq(workspaceMembers.homeownerId, homeowners.id))
      .where(eq(workspaceMembers.workspaceId, id));

    // Properties
    const props = await db
      .select({ id: properties.id, name: properties.name, active: properties.active })
      .from(properties)
      .where(eq(properties.workspaceId, id));

    // Dispatch stats
    const [[{ value: totalDispatches }], [{ value: totalResponses }], [{ value: totalBookings }]] = await Promise.all([
      db.select({ value: count() }).from(jobs).where(eq(jobs.workspaceId, id)),
      db.select({ value: count() }).from(providerResponses)
        .innerJoin(jobs, eq(providerResponses.jobId, jobs.id))
        .where(eq(jobs.workspaceId, id)),
      db.select({ value: count() }).from(bookings)
        .innerJoin(jobs, eq(bookings.jobId, jobs.id))
        .where(eq(jobs.workspaceId, id)),
    ]);

    res.json({
      data: {
        workspace: ws,
        members,
        properties: props,
        stats: {
          total_dispatches: totalDispatches,
          total_responses: totalResponses,
          total_bookings: totalBookings,
        },
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /admin/business-accounts/:id]');
    res.status(500).json({ data: null, error: 'Failed to fetch details', meta: {} });
  }
});

// PATCH /api/v1/admin/business-accounts/:id — Update workspace (plan, credits)
router.patch('/business-accounts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as { plan?: string; searches_limit?: number; searches_used?: number; add_credits?: number };

  const updates: Record<string, unknown> = {};

  const validPlans = ['trial', 'starter', 'professional', 'business', 'enterprise'];
  if (body.plan && validPlans.includes(body.plan)) {
    updates.plan = body.plan;
    // Auto-set limits based on plan
    const planLimits: Record<string, number> = { trial: 5, starter: 2, professional: 3, business: 5, enterprise: 10 }; // per-property defaults
    updates.searchesLimit = planLimits[body.plan] ?? 10;
  }
  if (body.searches_limit != null) updates.searchesLimit = body.searches_limit;
  if (body.searches_used != null) updates.searchesUsed = body.searches_used;
  if (body.add_credits != null) {
    // Add bonus credits by increasing the limit
    const [ws] = await db.select({ searchesLimit: workspaces.searchesLimit }).from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (ws) updates.searchesLimit = ws.searchesLimit + body.add_credits;
  }

  updates.updatedAt = new Date();

  try {
    const [updated] = await db.update(workspaces).set(updates).where(eq(workspaces.id, id)).returning();
    if (!updated) { res.status(404).json({ data: null, error: 'Not found', meta: {} }); return; }
    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /admin/business-accounts/:id]');
    res.status(500).json({ data: null, error: 'Failed to update', meta: {} });
  }
});

// POST /api/v1/admin/jobs/:jobId/cancel — Force cancel a job
router.post('/jobs/:jobId/cancel', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  try {
    const [job] = await db.select({ id: jobs.id, status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) { res.status(404).json({ data: null, error: 'Job not found', meta: {} }); return; }
    if (job.status === 'expired' || job.status === 'refunded') {
      res.status(400).json({ data: null, error: `Job is already ${job.status}`, meta: {} }); return;
    }
    await db.update(jobs).set({ status: 'expired' } as Record<string, unknown>).where(eq(jobs.id, jobId));
    res.json({ data: { cancelled: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/jobs/:jobId/cancel]');
    res.status(500).json({ data: null, error: 'Failed to cancel job', meta: {} });
  }
});

// POST /api/v1/admin/jobs/:jobId/quotes — Manually add a provider quote
router.post('/jobs/:jobId/quotes', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const body = req.body as {
    provider_name?: string;
    provider_phone?: string;
    provider_email?: string;
    quoted_price?: string;
    availability?: string;
    message?: string;
  };

  if (!body.provider_name) {
    res.status(400).json({ data: null, error: 'provider_name is required', meta: {} });
    return;
  }

  try {
    // Check job exists
    const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) {
      res.status(404).json({ data: null, error: 'Job not found', meta: {} });
      return;
    }

    // Find or create provider
    let providerId: string;
    if (body.provider_phone || body.provider_email) {
      const conditions = [];
      if (body.provider_phone) conditions.push(eq(providers.phone, body.provider_phone));
      if (body.provider_email) conditions.push(eq(providers.email, body.provider_email.toLowerCase()));
      const [existing] = await db
        .select({ id: providers.id })
        .from(providers)
        .where(conditions.length > 1 ? or(...conditions) : conditions[0])
        .limit(1);

      if (existing) {
        providerId = existing.id;
      } else {
        const [newProvider] = await db
          .insert(providers)
          .values({
            name: body.provider_name.trim(),
            phone: body.provider_phone ?? null,
            email: body.provider_email?.toLowerCase() ?? null,
          })
          .returning();
        providerId = newProvider.id;
      }
    } else {
      // No phone or email — create new provider
      const [newProvider] = await db
        .insert(providers)
        .values({ name: body.provider_name.trim() })
        .returning();
      providerId = newProvider.id;
    }

    // Create the provider response
    const [response] = await db
      .insert(providerResponses)
      .values({
        jobId,
        providerId,
        channel: 'manual',
        quotedPrice: body.quoted_price ?? null,
        availability: body.availability ?? null,
        message: body.message ?? null,
      })
      .returning();

    // Update job status to collecting if still dispatching
    await db.update(jobs)
      .set({ status: 'collecting' } as Record<string, unknown>)
      .where(and(eq(jobs.id, jobId), eq(jobs.status, 'dispatching')));

    // Emit tracking event for quote received
    try {
      const { emitTrackingEvent } = await import('../services/orchestration');
      const provName = body.provider_name ?? 'A provider';
      const [provInfo] = await db.select({ googleRating: providers.googleRating }).from(providers).where(eq(providers.id, providerId)).limit(1);
      void emitTrackingEvent(jobId, 'provider_responded', 'Quote Received',
        `${provName} has responded.`,
        { provider_name: provName, ...(provInfo?.googleRating ? { rating: `${provInfo.googleRating} ★` } : {}) },
      );
    } catch { /* non-fatal */ }

    res.status(201).json({
      data: {
        id: response.id,
        providerId,
        providerName: body.provider_name,
        quotedPrice: body.quoted_price,
        availability: body.availability,
        message: body.message,
        channel: 'manual',
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /admin/jobs/:jobId/quotes]');
    res.status(500).json({ data: null, error: 'Failed to add quote', meta: {} });
  }
});

// GET /api/v1/admin/google-search?q=business+name&zip=92103
router.get('/google-search', async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  const zip = (req.query.zip as string || '').trim();

  if (!q || q.length < 2) {
    res.json({ data: [], error: null, meta: {} });
    return;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    res.json({ data: [], error: null, meta: {} });
    return;
  }

  try {
    const { geocodeZip } = await import('../services/providers/google-maps');
    const location = zip ? await geocodeZip(zip).catch(() => null) : null;
    const locationParam = location ? `&location=${location.lat},${location.lng}&radius=40234` : ''; // ~25 miles

    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}${locationParam}&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const data = await searchRes.json() as {
      status: string;
      results: Array<{ place_id: string; name: string; rating?: number; user_ratings_total?: number; formatted_address?: string; formatted_phone_number?: string }>;
    };

    if (data.status !== 'OK') {
      res.json({ data: [], error: null, meta: {} });
      return;
    }

    const results = data.results.slice(0, 8).map(r => ({
      placeId: r.place_id,
      name: r.name,
      rating: r.rating ?? 0,
      reviewCount: r.user_ratings_total ?? 0,
      address: r.formatted_address ?? '',
    }));

    res.json({ data: results, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /admin/google-search]');
    res.json({ data: [], error: null, meta: {} });
  }
});

// GET /api/v1/admin/google-place/:placeId — Fetch phone/website from Place Details
router.get('/google-place/:placeId', async (req: Request, res: Response) => {
  const { placeId } = req.params;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !placeId) {
    res.json({ data: null, error: null, meta: {} });
    return;
  }

  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=formatted_phone_number,website&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const data = await detailsRes.json() as {
      status: string;
      result?: { formatted_phone_number?: string; website?: string };
    };

    if (data.status !== 'OK' || !data.result) {
      res.json({ data: { phone: null, email: null, website: null }, error: null, meta: {} });
      return;
    }

    res.json({
      data: {
        phone: data.result.formatted_phone_number ?? null,
        website: data.result.website ?? null,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /admin/google-place]');
    res.json({ data: { phone: null, website: null }, error: null, meta: {} });
  }
});

export default router;
