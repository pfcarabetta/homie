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
  ProviderActivityPayload,
  ProviderActivityStatus,
} from '../types/jobs';
import { ApiResponse } from '../types/api';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TIERS: JobTier[] = ['standard', 'priority', 'emergency'];
const VALID_TIMINGS: JobTiming[] = ['asap', 'this_week', 'this_month', 'flexible'];
const RESPONDED_STATUSES = new Set(['responded', 'accepted']);

function estimatedResultsAt(tier: JobTier): Date {
  const minutes = tier === 'emergency' ? 15 : tier === 'priority' ? 30 : 120;
  return new Date(Date.now() + minutes * 60 * 1000);
}

// Returns the status payload used by both GET /jobs/:id and the WebSocket feed.
export async function buildJobStatus(id: string): Promise<JobStatusResponse | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) return null;

  // Pull attempts + the joined provider profile in one sweep. The
  // `provider_activities` derivation below wants name / rating /
  // phone so the frontend can render rows without another fetch.
  const attemptsWithProvider = await db
    .select({
      attempt: outreachAttempts,
      provider: providers,
    })
    .from(outreachAttempts)
    .leftJoin(providers, eq(providers.id, outreachAttempts.providerId))
    .where(eq(outreachAttempts.jobId, id));

  const [{ value: accepted }] = await db
    .select({ value: count() })
    .from(providerResponses)
    .where(eq(providerResponses.jobId, id));

  // Pre-index provider_responses by providerId so we can inline the
  // quote details when a row shows up as 'quoted'.
  const responses = await db
    .select()
    .from(providerResponses)
    .where(eq(providerResponses.jobId, id));
  const responseByProvider = new Map<string, typeof responses[number]>();
  for (const r of responses) responseByProvider.set(r.providerId, r);

  const channels: Record<'voice' | 'sms' | 'web', ChannelStats> = {
    voice: { attempted: 0, connected: 0 },
    sms: { attempted: 0, connected: 0 },
    web: { attempted: 0, connected: 0 },
  };

  let responded = 0;
  const activities: ProviderActivityPayload[] = [];
  for (const row of attemptsWithProvider) {
    const a = row.attempt;
    const p = row.provider;
    const ch = a.channel as 'voice' | 'sms' | 'web';
    if (ch in channels) {
      channels[ch].attempted++;
      if (RESPONDED_STATUSES.has(a.status)) {
        channels[ch].connected++;
        responded++;
      }
    }

    // Map attempt status → frontend activity status.
    //
    // The subtlety: outreachAttempts.status === 'accepted' means the
    // provider SAID YES to the job, but the SMS/voice AI may or may
    // not have extracted an actual dollar figure. A bare "yes, I'm
    // interested" shouldn't render as "Quote received" — only a real
    // numerical price should. We check the joined provider_response's
    // quotedPrice to distinguish:
    //
    //   pending                                → contacting
    //   responded (mid-conversation)           → connected
    //   accepted + provider_response has price → quoted
    //   accepted + no price yet                → connected (engaged, not priced)
    //   declined                               → declined
    //   failed / other                         → contacting
    const quoteRow = responseByProvider.get(a.providerId);
    const hasNumericQuote = !!quoteRow?.quotedPrice
      && typeof quoteRow.quotedPrice === 'string'
      && quoteRow.quotedPrice.trim().length > 0;

    let status: ProviderActivityStatus = 'contacting';
    if (a.status === 'declined') status = 'declined';
    else if (a.status === 'accepted') status = hasNumericQuote ? 'quoted' : 'connected';
    else if (a.status === 'responded') status = a.respondedAt ? 'connected' : 'contacting';

    // Inline the quote block only when the row is truly 'quoted' —
    // otherwise the provider_response row exists but has a null price
    // (bare "yes" case), and shipping that as a quote would mislead
    // the UI into rendering "Quote: TBD" cards.
    activities.push({
      id: status === 'quoted' && quoteRow ? quoteRow.id : a.providerId,
      provider_id: a.providerId,
      name: p?.name ?? 'Unknown provider',
      rating: p?.rating != null ? parseFloat(String(p.rating)) : null,
      review_count: p?.reviewCount ?? null,
      phone: p?.phone ?? null,
      channel: ch,
      status,
      responded_at: a.respondedAt?.toISOString() ?? null,
      ...(status === 'quoted' && quoteRow ? {
        quote: {
          response_id: quoteRow.id,
          price_label: quoteRow.quotedPrice ?? '',
          availability: quoteRow.availability ?? 'To be confirmed',
          message: quoteRow.message ?? '',
        },
      } : {}),
    });
  }

  return {
    id: job.id,
    status: job.status,
    tier: job.tier,
    providers_contacted: attemptsWithProvider.length,
    providers_responded: responded,
    providers_accepted: accepted,
    outreach_channels: channels,
    expires_at: job.expiresAt?.toISOString() ?? null,
    created_at: job.createdAt.toISOString(),
    provider_activities: activities,
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
  // Budget is no longer collected — left as null on the job record and
  // omitted from provider-facing dispatch messages. The DB column stays
  // for backwards-compatibility with historical jobs.
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

  // Compute the effective tier for this job. For B2B workspaces, priority/emergency
  // tiers require a paid plan (Professional or higher). Starter/trial workspaces get
  // transparently downgraded to 'standard' so their copy lines up with enforcement.
  let effectiveTier: JobTier = body.tier;

  try {
    // B2B search credit check — credits are a portfolio-wide pool
    if (body.workspace_id) {
      const [ws] = await db
        .select({
          searchesUsed: workspaces.searchesUsed,
          searchesLimit: workspaces.searchesLimit,
          plan: workspaces.plan,
          subscriptionStatus: workspaces.subscriptionStatus,
          trialEndsAt: workspaces.trialEndsAt,
        })
        .from(workspaces)
        .where(eq(workspaces.id, body.workspace_id))
        .limit(1);

      if (ws) {
        const isTrialing = ws.subscriptionStatus === 'trialing';

        // Priority tier gate — only Pro+ plans can dispatch priority/emergency
        // (unlocks voice outreach via Twilio). Starter/trial → standard.
        if ((body.tier === 'priority' || body.tier === 'emergency')
            && (ws.plan === 'trial' || ws.plan === 'starter')) {
          logger.info(
            { workspaceId: body.workspace_id, plan: ws.plan, requestedTier: body.tier },
            '[jobs] Downgraded priority/emergency tier to standard — plan gate',
          );
          effectiveTier = 'standard';
        }

        // Fair use: 5 searches per property per month across all plans
        const perProp = 5;

        if (isTrialing) {
          // Trial: time-based expiration first
          if (ws.trialEndsAt && new Date(ws.trialEndsAt) < new Date()) {
            res.status(403).json({
              data: null,
              error: 'Free trial has ended. Upgrade to continue dispatching.',
              meta: { trialExpired: true, upgradeRequired: true, trialEndedAt: ws.trialEndsAt },
            });
            return;
          }
          // Trial: hard dispatch cap (25 by default)
          if (ws.searchesUsed >= ws.searchesLimit) {
            res.status(403).json({
              data: null,
              error: `Trial dispatch limit reached (${ws.searchesLimit}). Upgrade to keep going.`,
              meta: { trialCapReached: true, upgradeRequired: true, limit: ws.searchesLimit },
            });
            return;
          }
        } else if (ws.plan === 'trial') {
          // Legacy trial workspaces — keep existing behavior
          if (ws.searchesUsed >= ws.searchesLimit) {
            res.status(403).json({ data: null, error: `Trial credits exhausted (${ws.searchesLimit}). Upgrade to continue.`, meta: {} });
            return;
          }
        } else {
          const [{ value: propCount }] = await db
            .select({ value: sql<number>`count(*)::int` })
            .from(properties)
            .where(and(eq(properties.workspaceId, body.workspace_id), eq(properties.active, true)));
          const effectiveLimit = Math.max(perProp * propCount, perProp);

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
    // Include notify_guest flag in diagnosis metadata if provided
    const diagnosisData = body.notify_guest
      ? { ...body.diagnosis, notifyGuest: true }
      : body.diagnosis;

    const [job] = await db
      .insert(jobs)
      .values({
        homeownerId: req.homeownerId,
        diagnosis: diagnosisData,
        photoUrls: body.photo_urls,
        preferredTiming: body.timing,
        budget: body.budget ?? null,
        tier: effectiveTier,
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

    // B2B jobs (workspace_id set) dispatch immediately — no payment required
    // Consumer jobs wait for Stripe payment authorization
    if (body.workspace_id) {
      // Audience toggle from the dispatch summary card. PMs choose
      // "preferred only" to keep the job in-network, or
      // "preferred + marketplace" (default) to fall through to
      // discovery if no preferred provider responds.
      const audience = body.audience === 'preferred_only'
        ? 'preferred_only' as const
        : 'preferred_plus_marketplace' as const;
      // Optional explicit preferred provider override list — lets the
      // PM cherry-pick preferred vendors regardless of category match.
      const preferredProviderIds = Array.isArray(body.preferred_provider_ids) && body.preferred_provider_ids.length > 0
        ? body.preferred_provider_ids.filter((id): id is string => typeof id === 'string')
        : undefined;
      logger.info(`[jobs] B2B job ${job.id} created — launching outreach immediately (audience=${audience}, explicit_preferred=${preferredProviderIds?.length ?? 0})`);
      await db.update(jobs).set({ status: 'dispatching', paymentStatus: 'paid' }).where(eq(jobs.id, job.id));
      void dispatchJob(job.id, { audience, preferredProviderIds });
    } else {
      logger.info(`[jobs] Job ${job.id} created, awaiting payment`);
    }

    const out: ApiResponse<CreateJobResponse> = {
      data: {
        id: job.id,
        status: 'open',
        tier: job.tier,
        expires_at: expiresAt.toISOString(),
        providers_contacted: 0,
        estimated_results_at: estimatedResultsAt(effectiveTier).toISOString(),
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
      .select({ status: jobs.status, homeownerId: jobs.homeownerId, expiresAt: jobs.expiresAt })
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

    // Quotes are returned regardless of job status — late responses on
    // expired dispatches are intentionally surfaced so they can still be booked.
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

    const terminal = new Set(['completed', 'expired', 'refunded', 'archived']);
    const moreExpected = pendingCount > 0 && !terminal.has(job.status);
    const expiresAtMs = job.expiresAt ? job.expiresAt.getTime() : null;

    const out: ApiResponse<JobResponsesResponse> = {
      data: {
        responses: rows.map(({ response: r, provider: p }) => ({
          id: r.id,
          provider: {
            id: p.id,
            name: p.name,
            phone: p.phone,
            google_rating: p.rating,
            review_count: p.reviewCount,
            categories: p.categories,
            google_place_id: p.googlePlaceId,
            yelp_url: p.yelpUrl,
          },
          channel: r.channel,
          quoted_price: r.quotedPrice,
          availability: r.availability,
          message: r.message,
          responded_at: r.createdAt.toISOString(),
          // True if this response arrived after the dispatch's auto-expire window
          is_late: expiresAtMs !== null && r.createdAt.getTime() > expiresAtMs,
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
      .select({ status: jobs.status, homeownerId: jobs.homeownerId, paymentStatus: jobs.paymentStatus, workspaceId: jobs.workspaceId })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    if (!job) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    const isB2B = !!job.workspaceId;
    // B2B jobs: any workspace member can book. Consumer jobs: only the job creator.
    if (!isB2B && job.homeownerId !== req.homeownerId) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    // B2B jobs skip payment check (covered by subscription)
    if (!isB2B && job.paymentStatus !== 'paid' && job.paymentStatus !== 'authorized') {
      const out: ApiResponse<null> = { data: null, error: 'Payment required before booking', meta: {} };
      res.status(402).json(out);
      return;
    }
    if (job.status === 'completed') {
      const out: ApiResponse<null> = { data: null, error: 'Job is already completed', meta: {} };
      res.status(409).json(out);
      return;
    }
    // Quotes remain bookable until the dispatch is archived. `expired` is
    // intentionally allowed — if a provider responded after the auto-expire
    // window, the PM/customer can still take that quote.
    if (job.status === 'archived' || job.status === 'refunded') {
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

    // Sync guest issue status if this is a guest reporter job
    try {
      const { syncGuestIssueFromJob } = await import('../services/orchestration');
      void syncGuestIssueFromJob(id, 'provider_booked', { providerName: p.name, providerRating: p.rating, availability: r.availability });
    } catch { /* silent */ }

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
