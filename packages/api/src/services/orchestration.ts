import { eq, inArray, sql } from 'drizzle-orm';
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

  const channels = provider.channels_available.filter(
    (ch): ch is OutreachChannel => ch === 'voice' || ch === 'sms' || ch === 'web',
  );

  if (channels.length === 0) {
    logger.warn(`[orchestration] No available channels for ${provider.name}`);
    return;
  }

  // Send each channel sequentially — avoids hammering a single provider simultaneously
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

  // SMS or email confirmation to provider (SMS preferred; email as fallback)
  const providerMsg = `Great news! You've been booked via Homie for a ${category} job. The homeowner will be in touch shortly. Booking ID: ${bookingId}.`;
  if (provider.phone) {
    try {
      await sendSms(provider.phone, providerMsg);
    } catch (err) {
      logger.error({ err }, '[orchestration] provider SMS failed');
    }
  } else if (provider.email) {
    try {
      await sendEmail(provider.email, 'New booking via Homie!', providerMsg);
    } catch (err) {
      logger.error({ err }, '[orchestration] provider email failed');
    }
  }
}
