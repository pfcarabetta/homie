import cron from 'node-cron';
import logger from '../logger';
import { runScheduleTick } from './vendor-schedule-engine';

/**
 * Vendor Schedule Worker — Membership Phase 1, Session 3.
 *
 * Nightly cron that calls `runScheduleTick` to materialize the next 30
 * days of `vendor_visits` rows for every active recurring vendor.
 *
 * Mirrors the pattern in services/reservation-sync.ts — initial run on
 * boot (after a short delay), then on the configured cron schedule.
 *
 * Cron expression: nightly at 03:00 UTC. Picked for off-peak load and
 * because the engine is idempotent (running twice in a 24h window is
 * harmless).
 */

const NIGHTLY_AT_3AM = '0 3 * * *';
const STARTUP_DELAY_MS = 30 * 1000;

export function startVendorScheduleWorker(): void {
  logger.info({ schedule: NIGHTLY_AT_3AM }, '[vendor-schedule-worker] starting nightly schedule generation');

  // Initial run after 30s — gives the API time to boot and avoids
  // racing with other workers that fire on startup.
  setTimeout(() => {
    runScheduleTick().catch((err) =>
      logger.error({ err }, '[vendor-schedule-worker] initial tick failed'),
    );
  }, STARTUP_DELAY_MS);

  cron.schedule(NIGHTLY_AT_3AM, () => {
    runScheduleTick().catch((err) =>
      logger.error({ err }, '[vendor-schedule-worker] scheduled tick failed'),
    );
  });
}
