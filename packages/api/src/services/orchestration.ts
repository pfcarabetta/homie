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
  // Generate scripts for this provider (templates are cached per category:severity)
  const bundle = await generateScripts({
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

  const scriptByChannel: Record<OutreachChannel, string> = {
    voice: bundle.voice,
    sms: bundle.sms,
    web: bundle.web,
  };

  const channels = provider.channels_available.filter(
    (ch): ch is OutreachChannel => ch === 'voice' || ch === 'sms' || ch === 'web',
  );

  // Send each channel sequentially — avoids hammering a single provider simultaneously
  for (const channel of channels) {
    const script = scriptByChannel[channel];

    // Insert the attempt row before calling the adapter — ensures a record exists
    // even if the adapter throws partway through
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
      await db
        .update(outreachAttempts)
        .set({ status: 'failed', responseRaw: result.error ?? null })
        .where(eq(outreachAttempts.id, attempt.id));
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

  // Discover providers
  let discoveredProviders: DiscoveredProvider[];
  try {
    const result = await discoverProviders({
      category: diagnosis.category,
      zipCode: job.zipCode,
      radiusMiles: 15,
      minRating: 4.0,
      limit: limit + DISCOVERY_BUFFER,
    });
    discoveredProviders = result.providers;
  } catch (err) {
    logger.error({ err }, `[orchestration] dispatchJob: discovery failed for job ${jobId}`);
    return;
  }

  // Filter out suppressed and rate-limited providers, then cap to tier limit
  const eligible = discoveredProviders
    .filter((p) => !p.suppressed && !p.rate_limited)
    .slice(0, limit);

  if (eligible.length === 0) {
    logger.warn(`[orchestration] dispatchJob: no eligible providers for job ${jobId}`);
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
