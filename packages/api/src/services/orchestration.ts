import { eq, and, inArray, sql } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { homeowners } from '../db/schema/homeowners';
import { providers } from '../db/schema/providers';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { providerScores } from '../db/schema/provider-scores';
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

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_PROVIDER_LIMITS: Record<JobTier, number> = {
  standard: 5,
  priority: 7,
  emergency: 10,
};

// Fetch extra from discovery so we still hit the limit after suppressed/rate-limited filtering
const DISCOVERY_BUFFER = 2;

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
): Promise<void> {
  logger.info(`[orchestration] Sending outreach to ${provider.name} (channels: ${provider.channels_available.join(',')})`);

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
      budget: job.budget ?? 'flexible',
      zipCode: job.zipCode,
      timing: job.preferredTiming ?? 'flexible',
    });
  } catch (err) {
    logger.error({ err }, `[orchestration] Script generation failed for ${provider.name}`);
    // Fall back to simple templates
    const fallbackScript = `Hi ${provider.name}, this is Homie. We have a ${diagnosis.category} job near ${job.zipCode}. ${diagnosis.summary}. Budget: ${job.budget ?? 'flexible'}. Are you interested?`;
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
          const result = await adapters.voice.send({ attemptId: attempt.id, jobId: job.id, providerId: provider.id, providerName: provider.name, phone: provider.phone ?? null, email: null, website: null, script, channel: 'voice' });
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

      const result = await adapters[channel].send({
        attemptId: attempt.id,
        jobId: job.id,
        providerId: provider.id,
        providerName: provider.name,
        phone: provider.phone ?? null,
        email: provider.email ?? null,
        website: provider.website ?? null,
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

  // Discover providers — start at 15 miles, expand to 25 if none found
  let discoveredProviders: DiscoveredProvider[];
  try {
    logger.info(`[orchestration] dispatchJob: discovering providers for job ${jobId} (${diagnosis.category}, ${job.zipCode})`);
    const result = await discoverProviders({
      category: diagnosis.category,
      zipCode: job.zipCode,
      radiusMiles: 15,
      minRating: 4.0,
      limit: limit + DISCOVERY_BUFFER,
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
        limit: limit + DISCOVERY_BUFFER + 5,
      });
      discoveredProviders = expanded.providers;
      logger.info(`[orchestration] dispatchJob: found ${discoveredProviders.length} providers at 25mi for job ${jobId}`);
    }
  } catch (err) {
    logger.error({ err }, `[orchestration] dispatchJob: discovery failed for job ${jobId}`);
    return;
  }

  // Filter out suppressed and rate-limited providers, then cap to tier limit
  const eligible = discoveredProviders
    .filter((p) => !p.suppressed && !p.rate_limited)
    .slice(0, limit);

  if (eligible.length === 0) {
    logger.warn(`[orchestration] dispatchJob: no eligible providers for job ${jobId} even at expanded radius`);
    return;
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
      } catch { /* skip */ }
    }
  }

  // Transition job status to collecting
  await db.update(jobs).set({ status: 'collecting' }).where(eq(jobs.id, jobId));

  const adapters = createAdapters();

  // Fan out outreach in parallel across all eligible providers
  const results = await Promise.allSettled(
    eligible.map((provider) => sendOutreachToProvider(job, diagnosis, provider, adapters)),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    logger.error(
      `[orchestration] dispatchJob: ${failed.length}/${eligible.length} provider outreach(es) failed for job ${jobId}`,
    );
  }

  // Record that these providers were outreached (feeds the ranking algorithm)
  await incrementOutreachCounts(eligible.map((p) => p.id));

  logger.info(
    `[orchestration] dispatchJob: contacted ${eligible.length} providers for job ${jobId}`,
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

  const category = (job.diagnosis as DiagnosisPayload | null)?.category ?? 'home maintenance';

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
  const summary = diagnosis?.summary ?? 'Home service request';

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
          <span style="color:#E8632B;font-size:24px;font-weight:700;font-family:Georgia,serif">homie</span>
          <span style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px;vertical-align:super">PRO</span>
        </div>
        <div style="background:white;padding:32px">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(27,158,119,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
            <span style="color:#1B9E77;font-size:28px">&#10003;</span>
          </div>
          <h1 style="color:#2D2926;font-size:22px;font-weight:700;text-align:center;margin:0 0 8px">You've been booked!</h1>
          <p style="color:#6B6560;font-size:15px;text-align:center;margin:0 0 24px">A homeowner has selected you for their ${category} job.</p>

          <div style="background:#F9F5F2;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid rgba(0,0,0,0.04)">
            <div style="font-size:14px;font-weight:600;color:#2D2926;margin-bottom:8px">Job Details</div>
            <div style="font-size:14px;color:#6B6560;line-height:1.6">${summary}</div>
            <div style="display:flex;gap:16px;margin-top:12px;font-size:13px;color:#9B9490;flex-wrap:wrap">
              <span>Zip: ${job.zipCode}</span>
              <span>Category: ${category}</span>
              ${serviceAddress ? `<span>Address: ${serviceAddress}</span>` : ''}
            </div>
          </div>

          <div style="background:#F9F5F2;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid rgba(0,0,0,0.04)">
            <div style="font-size:14px;font-weight:600;color:#2D2926;margin-bottom:4px">Homeowner Contact</div>
            <div style="font-size:14px;color:#6B6560">${homeowner.firstName ? homeowner.firstName + (homeowner.lastName ? ' ' + homeowner.lastName : '') : 'Homeowner'}</div>
            ${homeowner.phone ? `<a href="tel:${homeowner.phone}" style="font-size:14px;color:#E8632B;text-decoration:none;font-weight:600">${homeowner.phone}</a>` : ''}
            ${homeowner.email ? `<div style="font-size:13px;color:#6B6560;margin-top:4px">${homeowner.email}</div>` : ''}
            ${serviceAddress ? `<div style="font-size:13px;color:#6B6560;margin-top:4px">${serviceAddress}</div>` : ''}
          </div>

          <div style="background:#FFF7ED;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid rgba(232,99,43,0.1)">
            <div style="font-size:14px;font-weight:600;color:#C2410C;margin-bottom:4px">Next Step</div>
            <div style="font-size:14px;color:#6B6560;line-height:1.5">Please contact the homeowner directly to confirm the appointment details, including date, time, and scope of work.</div>
          </div>

          <div style="text-align:center">
            <a href="${portalLink}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">View in Pro Portal</a>
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
