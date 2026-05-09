import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { grantMonthly, periodKeyFor } from './dispatch-allowance';
import logger from '../logger';

/**
 * Plus-tier monthly dispatch grant (Membership Phase 1, Session 8).
 *
 * Runs at 00:05 UTC on the 1st of every month. For each Plus
 * homeowner, deposits +PLUS_MONTHLY_GRANT into the allowance ledger,
 * capped at PLUS_MONTHLY_BANK_CAP via the cap logic in grantMonthly().
 *
 * Idempotent: the unique index on (homeowner_id, 'monthly_grant',
 * source_id=YYYY-MM) means re-running this for the same period is a
 * no-op. Premier subscribers and Inspect Premium bundle holders are
 * skipped inside grantMonthly() — Premier has unlimited via tier flag,
 * and Premium bundle has unlimited via the unlimited_grant ledger row,
 * so neither needs a monthly drip.
 *
 * Mid-month upgrades (free → plus via subscription) get their first
 * grant immediately via the Stripe webhook calling grantMonthly()
 * directly — they don't wait for the cron tick.
 */

const FIRST_OF_MONTH_AT_5_PAST_MIDNIGHT_UTC = '5 0 1 * *';

export function startDispatchMonthlyGrantWorker(): void {
  logger.info(
    { schedule: FIRST_OF_MONTH_AT_5_PAST_MIDNIGHT_UTC },
    '[dispatch-grant-worker] starting monthly grant worker',
  );

  cron.schedule(FIRST_OF_MONTH_AT_5_PAST_MIDNIGHT_UTC, () => {
    runMonthlyGrant().catch((err) =>
      logger.error({ err }, '[dispatch-grant-worker] scheduled grant failed'),
    );
  });
}

/**
 * Public for tests + manual invocation. Iterates every Plus homeowner
 * and calls grantMonthly() — which is itself idempotent + capped.
 *
 * Returns counts so callers (admin tooling, tests) can verify outcome.
 */
export async function runMonthlyGrant(now?: Date): Promise<{ processed: number; granted: number }> {
  const today = now ?? new Date();
  const periodKey = periodKeyFor(today);
  logger.info({ periodKey }, '[dispatch-grant-worker] running monthly grant');

  const plusHomeowners = await db
    .select({ id: homeowners.id })
    .from(homeowners)
    .where(eq(homeowners.membershipTier, 'plus'));

  let granted = 0;
  for (const ho of plusHomeowners) {
    try {
      const result = await grantMonthly({ homeownerId: ho.id, periodKey });
      if (result.inserted) granted++;
    } catch (err) {
      logger.error({ err, homeownerId: ho.id, periodKey }, '[dispatch-grant-worker] grant failed for homeowner');
    }
  }

  logger.info(
    { processed: plusHomeowners.length, granted, periodKey },
    '[dispatch-grant-worker] monthly grant complete',
  );
  return { processed: plusHomeowners.length, granted };
}
