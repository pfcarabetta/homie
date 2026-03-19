import { Router, Request, Response } from 'express';
import { count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { homeowners, jobs, bookings, providers, providerScores, outreachAttempts } from '../db/schema';
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
    console.error('[GET /admin/stats]', err);
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
    console.error('[GET /admin/homeowners]', err);
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
    console.error('[GET /admin/jobs]', err);
    res.status(500).json({ data: null, error: 'Failed to fetch jobs', meta: {} });
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
    console.error('[GET /admin/providers]', err);
    res.status(500).json({ data: null, error: 'Failed to fetch providers', meta: {} });
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
    console.error('[GET /admin/bookings]', err);
    res.status(500).json({ data: null, error: 'Failed to fetch bookings', meta: {} });
  }
});

export default router;
