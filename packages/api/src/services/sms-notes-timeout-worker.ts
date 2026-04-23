import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { providerResponses } from '../db/schema/provider-responses';
import { providers } from '../db/schema/providers';
import type { SmsConversationState } from './outreach/sms-conversation';
import { formatQuotedPrice } from './quote-parser';
import { captureJobPayment, notifyHomeownerOfQuote } from './quote-finalize';
import { notifyWorkspaceOfQuote } from './quote-notifications';
import { emitTrackingEvent } from './orchestration';
import logger from '../logger';

/**
 * Auto-finalizes SMS outreach conversations that are stuck waiting for
 * the provider's answer to the "Any notes for the homeowner?" question.
 *
 * Context:
 *   The SMS AI walks the provider through interest → quote → availability
 *   → notes. Once we've extracted a real numeric quote + availability, we
 *   ask one last question ("Any notes or special info you'd like to pass
 *   along to the homeowner?") and set conversationState.phase = 'notes'
 *   + conversationState.notesAskedAt = now. BUT providers often forget to
 *   reply to that optional question — leaving the quote in limbo, never
 *   inserted into provider_responses, never shown to the homeowner.
 *
 * This worker:
 *   • Ticks every 60s (same cadence as job-expiry + outreach-expansion).
 *   • Queries outreach_attempts where channel='sms' and status='responded'.
 *   • For each, parses conversationState and checks if phase='notes' AND
 *     notesAskedAt is ≥ 5 min old.
 *   • Auto-finalizes by setting phase='done', accepted=true (no notes),
 *     inserting the provider_responses row, and firing the same
 *     notifications the real-time webhook handler would have.
 *
 * The end-result is identical to what would have happened if the
 * provider had replied "no notes" — the homeowner sees the quote,
 * payment captures, workspace gets notified.
 */

const CHECK_INTERVAL_MS = 60_000; // 1 minute
const NOTES_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function startSmsNotesTimeoutWorker(): void {
  async function tick() {
    try {
      // Pull all in-flight SMS conversations. In practice this is a
      // small set (live outreach in the last hour or two), so parsing
      // conversationState in JS for the phase filter is fine.
      const rows = await db
        .select()
        .from(outreachAttempts)
        .where(
          and(
            eq(outreachAttempts.channel, 'sms'),
            eq(outreachAttempts.status, 'responded'),
          ),
        );

      const now = Date.now();
      const stale = rows.filter(r => {
        const state = r.conversationState as SmsConversationState | null;
        if (!state || state.phase !== 'notes' || !state.notesAskedAt) return false;
        const askedAt = Date.parse(state.notesAskedAt);
        if (Number.isNaN(askedAt)) return false;
        return now - askedAt >= NOTES_TIMEOUT_MS;
      });

      if (stale.length === 0) return;

      for (const attempt of stale) {
        try {
          await finalizeOne(attempt);
        } catch (err) {
          logger.error({ err, attemptId: attempt.id }, '[sms-notes-timeout] Failed to finalize');
        }
      }
      logger.info(`[sms-notes-timeout] Auto-finalized ${stale.length} stale SMS conversation(s)`);
    } catch (err) {
      logger.error({ err }, '[sms-notes-timeout] Tick failed');
    }
  }

  void tick();
  setInterval(tick, CHECK_INTERVAL_MS);

  logger.info('[sms-notes-timeout] Worker started (checking every 60s, timeout 5 min)');
}

/** Finalize a single stale attempt — mirrors the `state.phase === 'done'`
 *  branch in routes/webhooks.ts so the homeowner gets the quote exactly
 *  as if the provider had replied "no notes." */
async function finalizeOne(attempt: typeof outreachAttempts.$inferSelect): Promise<void> {
  const state = attempt.conversationState as SmsConversationState;

  // Force the conversation into the terminal state. Empty notes =
  // treat as if provider said "none".
  state.notes = null;
  state.phase = 'done';
  state.accepted = true;

  const respondedAt = new Date();
  await db
    .update(outreachAttempts)
    .set({
      status: 'accepted',
      responseRaw: JSON.stringify(state.messages),
      respondedAt,
      conversationState: state,
    })
    .where(eq(outreachAttempts.id, attempt.id));

  const normalizedPrice = formatQuotedPrice(state.quotedPrice);

  // Only insert a provider_response + trigger the full notification
  // path if we actually captured a real numeric quote. A conversation
  // that stalled in 'notes' without a price would be rare (the AI only
  // transitions to notes AFTER quote + availability are set), but guard
  // against the edge case to stay honest with the connected-vs-quoted
  // semantics.
  if (!normalizedPrice) {
    logger.info({ attemptId: attempt.id }, '[sms-notes-timeout] Finalized without provider_response (no numeric price)');
    return;
  }

  await db.insert(providerResponses).values({
    jobId: attempt.jobId,
    providerId: attempt.providerId,
    channel: 'sms',
    quotedPrice: normalizedPrice,
    availability: state.availability,
    message: null, // timed out before notes were supplied
  });

  // Pull the provider name for downstream notifications.
  const [provider] = await db
    .select({ name: providers.name, rating: providers.rating })
    .from(providers)
    .where(eq(providers.id, attempt.providerId))
    .limit(1);
  const providerName = provider?.name ?? 'Provider';

  void captureJobPayment(attempt.jobId);
  void notifyHomeownerOfQuote(attempt.jobId, providerName, normalizedPrice, state.availability, null);
  void notifyWorkspaceOfQuote(attempt.jobId, attempt.providerId, null);

  try {
    const firstName = providerName.split(' ')[0];
    const initial = providerName.split(' ').slice(1).map(n => n.charAt(0) + '.').join(' ');
    void emitTrackingEvent(
      attempt.jobId,
      'provider_responded',
      'Quote Received',
      `${firstName} ${initial} quoted ${normalizedPrice} (auto-finalized after notes timeout)`,
      { providerId: attempt.providerId, quotedPrice: normalizedPrice, autoFinalized: true },
    );
  } catch (err) {
    logger.warn({ err, attemptId: attempt.id }, '[sms-notes-timeout] tracking event emit failed');
  }

  logger.info({ attemptId: attempt.id, jobId: attempt.jobId, price: normalizedPrice }, '[sms-notes-timeout] Auto-finalized quote');
}
