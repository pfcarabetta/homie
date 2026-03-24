import { Router, Request, Response } from 'express';
import { eq, and, count, desc, sql } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { jobs, outreachAttempts, providerResponses, providers, bookings, workspaces, properties } from '../db/schema';
import { dispatchJob, sendBookingNotifications } from '../services/orchestration';
import { recordHomeownerRating } from '../services/providers/scores';
import {
  CreateJobBody,
  CreateJobResponse,
  JobStatusResponse,
  JobResponsesResponse,
  BookJobBody,
  BookJobResponse,
  JobTier,
  JobTiming,
  ChannelStats,
} from '../types/jobs';
import { ApiResponse } from '../types/api';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TIERS: JobTier[] = ['standard', 'priority', 'emergency'];
const VALID_TIMINGS: JobTiming[] = ['asap', 'this_week', 'this_month', 'flexible'];
const RESPONDED_STATUSES = new Set(['responded', 'accepted', 'declined']);

function estimatedResultsAt(tier: JobTier): Date {
  const minutes = tier === 'emergency' ? 15 : tier === 'priority' ? 30 : 120;
  return new Date(Date.now() + minutes * 60 * 1000);
}

// Returns the status payload used by both GET /jobs/:id and the WebSocket feed.
export async function buildJobStatus(id: string): Promise<JobStatusResponse | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) return null;

  const attempts = await db
    .select()
    .from(outreachAttempts)
    .where(eq(outreachAttempts.jobId, id));

  const [{ value: accepted }] = await db
    .select({ value: count() })
    .from(providerResponses)
    .where(eq(providerResponses.jobId, id));

  const channels: Record<'voice' | 'sms' | 'web', ChannelStats> = {
    voice: { attempted: 0, connected: 0 },
    sms: { attempted: 0, connected: 0 },
    web: { attempted: 0, connected: 0 },
  };

  let responded = 0;
  for (const a of attempts) {
    const ch = a.channel as 'voice' | 'sms' | 'web';
    if (ch in channels) {
      channels[ch].attempted++;
      if (RESPONDED_STATUSES.has(a.status)) {
        channels[ch].connected++;
        responded++;
      }
    }
  }

  return {
    id: job.id,
    status: job.status,
    tier: job.tier,
    providers_contacted: attempts.length,
    providers_responded: responded,
    providers_accepted: accepted,
    outreach_channels: channels,
    expires_at: job.expiresAt?.toISOString() ?? null,
    created_at: job.createdAt.toISOString(),
  };
}

// POST /api/v1/jobs
router.post('/', async (req: Request, res: Response) => {
  const body = req.body as Partial<CreateJobBody>;

  if (!body.diagnosis || typeof body.diagnosis !== 'object') {
    const out: ApiResponse<null> = { data: null, error: 'diagnosis is required', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.timing || !VALID_TIMINGS.includes(body.timing)) {
    const out: ApiResponse<null> = {
      data: null,
      error: `timing must be one of: ${VALID_TIMINGS.join(', ')}`,
      meta: {},
    };
    res.status(400).json(out);
    return;
  }
  if (!body.budget) {
    const out: ApiResponse<null> = { data: null, error: 'budget is required', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.tier || !VALID_TIERS.includes(body.tier)) {
    const out: ApiResponse<null> = {
      data: null,
      error: `tier must be one of: ${VALID_TIERS.join(', ')}`,
      meta: {},
    };
    res.status(400).json(out);
    return;
  }
  if (!body.zip_code) {
    const out: ApiResponse<null> = { data: null, error: 'zip_code is required', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.consent) {
    const out: ApiResponse<null> = { data: null, error: 'consent is required', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    // B2B search credit check — credits are a portfolio-wide pool
    if (body.workspace_id) {
      const [ws] = await db
        .select({ searchesUsed: workspaces.searchesUsed, searchesLimit: workspaces.searchesLimit, plan: workspaces.plan })
        .from(workspaces)
        .where(eq(workspaces.id, body.workspace_id))
        .limit(1);

      if (ws) {
        // Calculate dynamic limit: searchesPerProperty × active properties
        const planSearches: Record<string, number> = { trial: 0, starter: 2, professional: 3, business: 5, enterprise: 10 };
        const perProp = planSearches[ws.plan] ?? 2;

        if (ws.plan === 'trial') {
          // Trial uses fixed limit from DB
          if (ws.searchesUsed >= ws.searchesLimit) {
            res.status(403).json({ data: null, error: `Trial credits exhausted (${ws.searchesLimit}). Upgrade to continue.`, meta: {} });
            return;
          }
        } else {
          const [{ value: propCount }] = await db
            .select({ value: sql<number>`count(*)::int` })
            .from(properties)
            .where(and(eq(properties.workspaceId, body.workspace_id), eq(properties.active, true)));
          const dynamicLimit = Math.max(perProp * propCount, perProp);
          const effectiveLimit = Math.max(ws.searchesLimit, dynamicLimit);

          if (ws.searchesUsed >= effectiveLimit) {
            res.status(403).json({ data: null, error: `Outreach credit limit reached (${effectiveLimit} this cycle). Add more properties or upgrade your plan.`, meta: {} });
            return;
          }
        }

        // Increment search count — deducted from portfolio-wide pool
        await db.update(workspaces)
          .set({ searchesUsed: sql`${workspaces.searchesUsed} + 1` } as Record<string, unknown>)
          .where(eq(workspaces.id, body.workspace_id));
      }
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    const consentText = 'By proceeding, you authorize Homie to contact service providers on your behalf via phone call, text message, and email to obtain quotes for your request.';

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [job] = await db
      .insert(jobs)
      .values({
        homeownerId: req.homeownerId,
        diagnosis: body.diagnosis,
        photoUrls: body.photo_urls,
        preferredTiming: body.timing,
        budget: body.budget,
        tier: body.tier,
        status: 'open',
        zipCode: body.zip_code,
        workspaceId: body.workspace_id ?? null,
        propertyId: body.property_id ?? null,
        consentGiven: true,
        consentText,
        consentIp: clientIp,
        consentAt: new Date(),
        expiresAt,
      })
      .returning();

    // Don't dispatch yet — wait for payment authorization
    // Dispatch is triggered by the Stripe webhook or by the frontend after payment
    logger.info(`[jobs] Job ${job.id} created, awaiting payment`);

    const out: ApiResponse<CreateJobResponse> = {
      data: {
        id: job.id,
        status: 'open',
        tier: job.tier,
        expires_at: expiresAt.toISOString(),
        providers_contacted: 0,
        estimated_results_at: estimatedResultsAt(body.tier).toISOString(),
      },
      error: null,
      meta: {},
    };
    res.status(201).json(out);
  } catch (err) {
    logger.error({ err }, '[POST /jobs]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to create job', meta: {} };
    res.status(500).json(out);
  }
});

// GET /api/v1/jobs/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    const out: ApiResponse<null> = { data: null, error: 'Invalid job ID', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    // Verify ownership before returning full status
    const [ownership] = await db
      .select({ homeownerId: jobs.homeownerId })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (!ownership) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    if (ownership.homeownerId !== req.homeownerId) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }

    const status = await buildJobStatus(id);
    if (!status) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    const out: ApiResponse<JobStatusResponse> = { data: status, error: null, meta: {} };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[GET /jobs/:id]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to fetch job', meta: {} };
    res.status(500).json(out);
  }
});

// GET /api/v1/jobs/:id/responses
router.get('/:id/responses', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    const out: ApiResponse<null> = { data: null, error: 'Invalid job ID', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    const [job] = await db
      .select({ status: jobs.status, homeownerId: jobs.homeownerId })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    if (!job) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    if (job.homeownerId !== req.homeownerId) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }

    const rows = await db
      .select({ response: providerResponses, provider: providers })
      .from(providerResponses)
      .innerJoin(providers, eq(providerResponses.providerId, providers.id))
      .where(eq(providerResponses.jobId, id))
      .orderBy(desc(providerResponses.ratingAtTime), providerResponses.quotedPrice);

    const [{ value: pendingCount }] = await db
      .select({ value: count() })
      .from(outreachAttempts)
      .where(and(eq(outreachAttempts.jobId, id), eq(outreachAttempts.status, 'pending')));

    const terminal = new Set(['completed', 'expired', 'refunded']);
    const moreExpected = pendingCount > 0 && !terminal.has(job.status);

    const out: ApiResponse<JobResponsesResponse> = {
      data: {
        responses: rows.map(({ response: r, provider: p }) => ({
          id: r.id,
          provider: {
            id: p.id,
            name: p.name,
            phone: p.phone,
            google_rating: p.googleRating,
            review_count: p.reviewCount,
            categories: p.categories,
          },
          channel: r.channel,
          quoted_price: r.quotedPrice,
          availability: r.availability,
          message: r.message,
          responded_at: r.createdAt.toISOString(),
        })),
        pending_count: pendingCount,
        more_expected: moreExpected,
      },
      error: null,
      meta: {},
    };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[GET /jobs/:id/responses]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to fetch responses', meta: {} };
    res.status(500).json(out);
  }
});

// POST /api/v1/jobs/:id/book
router.post('/:id/book', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    const out: ApiResponse<null> = { data: null, error: 'Invalid job ID', meta: {} };
    res.status(400).json(out);
    return;
  }

  const body = req.body as Partial<BookJobBody>;
  if (!body.response_id || !UUID_RE.test(body.response_id)) {
    const out: ApiResponse<null> = { data: null, error: 'response_id must be a valid UUID', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.provider_id || !UUID_RE.test(body.provider_id)) {
    const out: ApiResponse<null> = { data: null, error: 'provider_id must be a valid UUID', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    const [job] = await db
      .select({ status: jobs.status, homeownerId: jobs.homeownerId, paymentStatus: jobs.paymentStatus })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    if (!job) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    if (job.homeownerId !== req.homeownerId) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    if (job.paymentStatus !== 'paid' && job.paymentStatus !== 'authorized') {
      const out: ApiResponse<null> = { data: null, error: 'Payment required before booking', meta: {} };
      res.status(402).json(out);
      return;
    }
    if (job.status === 'completed') {
      const out: ApiResponse<null> = { data: null, error: 'Job is already completed', meta: {} };
      res.status(409).json(out);
      return;
    }
    if (job.status === 'expired' || job.status === 'refunded') {
      const out: ApiResponse<null> = { data: null, error: `Job is ${job.status}`, meta: {} };
      res.status(409).json(out);
      return;
    }

    const rows = await db
      .select({ response: providerResponses, provider: providers })
      .from(providerResponses)
      .innerJoin(providers, eq(providerResponses.providerId, providers.id))
      .where(
        and(
          eq(providerResponses.id, body.response_id),
          eq(providerResponses.jobId, id),
          eq(providerResponses.providerId, body.provider_id),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      const out: ApiResponse<null> = { data: null, error: 'Response not found for this job and provider', meta: {} };
      res.status(404).json(out);
      return;
    }

    const { response: r, provider: p } = rows[0];

    await db.update(jobs).set({ status: 'completed' }).where(eq(jobs.id, id));

    const [booking] = await db
      .insert(bookings)
      .values({
        jobId: id,
        homeownerId: req.homeownerId,
        providerId: p.id,
        responseId: r.id,
        serviceAddress: typeof body.service_address === 'string' ? body.service_address : null,
      })
      .returning();

    void sendBookingNotifications(id, p.id, booking.id, booking.serviceAddress);

    const out: ApiResponse<BookJobResponse> = {
      data: {
        booking_id: booking.id,
        status: 'confirmed',
        provider: { name: p.name, phone: p.phone },
        scheduled: r.availability,
        quoted_price: r.quotedPrice,
      },
      error: null,
      meta: {},
    };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[POST /jobs/:id/book]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to book job', meta: {} };
    res.status(500).json(out);
  }
});

// POST /api/v1/jobs/:id/rate
router.post('/:id/rate', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    const out: ApiResponse<null> = { data: null, error: 'Invalid job ID', meta: {} };
    res.status(400).json(out);
    return;
  }

  const body = req.body as { provider_id?: unknown; rating?: unknown };

  if (!body.provider_id || !UUID_RE.test(body.provider_id as string)) {
    const out: ApiResponse<null> = { data: null, error: 'provider_id must be a valid UUID', meta: {} };
    res.status(400).json(out);
    return;
  }

  const rating = Number(body.rating);
  if (!body.rating || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    const out: ApiResponse<null> = { data: null, error: 'rating must be a number between 1 and 5', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    const [job] = await db
      .select({ status: jobs.status, homeownerId: jobs.homeownerId })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    if (!job) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    if (job.homeownerId !== req.homeownerId) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    if (job.status !== 'completed') {
      const out: ApiResponse<null> = { data: null, error: 'Job must be completed before rating', meta: {} };
      res.status(409).json(out);
      return;
    }

    await recordHomeownerRating(body.provider_id as string, rating);

    const out: ApiResponse<{ recorded: true }> = { data: { recorded: true }, error: null, meta: {} };
    res.status(201).json(out);
  } catch (err) {
    logger.error({ err }, '[POST /jobs/:id/rate]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to record rating', meta: {} };
    res.status(500).json(out);
  }
});

export default router;
