import { sql, AnyColumn } from 'drizzle-orm';
import { db } from '../../db';
import { providerScores } from '../../db/schema/provider-scores';

/**
 * Exponential moving average alpha.
 * A value of 0.3 weights recent data at 30% per update, converging in ~10 observations.
 */
const EMA_ALPHA = 0.3;
const EMA_RETAIN = 1 - EMA_ALPHA;

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Builds the SQL expression for an EMA update:
 *   new_avg = alpha * new_value + (1 - alpha) * COALESCE(old_avg, new_value)
 *
 * COALESCE ensures the first observation initialises the average to its own value
 * rather than being diluted by an arbitrary default.
 */
function emaUpdate(column: AnyColumn, newValue: number): ReturnType<typeof sql> {
  return sql`ROUND(
    (${EMA_ALPHA} * ${newValue} + ${EMA_RETAIN} * COALESCE(${column}::numeric, ${newValue}))::numeric,
    4
  )`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Records a provider's response time after they reply to an outreach attempt.
 * Updates avg_response_sec via EMA. Called from webhook handlers.
 *
 * @param responseTimeSec  Elapsed seconds between attemptedAt and respondedAt (non-negative).
 */
export async function recordProviderResponse(
  providerId: string,
  responseTimeSec: number,
): Promise<void> {
  const clamped = Math.max(0, responseTimeSec);

  await db
    .insert(providerScores)
    .values({ providerId, totalOutreach: 0, totalAccepted: 0, avgResponseSec: clamped.toFixed(4) })
    .onConflictDoUpdate({
      target: providerScores.providerId,
      set: {
        avgResponseSec: emaUpdate(providerScores.avgResponseSec, clamped),
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Records a homeowner's rating of a provider after job completion.
 * Updates avg_homeowner_rating via EMA.
 * Also updates completion_rate: each submitted rating is treated as a completion
 * signal. The rate is an EMA toward 1.0 on each rating; a future "no-show" event
 * would supply 0.0 to decay the rate downward.
 *
 * @param rating  Homeowner's star rating, 1–5.
 */
export async function recordHomeownerRating(
  providerId: string,
  rating: number,
): Promise<void> {
  const clamped = Math.min(5, Math.max(1, rating));

  await db
    .insert(providerScores)
    .values({
      providerId,
      totalOutreach: 0,
      totalAccepted: 0,
      avgHomeownerRating: clamped.toFixed(4),
      completionRate: '1.0000', // first rating initialises to 100%
    })
    .onConflictDoUpdate({
      target: providerScores.providerId,
      set: {
        avgHomeownerRating: emaUpdate(providerScores.avgHomeownerRating, clamped),
        // EMA toward 1.0 (completed). A no-show event would use 0.0 here instead.
        completionRate: sql`ROUND(
          (${EMA_ALPHA} * 1.0 + ${EMA_RETAIN} * COALESCE(${providerScores.completionRate}::numeric, 1.0))::numeric,
          4
        )`,
        updatedAt: sql`now()`,
      },
    });
}
