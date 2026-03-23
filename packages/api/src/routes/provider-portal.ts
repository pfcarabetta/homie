import { Router, Request, Response } from 'express';
import { eq, and, desc, count, inArray } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { providers } from '../db/schema/providers';
import { providerScores } from '../db/schema/provider-scores';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { providerResponses } from '../db/schema/provider-responses';
import { jobs } from '../db/schema/jobs';
import { bookings } from '../db/schema/bookings';
import { homeowners } from '../db/schema/homeowners';
import { suppressionList } from '../db/schema/suppression-list';
import { recordProviderResponse } from '../services/providers/scores';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/v1/portal/dashboard
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const pid = req.providerId;

    const [[{ value: totalReceived }], [{ value: activeCount }], [{ value: completedCount }], scores] = await Promise.all([
      db.select({ value: count() }).from(outreachAttempts).where(eq(outreachAttempts.providerId, pid)),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.providerId, pid), eq(bookings.status, 'confirmed'))),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.providerId, pid), eq(bookings.status, 'completed'))),
      db.select().from(providerScores).where(eq(providerScores.providerId, pid)).limit(1),
    ]);

    const score = scores[0];
    const acceptanceRate = score?.acceptanceRate ? Number(score.acceptanceRate) : 0;
    const avgRating = score?.avgHomeownerRating ? Number(score.avgHomeownerRating) : 0;
    const avgResponseSec = score?.avgResponseSec ? Number(score.avgResponseSec) : 0;
    const completionRate = score?.completionRate ? Number(score.completionRate) : 0;
    const totalAccepted = score?.totalAccepted ?? 0;

    const badges: string[] = [];
    if (avgRating >= 4.8) badges.push('top-rated');
    if (avgResponseSec > 0 && avgResponseSec < 300) badges.push('fast-responder');
    if (completionRate >= 0.95 && totalAccepted >= 5) badges.push('reliable');
    if (totalAccepted >= 50) badges.push('veteran');

    res.json({
      data: {
        jobs_received: totalReceived,
        acceptance_rate: Math.round(acceptanceRate * 100),
        avg_rating: Math.round(avgRating * 10) / 10,
        active_count: activeCount,
        completed_count: completedCount,
        badges,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /portal/dashboard]');
    res.status(500).json({ data: null, error: 'Failed to fetch dashboard', meta: {} });
  }
});

// GET /api/v1/portal/jobs/incoming
router.get('/jobs/incoming', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ attempt: outreachAttempts, job: jobs })
      .from(outreachAttempts)
      .innerJoin(jobs, eq(outreachAttempts.jobId, jobs.id))
      .where(and(eq(outreachAttempts.providerId, req.providerId), eq(outreachAttempts.status, 'pending')))
      .orderBy(desc(outreachAttempts.attemptedAt));

    res.json({
      data: {
        jobs: rows.map(({ attempt, job }) => ({
          attempt_id: attempt.id,
          job_id: job.id,
          channel: attempt.channel,
          attempted_at: attempt.attemptedAt.toISOString(),
          diagnosis: job.diagnosis,
          zip_code: job.zipCode,
          timing: job.preferredTiming,
          budget: job.budget,
          tier: job.tier,
          expires_at: job.expiresAt?.toISOString() ?? null,
        })),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /portal/jobs/incoming]');
    res.status(500).json({ data: null, error: 'Failed to fetch incoming jobs', meta: {} });
  }
});

// POST /api/v1/portal/jobs/:attemptId/respond
router.post('/jobs/:attemptId/respond', async (req: Request, res: Response) => {
  const { attemptId } = req.params;
  if (!UUID_RE.test(attemptId)) {
    res.status(400).json({ data: null, error: 'Invalid attempt ID', meta: {} });
    return;
  }

  const { action, quoted_price, availability, message } = req.body as {
    action?: 'accept' | 'decline';
    quoted_price?: string;
    availability?: string;
    message?: string;
  };

  if (!action || !['accept', 'decline'].includes(action)) {
    res.status(400).json({ data: null, error: 'action must be accept or decline', meta: {} });
    return;
  }

  try {
    const [attempt] = await db
      .select()
      .from(outreachAttempts)
      .where(and(eq(outreachAttempts.id, attemptId), eq(outreachAttempts.providerId, req.providerId)))
      .limit(1);

    if (!attempt) {
      res.status(404).json({ data: null, error: 'Attempt not found', meta: {} });
      return;
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    await db.update(outreachAttempts).set({
      status: newStatus,
      respondedAt: new Date(),
    }).where(eq(outreachAttempts.id, attemptId));

    if (action === 'accept') {
      // Get provider info for the response
      const [provider] = await db
        .select({ googleRating: providers.googleRating })
        .from(providers)
        .where(eq(providers.id, req.providerId))
        .limit(1);

      await db.insert(providerResponses).values({
        jobId: attempt.jobId,
        providerId: req.providerId,
        channel: attempt.channel,
        quotedPrice: quoted_price ?? null,
        availability: availability ?? null,
        message: message ?? null,
        ratingAtTime: provider?.googleRating ?? null,
      });
    }

    const responseTimeSec = (Date.now() - attempt.attemptedAt.getTime()) / 1000;
    void recordProviderResponse(req.providerId, responseTimeSec);

    res.json({ data: { status: newStatus }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /portal/jobs/:attemptId/respond]');
    res.status(500).json({ data: null, error: 'Failed to respond', meta: {} });
  }
});

// GET /api/v1/portal/jobs/history
router.get('/jobs/history', async (req: Request, res: Response) => {
  const statusFilter = req.query.status as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  try {
    const conditions = [eq(outreachAttempts.providerId, req.providerId)];
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(outreachAttempts.status, statusFilter));
    } else {
      conditions.push(inArray(outreachAttempts.status, ['accepted', 'declined', 'responded']));
    }

    const rows = await db
      .select({ attempt: outreachAttempts, job: jobs })
      .from(outreachAttempts)
      .innerJoin(jobs, eq(outreachAttempts.jobId, jobs.id))
      .where(and(...conditions))
      .orderBy(desc(outreachAttempts.attemptedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      data: {
        jobs: rows.map(({ attempt, job }) => ({
          attempt_id: attempt.id,
          job_id: job.id,
          channel: attempt.channel,
          status: attempt.status,
          attempted_at: attempt.attemptedAt.toISOString(),
          responded_at: attempt.respondedAt?.toISOString() ?? null,
          diagnosis: job.diagnosis,
          zip_code: job.zipCode,
          tier: job.tier,
        })),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /portal/jobs/history]');
    res.status(500).json({ data: null, error: 'Failed to fetch history', meta: {} });
  }
});

// GET /api/v1/portal/profile
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const [provider] = await db.select().from(providers).where(eq(providers.id, req.providerId)).limit(1);
    if (!provider) {
      res.status(404).json({ data: null, error: 'Provider not found', meta: {} });
      return;
    }

    res.json({
      data: {
        id: provider.id,
        name: provider.name,
        phone: provider.phone,
        email: provider.email,
        categories: provider.categories,
        service_zips: provider.serviceZips,
        license_info: provider.licenseInfo,
        business_hours: provider.businessHours,
        google_rating: provider.googleRating,
        review_count: provider.reviewCount,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /portal/profile]');
    res.status(500).json({ data: null, error: 'Failed to fetch profile', meta: {} });
  }
});

// PATCH /api/v1/portal/profile
router.patch('/profile', async (req: Request, res: Response) => {
  const body = req.body as {
    name?: string;
    phone?: string;
    email?: string;
    categories?: string[];
    service_zips?: string[];
    license_info?: Record<string, unknown>;
    business_hours?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.email !== undefined) updates.email = body.email;
  if (body.categories !== undefined) updates.categories = body.categories;
  if (body.service_zips !== undefined) updates.serviceZips = body.service_zips;
  if (body.license_info !== undefined) updates.licenseInfo = body.license_info;
  if (body.business_hours !== undefined) updates.businessHours = body.business_hours;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ data: null, error: 'No fields to update', meta: {} });
    return;
  }

  try {
    const [updated] = await db.update(providers).set(updates).where(eq(providers.id, req.providerId)).returning();
    res.json({
      data: {
        id: updated.id, name: updated.name, phone: updated.phone, email: updated.email,
        categories: updated.categories, service_zips: updated.serviceZips,
        license_info: updated.licenseInfo, business_hours: updated.businessHours,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[PATCH /portal/profile]');
    res.status(500).json({ data: null, error: 'Failed to update profile', meta: {} });
  }
});

// GET /api/v1/portal/settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const [provider] = await db
      .select({ notificationPref: providers.notificationPref, vacationMode: providers.vacationMode })
      .from(providers)
      .where(eq(providers.id, req.providerId))
      .limit(1);

    res.json({ data: provider, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /portal/settings]');
    res.status(500).json({ data: null, error: 'Failed to fetch settings', meta: {} });
  }
});

// PATCH /api/v1/portal/settings
router.patch('/settings', async (req: Request, res: Response) => {
  const { notification_pref, vacation_mode } = req.body as { notification_pref?: string; vacation_mode?: boolean };
  const updates: Record<string, unknown> = {};
  if (notification_pref !== undefined) updates.notificationPref = notification_pref;
  if (vacation_mode !== undefined) updates.vacationMode = vacation_mode;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ data: null, error: 'No fields to update', meta: {} });
    return;
  }

  try {
    await db.update(providers).set(updates).where(eq(providers.id, req.providerId));
    res.json({ data: { updated: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /portal/settings]');
    res.status(500).json({ data: null, error: 'Failed to update settings', meta: {} });
  }
});

// POST /api/v1/portal/opt-out
router.post('/opt-out', async (req: Request, res: Response) => {
  try {
    await db.insert(suppressionList).values({
      providerId: req.providerId,
      reason: 'provider_requested',
    });
    res.json({ data: { opted_out: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /portal/opt-out]');
    res.status(500).json({ data: null, error: 'Failed to opt out', meta: {} });
  }
});

// GET /api/v1/portal/bookings
router.get('/bookings', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        serviceAddress: bookings.serviceAddress,
        confirmedAt: bookings.confirmedAt,
        // Job details
        jobId: jobs.id,
        jobStatus: jobs.status,
        diagnosis: jobs.diagnosis,
        zipCode: jobs.zipCode,
        preferredTiming: jobs.preferredTiming,
        tier: jobs.tier,
        jobCreatedAt: jobs.createdAt,
        // Homeowner contact
        homeownerFirstName: homeowners.firstName,
        homeownerLastName: homeowners.lastName,
        homeownerEmail: homeowners.email,
        homeownerPhone: homeowners.phone,
        // Quote details
        quotedPrice: providerResponses.quotedPrice,
        availability: providerResponses.availability,
        responseMessage: providerResponses.message,
      })
      .from(bookings)
      .innerJoin(jobs, eq(bookings.jobId, jobs.id))
      .innerJoin(homeowners, eq(bookings.homeownerId, homeowners.id))
      .leftJoin(providerResponses, eq(bookings.responseId, providerResponses.id))
      .where(eq(bookings.providerId, req.providerId))
      .orderBy(desc(bookings.confirmedAt));

    res.json({ data: { bookings: rows }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /portal/bookings]');
    res.status(500).json({ data: null, error: 'Failed to fetch bookings', meta: {} });
  }
});

export default router;
