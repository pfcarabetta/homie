import { eq, and, inArray, sql, asc, lte, gte, ne } from 'drizzle-orm';
import crypto from 'crypto';
import logger from '../logger';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { homeowners } from '../db/schema/homeowners';
import { providers } from '../db/schema/providers';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { providerScores } from '../db/schema/provider-scores';
import { preferredVendors } from '../db/schema/preferred-vendors';
import { providerResponses } from '../db/schema/provider-responses';
import { jobTrackingEvents, jobTrackingLinks, type TrackingEventType } from '../db/schema/job-tracking';
import { reservations } from '../db/schema/reservations';
import { properties } from '../db/schema/properties';
import { discoverProviders } from './providers/discovery';
import { generateScripts } from './scripts/generation';
import { VoiceAdapter } from './outreach/voice';
import { SmsAdapter } from './outreach/sms';
import { WebAdapter } from './outreach/web';
import { sendSms, sendEmail } from './notifications';
import { ChannelAdapter, OutreachChannel } from './outreach/types';
import { DiagnosisPayload } from '../db/schema/jobs';
import { DiscoveredProvider } from '../types/providers';
import { JobTier } from '../types/jobs';
import { Job } from '../db/schema/jobs';

// ── Tracking event helper ─────────────────────────────────────────────────────

export async function emitTrackingEvent(jobId: string, eventType: TrackingEventType, title: string, description?: string, metadata?: Record<string, unknown>) {
  try {
    await db.insert(jobTrackingEvents).values({
      jobId,
      eventType,
      title,
      description: description ?? null,
      metadata: metadata ?? null,
    });

    // Notify all linked tracking contacts
    const links = await db.select().from(jobTrackingLinks).where(eq(jobTrackingLinks.jobId, jobId));
    for (const link of links) {
      const trackingUrl = `https://homiepro.ai/t/${link.trackingToken}`;
      if (link.notifyPhone) {
        void sendSms(link.notifyPhone, `🏠 ${link.propertyName} — ${title}. View status: ${trackingUrl}`);
      }
      if (link.notifyEmail) {
        void sendEmail(link.notifyEmail, `🏠 ${link.propertyName} — ${title}`,
          `<div style="font-family:'DM Sans',-apple-system,sans-serif;max-width:520px;margin:0 auto;background:#F9F5F2;padding:32px 20px;">
            <div style="text-align:center;margin-bottom:24px;"><span style="font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:700;color:#E8632B;">homie</span></div>
            <div style="background:#fff;border-radius:16px;padding:32px 28px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
              <div style="font-size:12px;font-weight:600;color:#9B9490;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Maintenance Update</div>
              <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#2D2926;font-family:'Fraunces',Georgia,serif;">${link.propertyName}</h2>
              <p style="margin:0 0 20px;color:#6B6560;font-size:16px;line-height:1.6;">${title}</p>
              ${description ? `<p style="margin:0 0 20px;color:#9B9490;font-size:14px;line-height:1.6;">${description}</p>` : ''}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
                <a href="${trackingUrl}" style="display:inline-block;background:#E8632B;color:#fff;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px;">View Status</a>
              </td></tr></table>
            </div>
            <div style="text-align:center;margin-top:24px;"><p style="color:#9B9490;font-size:12px;margin:0;">Sent by <a href="https://homiepro.ai" style="color:#E8632B;text-decoration:none;font-weight:600;">homie</a> — Your home's best friend</p></div>
          </div>`);
      }
    }
  } catch (err) {
    logger.error({ err, jobId, eventType }, '[orchestration] emitTrackingEvent failed');
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_PROVIDER_LIMITS: Record<JobTier, number> = {
  standard: 5,
  priority: 10,
  emergency: 15,
};

// Fetch extra from discovery so we still hit the limit after suppressed/rate-limited filtering
const DISCOVERY_BUFFER = 2;

// Test mode: route all outreach to a single phone number
const TEST_MODE = process.env.OUTREACH_TEST_MODE?.toLowerCase() === 'true';
const TEST_PHONE = process.env.OUTREACH_TEST_PHONE ?? null;
if (TEST_MODE) {
  logger.info(`[orchestration] TEST MODE ENABLED — all outreach routed to ${TEST_PHONE}`);
}

// ── Adapters ──────────────────────────────────────────────────────────────────

// Instantiated per-dispatch so that tests can override via jest.mock beforeEach.
// In production the constructors are cheap (no persistent state).
function createAdapters(): Record<OutreachChannel, ChannelAdapter> {
  return {
    voice: new VoiceAdapter(),
    sms: new SmsAdapter(),
    web: new WebAdapter(),
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function sendOutreachToProvider(
  job: Job,
  diagnosis: DiagnosisPayload,
  provider: DiscoveredProvider,
  adapters: Record<OutreachChannel, ChannelAdapter>,
  skipQuote = false,
): Promise<void> {
  logger.info(`[orchestration] Sending outreach to ${provider.name} (channels: ${provider.channels_available.join(',')}${skipQuote ? ', skip-quote' : ''})`);

  // For skip-quote providers, omit budget from the outreach
  const budgetText = skipQuote ? undefined : (job.budget ?? 'flexible');

  // Generate scripts for this provider (templates are cached per category:severity)
  let bundle;
  try {
    bundle = await generateScripts({
      jobId: job.id,
      providerId: provider.id,
      providerName: provider.name,
      category: diagnosis.category,
      severity: diagnosis.severity,
      summary: diagnosis.summary,
      recommendedActions: diagnosis.recommendedActions,
      budget: budgetText ?? 'flexible',
      zipCode: job.zipCode,
      timing: job.preferredTiming ?? 'flexible',
    });
  } catch (err) {
    logger.error({ err }, `[orchestration] Script generation failed for ${provider.name}`);
    const budgetStr = skipQuote ? '' : ` Budget: ${job.budget ?? 'flexible'}.`;
    const fallbackScript = `Hi ${provider.name}, this is Homie. We have a ${diagnosis.category} job near ${job.zipCode}. ${diagnosis.summary}.${budgetStr} Are you interested?`;
    bundle = { job_id: job.id, provider_id: provider.id, voice: fallbackScript, sms: `${diagnosis.category} job near ${job.zipCode}. ${diagnosis.summary}. Interested? Reply YES`, web: fallbackScript, generated_at: new Date().toISOString() };
  }

  const scriptByChannel: Record<OutreachChannel, string> = {
    voice: bundle.voice,
    sms: bundle.sms,
    web: bundle.web,
  };

  const allChannels = provider.channels_available.filter(
    (ch): ch is OutreachChannel => ch === 'voice' || ch === 'sms' || ch === 'web',
  );

  if (allChannels.length === 0) {
    logger.warn(`[orchestration] No available channels for ${provider.name}`);
    return;
  }

  // Determine channels based on tier and business hours
  const tier = (job.tier as JobTier) in TIER_PROVIDER_LIMITS ? (job.tier as JobTier) : 'standard';
  const isClosed = provider.open_now === false;
  let channels: OutreachChannel[];

  if (isClosed && tier !== 'emergency') {
    // Business is closed — only send SMS and email (no voice calls)
    channels = allChannels.filter(ch => ch === 'sms' || ch === 'web');
    logger.info(`[orchestration] ${provider.name} is closed — skipping voice, using SMS/email only`);
  } else if (tier === 'standard') {
    // Standard: SMS + Email only (no calls)
    channels = allChannels.filter(ch => ch === 'sms' || ch === 'web');
  } else if (tier === 'priority') {
    // Priority: SMS first, voice after delay
    channels = allChannels.filter(ch => ch === 'sms' || ch === 'web');
    // Schedule voice follow-up after 5 minutes if no response (skip if closed)
    if (allChannels.includes('voice') && !isClosed) {
      setTimeout(async () => {
        try {
          // Check if provider already responded
          const [existing] = await db
            .select({ status: outreachAttempts.status })
            .from(outreachAttempts)
            .where(and(eq(outreachAttempts.jobId, job.id), eq(outreachAttempts.providerId, provider.id), inArray(outreachAttempts.status, ['accepted', 'declined', 'responded'])))
            .limit(1);

          if (existing) {
            logger.info(`[orchestration] Skipping voice follow-up for ${provider.name} — already responded`);
            return;
          }

          logger.info(`[orchestration] Sending voice follow-up to ${provider.name}`);
          const script = scriptByChannel.voice;
          const [attempt] = await db.insert(outreachAttempts).values({ jobId: job.id, providerId: provider.id, channel: 'voice', scriptUsed: script, status: 'pending' }).returning({ id: outreachAttempts.id });
          const voicePhone = TEST_MODE && TEST_PHONE ? TEST_PHONE : (provider.phone ?? null);
          const result = await adapters.voice.send({ attemptId: attempt.id, jobId: job.id, providerId: provider.id, providerName: provider.name, phone: voicePhone, email: null, website: null, script, channel: 'voice' });
          if (result.status === 'failed') {
            logger.warn(`[orchestration] Voice follow-up failed for ${provider.name}: ${result.error}`);
            await db.update(outreachAttempts).set({ status: 'failed', responseRaw: result.error ?? null }).where(eq(outreachAttempts.id, attempt.id));
          } else {
            logger.info(`[orchestration] Voice follow-up sent to ${provider.name}`);
          }
        } catch (err) {
          logger.error({ err }, `[orchestration] Voice follow-up error for ${provider.name}`);
        }
      }, 5 * 60 * 1000); // 5 minutes
    }
  } else {
    // Emergency: all channels simultaneously
    channels = allChannels;
  }

  if (channels.length === 0) {
    logger.warn(`[orchestration] No channels for ${provider.name} at ${tier} tier`);
    return;
  }

  logger.info(`[orchestration] ${tier} tier: sending ${channels.join(',')} to ${provider.name}${tier === 'priority' && allChannels.includes('voice') ? ' (voice in 5min)' : ''}`);

  for (const channel of channels) {
    const script = scriptByChannel[channel];

    try {
      const [attempt] = await db
        .insert(outreachAttempts)
        .values({
          jobId: job.id,
          providerId: provider.id,
          channel,
          scriptUsed: script,
          status: 'pending',
        })
        .returning({ id: outreachAttempts.id });

      // In test mode, route SMS/voice to test phone and skip web
      const sendPhone = TEST_MODE && TEST_PHONE ? TEST_PHONE : (provider.phone ?? null);
      if (TEST_MODE && channel === 'web') {
        logger.info(`[orchestration] TEST MODE: skipping web outreach for ${provider.name}`);
        await db.update(outreachAttempts).set({ status: 'failed', responseRaw: 'Skipped in test mode' }).where(eq(outreachAttempts.id, attempt.id));
        continue;
      }

      const result = await adapters[channel].send({
        attemptId: attempt.id,
        jobId: job.id,
        providerId: provider.id,
        providerName: provider.name,
        phone: sendPhone,
        email: TEST_MODE ? null : (provider.email ?? null),
        website: TEST_MODE ? null : (provider.website ?? null),
        script,
        channel,
      });

      if (result.status === 'failed') {
        logger.warn(`[orchestration] ${channel} outreach failed for ${provider.name}: ${result.error}`);
        await db
          .update(outreachAttempts)
          .set({ status: 'failed', responseRaw: result.error ?? null })
          .where(eq(outreachAttempts.id, attempt.id));
      } else {
        logger.info(`[orchestration] ${channel} outreach sent to ${provider.name}`);
      }
    } catch (err) {
      logger.error({ err }, `[orchestration] ${channel} outreach error for ${provider.name}`);
    }
    // 'pending' attempts stay pending until a webhook delivers the provider's reply
  }
}

async function incrementOutreachCounts(providerIds: string[]): Promise<void> {
  if (providerIds.length === 0) return;

  // Upsert provider_scores rows, incrementing total_outreach
  await db
    .insert(providerScores)
    .values(providerIds.map((id) => ({ providerId: id, totalOutreach: 1, totalAccepted: 0 })))
    .onConflictDoUpdate({
      target: providerScores.providerId,
      set: {
        totalOutreach: sql`${providerScores.totalOutreach} + 1`,
        updatedAt: sql`now()`,
      },
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called fire-and-forget after a job is created.
 * Discovers eligible providers, fans out outreach across channels, and
 * moves the job from 'dispatching' → 'collecting'.
 */
export async function dispatchJob(jobId: string): Promise<void> {
  // Load job
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    logger.error(`[orchestration] dispatchJob: job ${jobId} not found`);
    return;
  }
  if (!job.diagnosis) {
    logger.error(`[orchestration] dispatchJob: job ${jobId} has no diagnosis`);
    return;
  }

  const diagnosis = job.diagnosis as DiagnosisPayload;
  const tier = (job.tier as JobTier) in TIER_PROVIDER_LIMITS ? (job.tier as JobTier) : 'standard';
  const limit = TIER_PROVIDER_LIMITS[tier];

  // ── Preferred vendor cascade (B2B jobs only) ──────────────────────────
  const preferredProviderIds: string[] = [];
  const skipQuoteProviderIds = new Set<string>();
  if (job.workspaceId) {
    try {
      const jobCategory = diagnosis.category.toLowerCase();
      const pvRows = await db
        .select({ providerId: preferredVendors.providerId, categories: preferredVendors.categories, availabilitySchedule: preferredVendors.availabilitySchedule, skipQuote: preferredVendors.skipQuote })
        .from(preferredVendors)
        .where(and(
          eq(preferredVendors.workspaceId, job.workspaceId),
          eq(preferredVendors.active, true),
          // Match property-specific vendors first, then workspace-wide
          job.propertyId
            ? sql`(${preferredVendors.propertyId} = ${job.propertyId} OR ${preferredVendors.propertyId} IS NULL)`
            : sql`${preferredVendors.propertyId} IS NULL`,
          // Match category: vendor categories contain the job category, or vendor has no categories (matches all)
          sql`(${preferredVendors.categories} IS NULL OR ${jobCategory} = ANY(${preferredVendors.categories}))`,
        ))
        .orderBy(asc(preferredVendors.priority));

      // Filter out vendors who are not available right now
      const now = new Date();
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const currentDay = dayNames[now.getDay()];
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const availableRows = pvRows.filter(r => {
        if (!r.availabilitySchedule) return true; // no schedule = always available
        const daySlot = (r.availabilitySchedule as Record<string, { start: string; end: string } | null>)[currentDay];
        if (daySlot === null || daySlot === undefined) return false; // not available this day
        return currentTime >= daySlot.start && currentTime <= daySlot.end;
      });

      if (availableRows.length < pvRows.length) {
        logger.info(`[orchestration] dispatchJob: ${pvRows.length - availableRows.length} preferred vendors filtered out (outside operating hours)`);
      }

      // If specific preferred vendors were requested (e.g. from guest issue approval), filter to those
      const diagExtra = diagnosis as unknown as Record<string, unknown>;
      const requestedVendorIds = (diagExtra.preferredVendorIds as string[] | undefined) ?? (diagExtra.preferredVendorId ? [diagExtra.preferredVendorId as string] : undefined);
      if (requestedVendorIds?.length) {
        const requestedSet = new Set(requestedVendorIds);
        const matchedVendors = availableRows.filter(r => requestedSet.has(r.providerId));
        if (matchedVendors.length > 0) {
          preferredProviderIds.push(...matchedVendors.map(r => r.providerId));
          for (const r of matchedVendors) { if (r.skipQuote) skipQuoteProviderIds.add(r.providerId); }
          logger.info(`[orchestration] dispatchJob: PM selected ${matchedVendors.length} vendor(s) for job ${jobId}`);
        } else {
          // None of the requested vendors available, fall back to all preferred
          preferredProviderIds.push(...availableRows.map(r => r.providerId));
          for (const r of availableRows) { if (r.skipQuote) skipQuoteProviderIds.add(r.providerId); }
          logger.warn(`[orchestration] dispatchJob: requested vendors not available, using ${availableRows.length} preferred vendors`);
        }
      } else {
        preferredProviderIds.push(...availableRows.map(r => r.providerId));
        for (const r of availableRows) { if (r.skipQuote) skipQuoteProviderIds.add(r.providerId); }
      }
      if (preferredProviderIds.length > 0) {
        logger.info(`[orchestration] dispatchJob: found ${preferredProviderIds.length} preferred vendors for job ${jobId}`);
      }
    } catch (err) {
      logger.warn({ err }, `[orchestration] dispatchJob: preferred vendor lookup failed for job ${jobId}, falling back to marketplace`);
    }
  }

  // ── Provider discovery ────────────────────────────────────────────────
  // Build the eligible list: preferred vendors first, then marketplace discovery fills remaining slots

  let eligible: DiscoveredProvider[] = [];

  // Load preferred vendors as DiscoveredProvider objects
  if (preferredProviderIds.length > 0) {
    const pvProviders = await db
      .select()
      .from(providers)
      .where(inArray(providers.id, preferredProviderIds));

    for (const pv of pvProviders) {
      eligible.push({
        id: pv.id,
        name: pv.name,
        phone: pv.phone,
        email: pv.email,
        website: pv.website,
        google_place_id: pv.googlePlaceId,
        google_rating: pv.googleRating,
        review_count: pv.reviewCount,
        categories: pv.categories,
        distance_miles: 0,
        rank_score: 100, // preferred vendors get top rank
        homie_score: { acceptance_rate: 0, completion_rate: 0, avg_homeowner_rating: 0, avg_response_sec: 0, total_jobs: 0 },
        channels_available: ['sms', 'voice', 'web'].filter(c =>
          c !== 'voice' || pv.phone,
        ),
        open_now: null,
        last_contacted: null,
        suppressed: false,
        rate_limited: false,
      });
    }
    logger.info(`[orchestration] dispatchJob: loaded ${eligible.length} preferred providers for job ${jobId}`);
  }

  // Categories that should only use preferred vendors — no marketplace discovery
  const INTERNAL_ONLY_CATEGORIES = new Set(['inspection', 'restocking', 'concierge', 'trash', 'guest_wifi', 'guest_lockout', 'guest_safety', 'guest_noise']);
  const isInternalOnly = INTERNAL_ONLY_CATEGORIES.has(diagnosis.category.toLowerCase()) || diagnosis.category.toLowerCase().startsWith('guest_');

  if (isInternalOnly && eligible.length === 0) {
    logger.warn(`[orchestration] dispatchJob: internal-only category '${diagnosis.category}' has no preferred vendors for job ${jobId}`);
    await db.update(jobs).set({ status: 'expired' }).where(eq(jobs.id, jobId));
    return;
  }

  // Fill remaining slots from marketplace discovery
  const remainingSlots = limit - eligible.length;
  if (remainingSlots > 0 && !isInternalOnly) {
    let discoveredProviders: DiscoveredProvider[];
    try {
      logger.info(`[orchestration] dispatchJob: discovering ${remainingSlots} marketplace providers for job ${jobId} (${diagnosis.category}, ${job.zipCode})`);
      const result = await discoverProviders({
        category: diagnosis.category,
        zipCode: job.zipCode,
        radiusMiles: 15,
        minRating: 4.0,
        limit: remainingSlots + DISCOVERY_BUFFER,
      });
      discoveredProviders = result.providers;
      logger.info(`[orchestration] dispatchJob: found ${discoveredProviders.length} providers at 15mi for job ${jobId}`);

      // Retry with larger radius if no eligible providers
      const firstPassEligible = discoveredProviders.filter((p) => !p.suppressed && !p.rate_limited);
      if (firstPassEligible.length === 0) {
        logger.info(`[orchestration] dispatchJob: no eligible at 15mi, expanding to 25mi for job ${jobId}`);
        const expanded = await discoverProviders({
          category: diagnosis.category,
          zipCode: job.zipCode,
          radiusMiles: 25,
          minRating: 3.5,
          limit: remainingSlots + DISCOVERY_BUFFER + 5,
        });
        discoveredProviders = expanded.providers;
        logger.info(`[orchestration] dispatchJob: found ${discoveredProviders.length} providers at 25mi for job ${jobId}`);
      }
    } catch (err) {
      logger.error({ err }, `[orchestration] dispatchJob: discovery failed for job ${jobId}`);
      if (eligible.length === 0) return; // No preferred vendors either
      discoveredProviders = [];
    }

    // Filter out suppressed, rate-limited, and already-included preferred vendors
    const preferredIdSet = new Set(preferredProviderIds);
    const marketplaceEligible = discoveredProviders
      .filter((p) => !p.suppressed && !p.rate_limited && !preferredIdSet.has(p.id))
      .slice(0, remainingSlots);

    eligible = [...eligible, ...marketplaceEligible];
  }

  if (eligible.length === 0) {
    logger.warn(`[orchestration] dispatchJob: no eligible providers for job ${jobId} even at expanded radius`);
    return;
  }

  // Test mode: only contact the first provider
  if (TEST_MODE) {
    const testProvider = eligible[0];
    logger.info(`[orchestration] TEST MODE: limiting outreach to 1 provider (${testProvider.name}) for job ${jobId}`);
    eligible.length = 0;
    eligible.push(testProvider);
  }

  // Enrich providers without email — try scraping their website
  const { scrapeEmailFromWebsite } = await import('./providers/email-scraper');
  for (const p of eligible) {
    if (!p.email && p.website) {
      try {
        const email = await scrapeEmailFromWebsite(p.website);
        if (email) {
          p.email = email;
          // Save to DB for future use
          await db.update(providers).set({ email }).where(eq(providers.id, p.id));
          logger.info(`[orchestration] Found email ${email} for ${p.name}`);
        }
      } catch (err) { logger.warn({ err, providerId: p.id, website: p.website }, '[orchestration] Failed to scrape email from provider website'); }
    }
  }

  // Transition job status to collecting
  await db.update(jobs).set({ status: 'collecting' }).where(eq(jobs.id, jobId));

  // Emit tracking events
  void emitTrackingEvent(jobId, 'reported', 'Issue Reported', diagnosis.summary?.slice(0, 200));
  void emitTrackingEvent(jobId, 'dispatched', 'Dispatching Pros', `Contacting ${eligible.length} providers in the area via phone, SMS, and web.`);

  // Auto-share tracking with current guest if property is occupied AND user opted in
  const notifyGuest = (diagnosis as unknown as Record<string, unknown>).notifyGuest === true;
  if (job.propertyId && notifyGuest) {
    try {
      const now = new Date();
      const [currentReservation] = await db
        .select()
        .from(reservations)
        .where(and(
          eq(reservations.propertyId, job.propertyId),
          lte(reservations.checkIn, now),
          gte(reservations.checkOut, now),
          ne(reservations.status, 'cancelled'),
          ne(reservations.status, 'Cancelled'),
          ne(reservations.status, 'canceled'),
        ))
        .limit(1);

      if (currentReservation && (currentReservation.guestEmail || currentReservation.guestPhone)) {
        // Look up property name for the tracking link
        const [prop] = await db
          .select({ name: properties.name })
          .from(properties)
          .where(eq(properties.id, job.propertyId))
          .limit(1);

        const propertyName = prop?.name ?? 'Your property';
        const trackingToken = crypto.randomBytes(24).toString('base64url').slice(0, 32);

        await db.insert(jobTrackingLinks).values({
          jobId,
          trackingToken,
          notifyPhone: currentReservation.guestPhone ?? undefined,
          notifyEmail: currentReservation.guestEmail ?? undefined,
          propertyName,
        });

        logger.info(
          { jobId, guestName: currentReservation.guestName, guestEmail: currentReservation.guestEmail, guestPhone: currentReservation.guestPhone },
          '[dispatch] Auto-sharing status with current guest',
        );
      }
    } catch (err) {
      logger.warn({ err, jobId }, '[dispatch] Failed to auto-share tracking with guest');
    }
  }

  // Slack notification — fire-and-forget
  if (job.workspaceId) {
    try {
      const { notifySlack } = await import('./slack-notifier');
      void notifySlack(job.workspaceId, 'dispatch_created', {
        jobId,
        category: diagnosis.category,
        severity: diagnosis.severity,
        summary: diagnosis.summary,
        tier,
        propertyName: job.propertyId ? '' : '',
        zipCode: job.zipCode,
        providerCount: eligible.length,
      });
    } catch (err) { logger.warn({ err, jobId }, '[orchestration] Slack notification failed during dispatch'); }
  }

  const adapters = createAdapters();

  // ── Cascading dispatch for B2B with preferred vendors ─────────────────
  const PREFERRED_CASCADE_DELAY_MS = 15 * 60 * 1000; // 15 minutes
  const hasPreferredVendors = preferredProviderIds.length > 0 && job.workspaceId;
  const preferredEligible = hasPreferredVendors
    ? eligible.filter(p => preferredProviderIds.includes(p.id))
    : [];
  const marketplaceEligible = hasPreferredVendors
    ? eligible.filter(p => !preferredProviderIds.includes(p.id))
    : eligible;

  if (hasPreferredVendors && preferredEligible.length > 0) {
    // Phase 1: Contact preferred vendors first
    logger.info(`[orchestration] dispatchJob: Phase 1 — contacting ${preferredEligible.length} preferred vendors for job ${jobId}`);

    const preferredResults = await Promise.allSettled(
      preferredEligible.map((provider) => sendOutreachToProvider(job, diagnosis, provider, adapters, skipQuoteProviderIds.has(provider.id))),
    );
    const preferredFailed = preferredResults.filter((r) => r.status === 'rejected');
    if (preferredFailed.length > 0) {
      logger.error(`[orchestration] dispatchJob: ${preferredFailed.length}/${preferredEligible.length} preferred outreach(es) failed for job ${jobId}`);
    }
    await incrementOutreachCounts(preferredEligible.map((p) => p.id));

    logger.info(`[orchestration] dispatchJob: preferred vendors contacted for job ${jobId}, marketplace cascade in 15 minutes`);

    // Phase 2: After 15 minutes, check for responses and contact marketplace if needed
    if (marketplaceEligible.length > 0) {
      setTimeout(async () => {
        try {
          // Check if any preferred vendor responded
          const responseRows = await db
            .select({ id: providerResponses.id })
            .from(providerResponses)
            .where(and(
              eq(providerResponses.jobId, jobId),
              inArray(providerResponses.providerId, preferredProviderIds),
            ));

          if (responseRows.length > 0) {
            logger.info(`[orchestration] dispatchJob: ${responseRows.length} preferred vendor(s) responded for job ${jobId}, skipping marketplace`);
            return;
          }

          // No preferred vendor responded — contact marketplace
          logger.info(`[orchestration] dispatchJob: Phase 2 — no preferred vendor response after 15min, contacting ${marketplaceEligible.length} marketplace providers for job ${jobId}`);

          // Re-check job is still active
          const [currentJob] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
          if (!currentJob || !['collecting', 'dispatching'].includes(currentJob.status)) {
            logger.info(`[orchestration] dispatchJob: job ${jobId} no longer active (${currentJob?.status}), skipping marketplace cascade`);
            return;
          }

          const marketplaceAdapters = createAdapters();
          const marketplaceResults = await Promise.allSettled(
            marketplaceEligible.map((provider) => sendOutreachToProvider(job, diagnosis, provider, marketplaceAdapters)),
          );
          const marketplaceFailed = marketplaceResults.filter((r) => r.status === 'rejected');
          if (marketplaceFailed.length > 0) {
            logger.error(`[orchestration] dispatchJob: ${marketplaceFailed.length}/${marketplaceEligible.length} marketplace outreach(es) failed for job ${jobId}`);
          }
          await incrementOutreachCounts(marketplaceEligible.map((p) => p.id));
          logger.info(`[orchestration] dispatchJob: marketplace cascade complete for job ${jobId}, contacted ${marketplaceEligible.length} providers`);
        } catch (err) {
          logger.error({ err }, `[orchestration] dispatchJob: marketplace cascade failed for job ${jobId}`);
        }
      }, PREFERRED_CASCADE_DELAY_MS);
    }
  } else {
    // No preferred vendors — contact all eligible providers immediately (consumer flow)
    const results = await Promise.allSettled(
      eligible.map((provider) => sendOutreachToProvider(job, diagnosis, provider, adapters)),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      logger.error(
        `[orchestration] dispatchJob: ${failed.length}/${eligible.length} provider outreach(es) failed for job ${jobId}`,
      );
    }

    await incrementOutreachCounts(eligible.map((p) => p.id));
  }

  logger.info(
    `[orchestration] dispatchJob: initial outreach complete for job ${jobId} (${eligible.length} total eligible)`,
  );
}

/**
 * Called after a homeowner books a provider.
 * Increments that provider's acceptance count and sends confirmation
 * messages to both the homeowner (SMS) and the provider (SMS or email).
 */
export async function sendBookingNotifications(
  jobId: string,
  providerId: string,
  bookingId: string,
  serviceAddress?: string | null,
): Promise<void> {
  logger.info(
    `[orchestration] booking confirmed — jobId=${jobId} providerId=${providerId} bookingId=${bookingId}`,
  );

  // Increment totalAccepted and recompute acceptance_rate for the booked provider
  try {
    await db
      .insert(providerScores)
      .values({ providerId, totalOutreach: 0, totalAccepted: 1 })
      .onConflictDoUpdate({
        target: providerScores.providerId,
        set: {
          totalAccepted: sql`${providerScores.totalAccepted} + 1`,
          acceptanceRate: sql`(${providerScores.totalAccepted} + 1)::numeric / NULLIF(${providerScores.totalOutreach}, 0)`,
          updatedAt: sql`now()`,
        },
      });
  } catch (err) {
    // Non-fatal: score update failure should not block the booking confirmation
    logger.error({ err }, '[orchestration] sendBookingNotifications: score update failed');
  }

  // Fetch data needed for confirmation messages
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;

  const [homeowner] = await db
    .select()
    .from(homeowners)
    .where(eq(homeowners.id, job.homeownerId))
    .limit(1);

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1);

  if (!homeowner || !provider) return;

  // Emit tracking event for booking — include provider's availability from their response
  const providerFirstName = provider.name.split(' ')[0];
  const providerInitial = provider.name.split(' ').slice(1).map(n => n.charAt(0) + '.').join(' ');
  const displayName = `${providerFirstName} ${providerInitial}`.trim();
  let availability: string | undefined;
  try {
    const [response] = await db.select({ availability: providerResponses.availability })
      .from(providerResponses)
      .where(and(eq(providerResponses.jobId, jobId), eq(providerResponses.providerId, providerId)))
      .limit(1);
    availability = response?.availability ?? undefined;
  } catch (err) { logger.warn({ err, jobId, providerId }, '[orchestration] Failed to fetch provider availability for tracking event'); }
  void emitTrackingEvent(jobId, 'provider_booked', 'Appointment Confirmed',
    `${displayName} is booked.${availability ? ` Available: ${availability}` : ''}`, {
    provider_name: displayName,
    rating: provider.googleRating ?? undefined,
    ...(availability ? { availability } : {}),
  });

  // Slack notification — fire-and-forget
  if (job.workspaceId) {
    try {
      const { notifySlack } = await import('./slack-notifier');
      const bookingDiagnosis = job.diagnosis as DiagnosisPayload | null;
      void notifySlack(job.workspaceId, 'booking_confirmed', {
        jobId,
        providerName: displayName,
        quotedPrice: availability ? undefined : undefined,
        availability,
        category: bookingDiagnosis?.category ?? 'maintenance',
      });
    } catch (err) { logger.warn({ err, jobId }, '[orchestration] Slack notification failed during booking'); }
  }

  const category = ((job.diagnosis as DiagnosisPayload | null)?.category ?? 'home maintenance').replace(/_/g, ' ');

  // SMS confirmation to homeowner
  if (homeowner.phone) {
    try {
      await sendSms(
        homeowner.phone,
        `Your Homie booking is confirmed! ${provider.name} will handle your ${category} job. They'll be in touch shortly. Booking ID: ${bookingId}.`,
      );
    } catch (err) {
      logger.error({ err }, '[orchestration] homeowner SMS failed');
    }
  }

  // Notify provider via SMS
  const { signProviderToken } = await import('../middleware/provider-auth');
  const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
  const portalLink = `${APP_URL}/portal/login?token=${signProviderToken(providerId)}`;
  const diagnosis = job.diagnosis as DiagnosisPayload | null;
  const rawSummary = diagnosis?.summary ?? 'Home service request';
  // Convert **bold** markdown to <b> tags for email HTML
  const summary = rawSummary.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  if (provider.phone) {
    try {
      const addressText = serviceAddress ? ` Address: ${serviceAddress}.` : '';
      const homeownerContact = homeowner.phone ? ` Homeowner: ${homeowner.firstName ?? ''} ${homeowner.phone}.` : '';
      await sendSms(
        provider.phone,
        `Homie: You've been booked for a ${category} job!${addressText}${homeownerContact} Please contact the homeowner directly to confirm the appointment. Details: ${portalLink}`,
      );
    } catch (err) {
      logger.error({ err }, '[orchestration] provider booking SMS failed');
    }
  }

  // Notify provider via email
  if (provider.email) {
    try {
      const emailHtml = `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#F9F5F2">
        <div style="background:#2D2926;padding:20px 32px;text-align:center">
          <span style="color:#E8632B;font-size:24px;font-weight:bold;font-family:Georgia,serif">homie</span>
          <span style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);font-size:10px;font-weight:bold;padding:2px 8px;border-radius:4px;margin-left:8px;vertical-align:super">PRO</span>
        </div>
        <div style="background:white;padding:32px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding-bottom:16px">
            <div style="width:56px;height:56px;border-radius:50%;background:rgba(27,158,119,0.12);text-align:center;line-height:56px;margin:0 auto">
              <span style="color:#1B9E77;font-size:28px;vertical-align:middle">&#10003;</span>
            </div>
          </td></tr></table>
          <h1 style="color:#2D2926;font-size:22px;font-weight:bold;text-align:center;margin:0 0 8px">You've been booked!</h1>
          <p style="color:#6B6560;font-size:15px;text-align:center;margin:0 0 24px">A homeowner has selected you for their ${category} job.</p>

          <div style="background:#F9F5F2;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid rgba(0,0,0,0.04)">
            <div style="font-size:14px;font-weight:bold;color:#2D2926;margin-bottom:8px">Job Details</div>
            <div style="font-size:14px;color:#6B6560;line-height:1.6">${summary}</div>
            <div style="margin-top:12px;font-size:13px;color:#9B9490">
              <span>Zip: <b>${job.zipCode}</b></span> &nbsp;&middot;&nbsp;
              <span>Category: <b>${category}</b></span>
              ${serviceAddress ? ` &nbsp;&middot;&nbsp; <span>Address: <b>${serviceAddress}</b></span>` : ''}
            </div>
          </div>

          <div style="background:#F9F5F2;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid rgba(0,0,0,0.04)">
            <div style="font-size:14px;font-weight:bold;color:#2D2926;margin-bottom:4px">Homeowner Contact</div>
            <div style="font-size:14px;color:#6B6560"><b>${homeowner.firstName ? homeowner.firstName + (homeowner.lastName ? ' ' + homeowner.lastName : '') : 'Homeowner'}</b></div>
            ${homeowner.phone ? `<div style="margin-top:4px"><a href="tel:${homeowner.phone}" style="font-size:14px;color:#E8632B;text-decoration:none;font-weight:bold">${homeowner.phone}</a></div>` : ''}
            ${homeowner.email ? `<div style="font-size:13px;color:#6B6560;margin-top:4px">${homeowner.email}</div>` : ''}
            ${serviceAddress ? `<div style="font-size:13px;color:#6B6560;margin-top:4px">${serviceAddress}</div>` : ''}
          </div>

          <div style="background:#FFF7ED;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid rgba(232,99,43,0.1)">
            <div style="font-size:14px;font-weight:bold;color:#C2410C;margin-bottom:4px">Next Step</div>
            <div style="font-size:14px;color:#6B6560;line-height:1.5">Please contact the homeowner directly to confirm the appointment details, including date, time, and scope of work. <b>All payment is between you and the homeowner.</b></div>
          </div>

          <div style="text-align:center">
            <a href="${portalLink}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:bold;font-size:16px">View in Pro Portal</a>
          </div>
        </div>
        <div style="padding:20px 32px;text-align:center">
          <p style="color:#9B9490;font-size:12px;margin:0">&copy; ${new Date().getFullYear()} Homie Technologies, Inc.</p>
        </div>
      </div>`;

      await sendEmail(provider.email, `You've been booked! ${category} job via Homie`, emailHtml);
    } catch (err) {
      logger.error({ err }, '[orchestration] provider booking email failed');
    }
  }
}
