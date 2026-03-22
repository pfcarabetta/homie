import { Router, Request, Response } from 'express';
import { count, desc, eq, sql } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners, jobs, bookings, providers, providerScores, outreachAttempts, providerResponses, suppressionList } from '../db/schema';
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

  try {
    const [[{ value: total }], rows] = await Promise.all([
      db.select({ value: count() }).from(homeowners),
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

// GET /api/v1/admin/jobs
router.get('/jobs', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const statusFilter = req.query.status as string | undefined;

  try {
    const where = statusFilter ? eq(jobs.status, statusFilter) : undefined;

    const [[{ value: total }], rows] = await Promise.all([
      db.select({ value: count() }).from(jobs).where(where),
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

  try {
    const [[{ value: total }], rows] = await Promise.all([
      db.select({ value: count() }).from(providers),
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

  try {
    const [[{ value: total }], rows] = await Promise.all([
      db.select({ value: count() }).from(bookings),
      db
        .select({
          id: bookings.id,
          jobId: bookings.jobId,
          providerName: providers.name,
          homeownerEmail: homeowners.email,
          status: bookings.status,
          confirmedAt: bookings.confirmedAt,
        })
        .from(bookings)
        .leftJoin(providers, eq(bookings.providerId, providers.id))
        .leftJoin(homeowners, eq(bookings.homeownerId, homeowners.id))
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

export default router;
