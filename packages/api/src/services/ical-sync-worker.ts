import { eq, sql, ne, and } from 'drizzle-orm';
import { db } from '../db';
import { propertyCalendarSources } from '../db/schema/property-calendar-sources';
import { syncCalendarSource } from './ical-sync';
import logger from '../logger';

const TICK_INTERVAL_MS = 60_000; // check every minute

let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Find sources whose last sync is older than their sync_frequency_minutes,
    // or that have never been synced. Skip paused sources.
    const candidates = await db.execute(sql`
      SELECT id FROM property_calendar_sources
      WHERE source_type = 'ical_url'
        AND last_sync_status != 'paused'
        AND ical_url IS NOT NULL
        AND (
          last_sync_at IS NULL
          OR last_sync_at < NOW() - (sync_frequency_minutes || ' minutes')::interval
        )
      LIMIT 25
    `) as unknown as Array<{ id: string }>;

    if (candidates.length === 0) return;

    for (const c of candidates) {
      try {
        const [src] = await db.select().from(propertyCalendarSources).where(eq(propertyCalendarSources.id, c.id)).limit(1);
        if (!src) continue;
        await syncCalendarSource(src);
      } catch (err) {
        logger.error({ err, sourceId: c.id }, '[ical-sync-worker] sync failed');
      }
    }
  } catch (err) {
    logger.error({ err }, '[ical-sync-worker] tick failed');
  } finally {
    running = false;
  }
}

export function startIcalSyncWorker(): void {
  void tick();
  setInterval(tick, TICK_INTERVAL_MS);
  logger.info('[ical-sync-worker] started — checking every 60s');
}
