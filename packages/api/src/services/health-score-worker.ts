import cron from 'node-cron';
import logger from '../logger';
import { recomputeAll } from './health-score';

/**
 * Nightly Home Health Score recompute (Phase 1, Session 7).
 *
 * Runs at 04:00 UTC, after the vendor schedule worker at 03:00 finishes
 * generating fresh visits. The 1-hour gap means the maintenance-compliance
 * factor sees up-to-date visit data when it scores.
 *
 * Same in-process pattern as services/vendor-schedule-worker.ts —
 * initial run after a short delay, then on the cron schedule. Idempotent
 * via the unique index on (homeowner_property_id, period_month) — if
 * the worker doubles up in a single 24h window, the second run UPSERTs
 * the existing row.
 */

const NIGHTLY_AT_4AM = '0 4 * * *';
const STARTUP_DELAY_MS = 60 * 1000;

export function startHealthScoreWorker(): void {
  logger.info({ schedule: NIGHTLY_AT_4AM }, '[health-score-worker] starting nightly recompute');

  setTimeout(() => {
    recomputeAll().catch((err) =>
      logger.error({ err }, '[health-score-worker] initial recompute failed'),
    );
  }, STARTUP_DELAY_MS);

  cron.schedule(NIGHTLY_AT_4AM, () => {
    recomputeAll().catch((err) =>
      logger.error({ err }, '[health-score-worker] scheduled recompute failed'),
    );
  });
}
