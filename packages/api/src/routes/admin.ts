import { Router, Request, Response } from 'express';
import { count, desc, eq, sql, or, ilike, and, gt, lt, isNull, isNotNull, gte, lte, inArray, notInArray } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners, jobs, bookings, providers, providerScores, outreachAttempts, providerResponses, suppressionList, workspaces, workspaceMembers, properties } from '../db/schema';
import { inspectionReports, inspectionSupportingDocuments, inspectionCrossReferenceInsights } from '../db/schema/inspector';
import { pricingConfig } from '../db/schema/pricing-config';
import { getPricingConfig, invalidatePricingCache, PricingConfig } from '../services/pricing';
import { generateCrossReferenceInsights } from '../services/cross-reference';
import { parseInspectionReportAsync } from './inspector';
import { parseSupportingDocAsync } from './account';
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
    const attemptRows = await db
      .select({
        id: outreachAttempts.id,
        channel: outreachAttempts.channel,
        status: outreachAttempts.status,
        providerName: providers.name,
        providerPhone: providers.phone,
        providerEmail: providers.email,
        providerGooglePlaceId: providers.googlePlaceId,
        providerYelpUrl: providers.yelpUrl,
        attemptedAt: outreachAttempts.attemptedAt,
        respondedAt: outreachAttempts.respondedAt,
        scriptUsed: outreachAttempts.scriptUsed,
        responseRaw: outreachAttempts.responseRaw,
      })
      .from(outreachAttempts)
      .leftJoin(providers, eq(outreachAttempts.providerId, providers.id))
      .where(eq(outreachAttempts.jobId, id))
      .orderBy(desc(outreachAttempts.attemptedAt));

    // Tag each attempt with its discovery source so the admin UI can render the right icon
    const attempts = attemptRows.map(a => ({
      ...a,
      providerSource: a.providerGooglePlaceId
        ? 'google' as const
        : a.providerYelpUrl
          ? 'yelp' as const
          : 'manual' as const,
    }));

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
          googleRating: providers.rating,
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
          googleRating: provider.rating,
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
          providerRating: providers.rating,
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
          jobSource: sql<string>`${jobs.diagnosis}->>'source'`,
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
    logger.info({ action: 'admin:cancel_booking', bookingId: updated.id }, 'Admin cancelled booking');
    res.json({ data: { id: updated.id, status: 'cancelled' }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/bookings/:id/cancel]');
    res.status(500).json({ data: null, error: 'Failed to cancel booking', meta: {} });
  }
});

// POST /api/v1/admin/providers/:providerId/send-magic-link
// Generate a fresh 30-day portal token and send it to the provider via SMS/email.
router.post('/providers/:providerId/send-magic-link', async (req: Request, res: Response) => {
  const { providerId } = req.params;
  try {
    const [provider] = await db
      .select({ id: providers.id, name: providers.name, phone: providers.phone, email: providers.email })
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);
    if (!provider) {
      res.status(404).json({ data: null, error: 'Provider not found', meta: {} });
      return;
    }

    const { signProviderToken } = await import('../middleware/provider-auth');
    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const token = signProviderToken(provider.id);
    const link = `${APP_URL}/portal/login?token=${token}`;

    const { sendSms, sendEmail } = await import('../services/notifications');
    const sentVia: string[] = [];

    if (provider.phone) {
      try {
        await sendSms(provider.phone, `Hey ${provider.name}! Here's a fresh link to your Homie Pro portal: ${link}`);
        sentVia.push('sms');
      } catch (err) { logger.warn({ err, providerId }, '[admin] send-magic-link: SMS failed'); }
    }

    if (provider.email) {
      try {
        await sendEmail(
          provider.email,
          'Your Homie Pro portal link',
          `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h1 style="color:#E8632B;font-size:24px;font-family:Georgia,serif">homie</h1>
            <p style="color:#2D2926;font-size:16px">Hey ${provider.name}!</p>
            <p style="color:#6B6560;font-size:15px;line-height:1.6">Here's a fresh link to your Homie Pro portal:</p>
            <p><a href="${link}" style="display:inline-block;background:#E8632B;color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px;margin-top:16px">Open Portal</a></p>
            <p style="color:#9B9490;font-size:12px;margin-top:24px">This link is valid for 30 days.</p>
          </div>`,
        );
        sentVia.push('email');
      } catch (err) { logger.warn({ err, providerId }, '[admin] send-magic-link: email failed'); }
    }

    if (sentVia.length === 0) {
      res.status(400).json({ data: null, error: 'Provider has no phone or email on file', meta: {} });
      return;
    }

    logger.info({ action: 'admin:send_magic_link', providerId, sentVia }, 'Admin sent portal link to provider');
    res.json({ data: { sent: true, sentVia, link }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/providers/:providerId/send-magic-link]');
    res.status(500).json({ data: null, error: 'Failed to send portal link', meta: {} });
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

    logger.info({ action: 'admin:create_business_account', workspaceId: workspace.id, ownerEmail: user.email, plan: selectedPlan }, 'Admin created business account');
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
        customPricing: workspaces.customPricing,
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

// PATCH /api/v1/admin/business-accounts/:id — Update workspace (plan, credits, custom pricing)
router.patch('/business-accounts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as {
    plan?: string;
    searches_limit?: number;
    searches_used?: number;
    add_credits?: number;
    custom_pricing?: Record<string, unknown> | null;
  };

  const updates: Record<string, unknown> = {};

  const validPlans = ['trial', 'starter', 'professional', 'business', 'enterprise'];
  if (body.plan && validPlans.includes(body.plan)) {
    updates.plan = body.plan;
    const planLimits: Record<string, number> = { trial: 5, starter: 2, professional: 3, business: 5, enterprise: 10 };
    updates.searchesLimit = planLimits[body.plan] ?? 10;
  }
  if (body.searches_limit != null) updates.searchesLimit = body.searches_limit;
  if (body.searches_used != null) updates.searchesUsed = body.searches_used;
  if (body.add_credits != null) {
    const [ws] = await db.select({ searchesLimit: workspaces.searchesLimit }).from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (ws) updates.searchesLimit = ws.searchesLimit + body.add_credits;
  }
  // Custom pricing: pass null to clear, or an object to set/update
  if (body.custom_pricing !== undefined) {
    updates.customPricing = body.custom_pricing;
  }

  updates.updatedAt = new Date();

  try {
    const [updated] = await db.update(workspaces).set(updates).where(eq(workspaces.id, id)).returning();
    if (!updated) { res.status(404).json({ data: null, error: 'Not found', meta: {} }); return; }
    logger.info({ action: 'admin:update_business_account', workspaceId: id, updates: Object.keys(updates).filter(k => k !== 'updatedAt') }, 'Admin updated business account');
    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /admin/business-accounts/:id]');
    res.status(500).json({ data: null, error: 'Failed to update', meta: {} });
  }
});

// POST /api/v1/admin/jobs/:jobIdOrPrefix/repair — Reparse provider quote text
// and reset a stuck "completed" status if no booking actually exists.
//
// Accepts either a full job UUID or any unique prefix (e.g. "6d4cba32"). Useful
// for fixing jobs whose quote was poorly parsed (e.g. "$70/hr 3 hour minimum"
// stored as just "$70") or whose status was set to "completed" without a real
// booking row. Returns the changes that were applied.
router.post('/jobs/:jobIdOrPrefix/repair', async (req: Request, res: Response) => {
  const { jobIdOrPrefix } = req.params;
  if (!jobIdOrPrefix || jobIdOrPrefix.length < 4) {
    res.status(400).json({ data: null, error: 'jobIdOrPrefix must be at least 4 characters', meta: {} });
    return;
  }

  try {
    // Find matching job(s) by prefix
    const matches = await db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(sql`${jobs.id}::text LIKE ${jobIdOrPrefix + '%'}`)
      .limit(5);

    if (matches.length === 0) {
      res.status(404).json({ data: null, error: 'No job found matching that ID/prefix', meta: {} });
      return;
    }
    if (matches.length > 1) {
      res.status(400).json({
        data: null,
        error: `Ambiguous prefix — matches ${matches.length} jobs. Provide more characters.`,
        meta: { matches: matches.map(m => m.id) },
      });
      return;
    }

    const job = matches[0];
    const changes: Record<string, unknown> = { jobId: job.id };

    // 1. Reparse provider responses on this job
    const responses = await db
      .select()
      .from(providerResponses)
      .where(eq(providerResponses.jobId, job.id));

    const { formatQuotedPrice } = await import('../services/quote-parser');
    const reparsed: Array<{ id: string; before: string | null; after: string | null }> = [];
    for (const r of responses) {
      // Reparse from message text (richer than the stored quotedPrice) if available
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
    changes.reparsedQuotes = reparsed;

    // 2. If status is 'completed' but no ACTIVE booking exists, revert to
    // 'expired'. Cancelled bookings don't count — the job should be re-bookable.
    if (job.status === 'completed') {
      const [booking] = await db
        .select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(and(eq(bookings.jobId, job.id), sql`${bookings.status} <> 'cancelled'`))
        .limit(1);
      if (!booking) {
        await db.update(jobs).set({ status: 'expired' } as Record<string, unknown>).where(eq(jobs.id, job.id));
        changes.statusRevertedFrom = 'completed';
        changes.statusRevertedTo = 'expired';
        logger.info({ jobId: job.id }, '[admin] Reverted phantom completed status to expired (no active booking row)');
      } else {
        changes.statusUnchanged = `completed has ${booking.status} booking row`;
      }
    }

    res.json({ data: changes, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/jobs/:jobIdOrPrefix/repair]');
    res.status(500).json({ data: null, error: 'Failed to repair job', meta: {} });
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
    logger.info({ action: 'admin:cancel_job', jobId, previousStatus: job.status }, 'Admin cancelled job');
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
      const [provInfo] = await db.select({ rating: providers.rating }).from(providers).where(eq(providers.id, providerId)).limit(1);
      void emitTrackingEvent(jobId, 'provider_responded', 'Quote Received',
        `${provName} has responded.`,
        { provider_name: provName, ...(provInfo?.rating ? { rating: `${provInfo.rating} ★` } : {}) },
      );
    } catch (err) { logger.warn({ err, jobId }, '[admin] Failed to emit tracking event for quote received'); }

    logger.info({ action: 'admin:add_quote', jobId, providerId, providerName: body.provider_name, responseId: response.id }, 'Admin added manual quote');
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
    const location = zip ? await geocodeZip(zip).catch((err) => { logger.warn({ err, zip }, '[admin] Failed to geocode zip'); return null; }) : null;
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

// GET /api/v1/admin/pricing
router.get('/pricing', async (_req: Request, res: Response) => {
  try {
    const config = await getPricingConfig();
    res.json({ data: config, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /admin/pricing]');
    res.status(500).json({ data: null, error: 'Failed to fetch pricing', meta: {} });
  }
});

// PATCH /api/v1/admin/pricing
router.patch('/pricing', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<PricingConfig>;
    const current = await getPricingConfig();
    const merged: PricingConfig = {
      homeowner: updates.homeowner
        ? { ...current.homeowner, ...updates.homeowner }
        : current.homeowner,
      business: updates.business
        ? { ...current.business, ...updates.business }
        : current.business,
    };

    await db
      .insert(pricingConfig)
      .values({ id: 'singleton', config: merged as unknown as Record<string, unknown>, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: pricingConfig.id,
        set: { config: merged as unknown as Record<string, unknown>, updatedAt: new Date() },
      });

    invalidatePricingCache();

    logger.info({ action: 'admin:update_pricing' }, 'Admin updated pricing config');
    res.json({ data: merged, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /admin/pricing]');
    res.status(500).json({ data: null, error: 'Failed to update pricing', meta: {} });
  }
});

// ── Revenue Dashboard ──────────────────────────────────────────────────────

import Stripe from 'stripe';
import type { HomieProduct } from '../services/stripe';

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

interface PeriodRange {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  bucketResolution: 'hour' | 'day' | 'month';
  label: string;
  previousLabel: string;
}

function getPeriodRange(period: Period): PeriodRange {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case 'today': {
      const start = startOfToday;
      const end = now;
      const prevEnd = start;
      const prevStart = new Date(prevEnd.getTime() - 24 * 60 * 60 * 1000);
      return { start, end, previousStart: prevStart, previousEnd: prevEnd, bucketResolution: 'hour', label: 'Today', previousLabel: 'Yesterday' };
    }
    case 'week': {
      const start = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
      const end = now;
      const prevEnd = start;
      const prevStart = new Date(prevEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end, previousStart: prevStart, previousEnd: prevEnd, bucketResolution: 'day', label: 'Last 7 days', previousLabel: 'Previous 7 days' };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = now;
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevEnd = start;
      return { start, end, previousStart: prevStart, previousEnd: prevEnd, bucketResolution: 'day', label: 'This month', previousLabel: 'Last month' };
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = now;
      const prevStart = new Date(now.getFullYear() - 1, 0, 1);
      const prevEnd = start;
      return { start, end, previousStart: prevStart, previousEnd: prevEnd, bucketResolution: 'month', label: 'This year', previousLabel: 'Last year' };
    }
    case 'all':
    default: {
      const start = new Date(2024, 0, 1); // Homie launch cutoff
      const end = now;
      // No previous period — compare against zero
      return { start, end, previousStart: start, previousEnd: start, bucketResolution: 'month', label: 'All time', previousLabel: '' };
    }
  }
}

/**
 * Classify a Stripe charge/payment by product using canonical metadata
 * with a legacy fallback for pre-canonical transactions.
 */
function resolveProduct(md: Stripe.Metadata | null | undefined): HomieProduct | 'unknown' {
  const m = md ?? {};
  if (m.product === 'homie_quote' || m.product === 'inspect_report' || m.product === 'workspace_subscription') {
    return m.product;
  }
  if (m.type === 'inspect_report_tier' || m.type === 'inspect_client_dispatch') return 'inspect_report';
  if (m.workspace_id && m.plan) return 'workspace_subscription';
  if (m.report_id) return 'inspect_report';
  if (m.job_id) return 'homie_quote';
  return 'unknown';
}

/** Iterate ALL Stripe charges in a date range via auto-pagination. */
async function fetchAllCharges(stripe: Stripe, startSec: number, endSec: number): Promise<Stripe.Charge[]> {
  const out: Stripe.Charge[] = [];
  for await (const charge of stripe.charges.list({ created: { gte: startSec, lte: endSec }, limit: 100 })) {
    if (charge.status === 'succeeded') out.push(charge);
  }
  return out;
}

function bucketKey(timestampSec: number, resolution: 'hour' | 'day' | 'month'): string {
  const d = new Date(timestampSec * 1000);
  if (resolution === 'hour') return `${d.getHours()}`;
  if (resolution === 'day') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bucketLabel(key: string, resolution: 'hour' | 'day' | 'month'): string {
  if (resolution === 'hour') {
    const h = parseInt(key, 10);
    const suffix = h < 12 ? 'a' : 'p';
    const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${disp}${suffix}`;
  }
  if (resolution === 'day') {
    const [, m, d] = key.split('-');
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  }
  const [, m] = key.split('-');
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10) - 1];
}

// GET /api/v1/admin/revenue?period=today|week|month|year|all
router.get('/revenue', async (req: Request, res: Response) => {
  const periodParam = (req.query.period ?? 'month') as Period;
  if (!['today', 'week', 'month', 'year', 'all'].includes(periodParam)) {
    res.status(400).json({ data: null, error: 'Invalid period', meta: {} });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    res.status(500).json({ data: null, error: 'Stripe not configured', meta: {} });
    return;
  }

  try {
    const range = getPeriodRange(periodParam);
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion });

    const [currentCharges, previousCharges] = await Promise.all([
      fetchAllCharges(stripe, Math.floor(range.start.getTime() / 1000), Math.floor(range.end.getTime() / 1000)),
      periodParam === 'all'
        ? Promise.resolve([] as Stripe.Charge[])
        : fetchAllCharges(stripe, Math.floor(range.previousStart.getTime() / 1000), Math.floor(range.previousEnd.getTime() / 1000)),
    ]);

    // ── Aggregate current period ──────────────────────────────────────────
    type ProductAgg = { grossCents: number; transactionCount: number };
    const byProduct: Record<string, ProductAgg> = {
      homie_quote: { grossCents: 0, transactionCount: 0 },
      inspect_report: { grossCents: 0, transactionCount: 0 },
      workspace_subscription: { grossCents: 0, transactionCount: 0 },
      unknown: { grossCents: 0, transactionCount: 0 },
    };
    const bucketMap = new Map<string, { homieCents: number; inspectCents: number; businessCents: number; unknownCents: number }>();
    const customersSeen = new Set<string>();
    let totalGross = 0;
    for (const c of currentCharges) {
      const product = resolveProduct(c.metadata);
      const net = c.amount - (c.amount_refunded ?? 0);
      if (net <= 0) continue;
      byProduct[product].grossCents += net;
      byProduct[product].transactionCount += 1;
      totalGross += net;
      if (c.customer) customersSeen.add(typeof c.customer === 'string' ? c.customer : c.customer.id);

      const key = bucketKey(c.created, range.bucketResolution);
      const b = bucketMap.get(key) ?? { homieCents: 0, inspectCents: 0, businessCents: 0, unknownCents: 0 };
      if (product === 'homie_quote') b.homieCents += net;
      else if (product === 'inspect_report') b.inspectCents += net;
      else if (product === 'workspace_subscription') b.businessCents += net;
      else b.unknownCents += net;
      bucketMap.set(key, b);
    }

    // ── New paying customers: first successful charge inside the period ──
    // Query all-time charges for these customers to see if their first charge
    // is within this period.
    let newPayingCustomers = 0;
    if (customersSeen.size > 0) {
      // Lightweight approach: for each customer, check if their EARLIEST
      // charge is within the current period. Done one-by-one; fine for
      // admin dashboard scale (dozens/hundreds of unique customers).
      for (const customerId of customersSeen) {
        try {
          const list = await stripe.charges.list({ customer: customerId, limit: 100 });
          const earliestSucceeded = list.data
            .filter(c => c.status === 'succeeded')
            .reduce<Stripe.Charge | null>((acc, c) => (acc === null || c.created < acc.created ? c : acc), null);
          if (earliestSucceeded && earliestSucceeded.created >= Math.floor(range.start.getTime() / 1000)) {
            newPayingCustomers += 1;
          }
        } catch { /* ignore per-customer errors */ }
      }
    }

    // ── Aggregate previous period for % delta ────────────────────────────
    let prevGross = 0;
    let prevCount = 0;
    for (const c of previousCharges) {
      const net = c.amount - (c.amount_refunded ?? 0);
      if (net <= 0) continue;
      prevGross += net;
      prevCount += 1;
    }

    // ── Build sorted timeseries ──────────────────────────────────────────
    const timeseries = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ label: bucketLabel(key, range.bucketResolution), ...v }));

    const transactionCount = currentCharges.filter(c => (c.amount - (c.amount_refunded ?? 0)) > 0).length;
    const avgTransactionCents = transactionCount > 0 ? Math.round(totalGross / transactionCount) : 0;

    res.json({
      data: {
        period: periodParam,
        periodLabel: range.label,
        previousPeriodLabel: range.previousLabel,
        totals: {
          grossCents: totalGross,
          transactionCount,
          avgTransactionCents,
          newPayingCustomers,
        },
        previousTotals: {
          grossCents: prevGross,
          transactionCount: prevCount,
        },
        byProduct,
        timeseries,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /admin/revenue]');
    res.status(500).json({ data: null, error: 'Failed to load revenue data', meta: {} });
  }
});

// ── Inspect Admin ──────────────────────────────────────────────────────────

// GET /api/v1/admin/inspect/stats?period=today|week|month|year|all
router.get('/inspect/stats', async (req: Request, res: Response) => {
  const periodParam = (req.query.period ?? 'month') as Period;
  if (!['today', 'week', 'month', 'year', 'all'].includes(periodParam)) {
    res.status(400).json({ data: null, error: 'Invalid period', meta: {} });
    return;
  }

  try {
    const range = getPeriodRange(periodParam);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const inPeriod = and(
      gte(inspectionReports.createdAt, range.start),
      lte(inspectionReports.createdAt, range.end),
    );

    const terminalStatuses = ['parsed', 'review_pending', 'sent_to_client'];

    // All in one go
    const [
      [{ v: uploaded }],
      [{ v: parsed }],
      [{ v: paid }],
      [{ v: failed }],
      [{ v: currentlyFailed }],
      avgItems,
      [{ v: supportingDocs }],
      [{ v: activeReports }],
    ] = await Promise.all([
      db.select({ v: count() }).from(inspectionReports).where(inPeriod),
      db.select({ v: count() }).from(inspectionReports).where(and(inPeriod, inArray(inspectionReports.parsingStatus, terminalStatuses))),
      db.select({ v: count() }).from(inspectionReports).where(and(inPeriod, isNotNull(inspectionReports.pricingTier))),
      db.select({ v: count() }).from(inspectionReports).where(and(inPeriod, eq(inspectionReports.parsingStatus, 'failed'))),
      db.select({ v: count() }).from(inspectionReports).where(eq(inspectionReports.parsingStatus, 'failed')),
      db.select({ v: sql<number>`COALESCE(AVG(${inspectionReports.itemsParsed}), 0)::float` })
        .from(inspectionReports)
        .where(and(inPeriod, inArray(inspectionReports.parsingStatus, terminalStatuses))),
      db.select({ v: count() })
        .from(inspectionSupportingDocuments)
        .where(and(
          gte(inspectionSupportingDocuments.createdAt, range.start),
          lte(inspectionSupportingDocuments.createdAt, range.end),
        )),
      db.select({ v: count() })
        .from(inspectionReports)
        .where(and(
          gt(inspectionReports.expiresAt, now),
          gte(inspectionReports.clientFirstActionAt, sevenDaysAgo),
        )),
    ]);

    const parseSuccessRate = uploaded > 0 ? parsed / uploaded : 0;
    const paidConversionRate = uploaded > 0 ? paid / uploaded : 0;
    const parseFailureRate = uploaded > 0 ? failed / uploaded : 0;

    res.json({
      data: {
        period: periodParam,
        periodLabel: range.label,
        reportsUploaded: uploaded,
        reportsParsed: parsed,
        parseSuccessRate,
        paidReports: paid,
        paidConversionRate,
        avgItemsPerReport: Number(avgItems[0]?.v ?? 0),
        parseFailureCount: failed,
        parseFailureRate,
        currentlyFailedTotal: currentlyFailed,
        supportingDocsUploaded: supportingDocs,
        activeReports,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /admin/inspect/stats]');
    res.status(500).json({ data: null, error: 'Failed to load inspect stats', meta: {} });
  }
});

// GET /api/v1/admin/inspect/diagnostics
router.get('/inspect/diagnostics', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const baseCols = {
      id: inspectionReports.id,
      propertyAddress: inspectionReports.propertyAddress,
      clientEmail: inspectionReports.clientEmail,
      clientName: inspectionReports.clientName,
      parsingStatus: inspectionReports.parsingStatus,
      parsingError: inspectionReports.parsingError,
      pricingTier: inspectionReports.pricingTier,
      itemsParsed: inspectionReports.itemsParsed,
      createdAt: inspectionReports.createdAt,
      expiresAt: inspectionReports.expiresAt,
    };

    const [stuck, failures, expiringSoon, zeroItems, allReportsWithDocs, insightRows] = await Promise.all([
      // Stuck: processing/uploading for >10min
      db.select(baseCols).from(inspectionReports)
        .where(and(
          inArray(inspectionReports.parsingStatus, ['uploading', 'processing']),
          lt(inspectionReports.createdAt, tenMinAgo),
        ))
        .orderBy(desc(inspectionReports.createdAt))
        .limit(50),
      // Recent failures (last 7 days)
      db.select(baseCols).from(inspectionReports)
        .where(and(
          eq(inspectionReports.parsingStatus, 'failed'),
          gte(inspectionReports.createdAt, sevenDaysAgo),
        ))
        .orderBy(desc(inspectionReports.createdAt))
        .limit(50),
      // Paid reports expiring in next 7 days
      db.select(baseCols).from(inspectionReports)
        .where(and(
          isNotNull(inspectionReports.pricingTier),
          gt(inspectionReports.expiresAt, now),
          lt(inspectionReports.expiresAt, sevenDaysFromNow),
        ))
        .orderBy(inspectionReports.expiresAt)
        .limit(50),
      // Zero-item parsed reports (last 14 days)
      db.select(baseCols).from(inspectionReports)
        .where(and(
          inArray(inspectionReports.parsingStatus, ['parsed', 'review_pending', 'sent_to_client']),
          eq(inspectionReports.itemsParsed, 0),
          gte(inspectionReports.createdAt, fourteenDaysAgo),
        ))
        .orderBy(desc(inspectionReports.createdAt))
        .limit(50),
      // Reports that have >=1 supporting doc
      db.selectDistinct({ reportId: inspectionSupportingDocuments.reportId })
        .from(inspectionSupportingDocuments)
        .where(eq(inspectionSupportingDocuments.parsingStatus, 'parsed')),
      // All insight rows (just ids)
      db.select({ reportId: inspectionCrossReferenceInsights.reportId })
        .from(inspectionCrossReferenceInsights),
    ]);

    // Compute "has docs but no insights" via set diff
    const withInsights = new Set(insightRows.map(r => r.reportId));
    const missingInsightReportIds = allReportsWithDocs
      .map(r => r.reportId)
      .filter(id => !withInsights.has(id));

    const missingInsights = missingInsightReportIds.length > 0
      ? await db.select(baseCols).from(inspectionReports)
          .where(inArray(inspectionReports.id, missingInsightReportIds))
          .orderBy(desc(inspectionReports.createdAt))
          .limit(50)
      : [];

    res.json({
      data: {
        stuckParsing: stuck,
        recentFailures: failures,
        missingInsights,
        expiringSoon,
        zeroItemReports: zeroItems,
      },
      error: null,
      meta: {
        counts: {
          stuckParsing: stuck.length,
          recentFailures: failures.length,
          missingInsights: missingInsights.length,
          expiringSoon: expiringSoon.length,
          zeroItemReports: zeroItems.length,
        },
      },
    });
  } catch (err) {
    logger.error({ err }, '[GET /admin/inspect/diagnostics]');
    res.status(500).json({ data: null, error: 'Failed to load diagnostics', meta: {} });
  }
});

// POST /api/v1/admin/inspect/reports/:id/retry-parse
router.post('/inspect/reports/:id/retry-parse', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.id, req.params.id)).limit(1);
    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    if (!report.reportFileUrl) {
      res.status(400).json({ data: null, error: 'Report has no file URL to re-parse', meta: {} });
      return;
    }

    // Reset to processing and kick off async parse
    await db.update(inspectionReports)
      .set({ parsingStatus: 'processing', parsingError: null, updatedAt: new Date() })
      .where(eq(inspectionReports.id, req.params.id));

    void parseInspectionReportAsync(req.params.id).catch(err =>
      logger.error({ err, reportId: req.params.id }, '[admin] retry-parse failed'),
    );

    logger.info({ action: 'admin:retry_parse', reportId: req.params.id }, 'Admin retried inspection parse');
    res.json({ data: { queued: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/inspect/reports/:id/retry-parse]');
    res.status(500).json({ data: null, error: 'Failed to queue retry', meta: {} });
  }
});

// POST /api/v1/admin/inspect/reports/:id/retry-doc-parse — retry a specific supporting doc
router.post('/inspect/documents/:docId/retry-parse', async (req: Request, res: Response) => {
  try {
    const [doc] = await db.select().from(inspectionSupportingDocuments)
      .where(eq(inspectionSupportingDocuments.id, req.params.docId)).limit(1);
    if (!doc) {
      res.status(404).json({ data: null, error: 'Document not found', meta: {} });
      return;
    }

    await db.update(inspectionSupportingDocuments)
      .set({ parsingStatus: 'processing', parsingError: null, updatedAt: new Date() })
      .where(eq(inspectionSupportingDocuments.id, req.params.docId));

    void parseSupportingDocAsync(req.params.docId).catch(err =>
      logger.error({ err, docId: req.params.docId }, '[admin] doc retry-parse failed'),
    );

    logger.info({ action: 'admin:retry_doc_parse', docId: req.params.docId }, 'Admin retried doc parse');
    res.json({ data: { queued: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/inspect/documents/:docId/retry-parse]');
    res.status(500).json({ data: null, error: 'Failed to queue doc retry', meta: {} });
  }
});

// POST /api/v1/admin/inspect/reports/:id/regenerate-insights
router.post('/inspect/reports/:id/regenerate-insights', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.id, req.params.id)).limit(1);
    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    // Fire-and-forget — the helper upserts into inspectionCrossReferenceInsights
    void generateCrossReferenceInsights(req.params.id).catch(err =>
      logger.error({ err, reportId: req.params.id }, '[admin] regenerate-insights failed'),
    );

    logger.info({ action: 'admin:regen_insights', reportId: req.params.id }, 'Admin regenerated cross-ref insights');
    res.json({ data: { queued: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/inspect/reports/:id/regenerate-insights]');
    res.status(500).json({ data: null, error: 'Failed to queue regeneration', meta: {} });
  }
});

// POST /api/v1/admin/inspect/reports/:id/extend — extend expiresAt by N days (default 90)
router.post('/inspect/reports/:id/extend', async (req: Request, res: Response) => {
  const days = Math.max(1, Math.min(365, Number(req.body?.days) || 90));

  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.id, req.params.id)).limit(1);
    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    const now = new Date();
    const base = report.expiresAt > now ? report.expiresAt : now;
    const newExpiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    await db.update(inspectionReports)
      .set({ expiresAt: newExpiresAt, updatedAt: new Date() })
      .where(eq(inspectionReports.id, req.params.id));

    logger.info({ action: 'admin:extend_report', reportId: req.params.id, days }, 'Admin extended report expiration');
    res.json({ data: { expiresAt: newExpiresAt.toISOString() }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /admin/inspect/reports/:id/extend]');
    res.status(500).json({ data: null, error: 'Failed to extend expiration', meta: {} });
  }
});

export default router;
