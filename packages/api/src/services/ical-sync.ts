import { eq, and, sql, inArray, gte } from 'drizzle-orm';
import * as ical from 'node-ical';
import { db } from '../db';
import { reservations } from '../db/schema/reservations';
import { propertyCalendarSources, type PropertyCalendarSource } from '../db/schema/property-calendar-sources';
import { dispatchSchedules, dispatchScheduleRuns, type CadenceConfig } from '../db/schema/schedules';
import logger from '../logger';

const FETCH_TIMEOUT_MS = 20_000;
const PAUSE_AFTER_FAILURES = 5;

export interface IcalSyncResult {
  success: boolean;
  eventsFound: number;
  imported: number;
  updated: number;
  cancelled: number;
  error?: string;
}

interface ParsedEvent {
  uid: string;
  start: Date;
  end: Date;
  summary?: string;
  status?: string;
}

/**
 * Parse iCal text content into a normalized list of reservation events.
 * Filters out non-VEVENT entries and events without a UID/start/end.
 */
function parseIcalContent(content: string): ParsedEvent[] {
  const parsed = ical.sync.parseICS(content);
  const events: ParsedEvent[] = [];
  for (const key of Object.keys(parsed)) {
    const item = parsed[key] as ical.VEvent | undefined;
    if (!item || item.type !== 'VEVENT') continue;
    if (!item.uid || !item.start || !item.end) continue;
    const start = new Date(item.start as unknown as string | Date);
    const end = new Date(item.end as unknown as string | Date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    events.push({
      uid: String(item.uid),
      start,
      end,
      summary: item.summary ? String(item.summary) : undefined,
      status: item.status ? String(item.status).toLowerCase() : undefined,
    });
  }
  return events;
}

/**
 * Extract a friendly guest name from an iCal SUMMARY string.
 * Airbnb formats: "Reserved", "John Doe (Reserved)", "Guest Name - Reserved", etc.
 * VRBO: "Reserved - John Doe", "Blocked"
 */
function extractGuestName(summary: string | undefined): string | null {
  if (!summary) return null;
  const cleaned = summary
    .replace(/\(Not available\)/gi, '')
    .replace(/Reserved/gi, '')
    .replace(/Blocked/gi, '')
    .replace(/Closed - Not available/gi, '')
    .replace(/[-—–|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned;
}

/**
 * Determine if a parsed event should be treated as a real reservation
 * vs an owner-blocked / unavailable date. Blocked dates come in as
 * 'tentative' so they don't trigger per-checkout dispatches.
 */
function classifyEventStatus(summary: string | undefined): 'confirmed' | 'tentative' {
  const s = (summary || '').toLowerCase();
  if (!s) return 'confirmed';
  if (s.includes('blocked') || s.includes('not available') || s.includes('owner') || s.includes('closed')) {
    return 'tentative';
  }
  return 'confirmed';
}

/**
 * Fetch the iCal feed and return its raw text. Throws on non-200 or timeout.
 */
async function fetchIcalUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomieProSync/1.0' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validate that a URL points to a parseable iCal feed without persisting
 * anything. Used by the POST /calendar-source endpoint before saving.
 */
export async function validateIcalUrl(url: string): Promise<{ valid: boolean; eventCount?: number; error?: string }> {
  try {
    const text = await fetchIcalUrl(url);
    if (!text.trim().startsWith('BEGIN:VCALENDAR')) {
      return { valid: false, error: 'URL did not return valid iCal content (missing BEGIN:VCALENDAR)' };
    }
    const events = parseIcalContent(text);
    return { valid: true, eventCount: events.length };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Sync a single calendar source. Fetches the URL, parses, upserts
 * reservations by ical_uid, marks vanished events as cancelled, and
 * updates the source's status fields.
 */
export async function syncCalendarSource(source: PropertyCalendarSource): Promise<IcalSyncResult> {
  if (!source.icalUrl) {
    return { success: false, eventsFound: 0, imported: 0, updated: 0, cancelled: 0, error: 'no iCal URL configured' };
  }

  let parsedEvents: ParsedEvent[] = [];
  try {
    const text = await fetchIcalUrl(source.icalUrl);
    parsedEvents = parseIcalContent(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const newFailureCount = source.consecutiveFailures + 1;
    const shouldPause = newFailureCount >= PAUSE_AFTER_FAILURES;
    await db.update(propertyCalendarSources)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: shouldPause ? 'paused' : 'failed',
        lastSyncError: msg,
        consecutiveFailures: newFailureCount,
        updatedAt: new Date(),
      })
      .where(eq(propertyCalendarSources.id, source.id));
    logger.warn({ sourceId: source.id, propertyId: source.propertyId, err: msg, consecutiveFailures: newFailureCount, paused: shouldPause }, '[ical-sync] fetch/parse failed');
    return { success: false, eventsFound: 0, imported: 0, updated: 0, cancelled: 0, error: msg };
  }

  const now = new Date();
  let imported = 0;
  let updated = 0;
  let cancelled = 0;

  // Track which uids we saw this run so we can mark removed events
  const seenUids = new Set<string>();

  for (const ev of parsedEvents) {
    seenUids.add(ev.uid);

    const guestName = extractGuestName(ev.summary);
    const status = ev.status === 'cancelled' ? 'cancelled' : classifyEventStatus(ev.summary);

    // Look up existing reservation by (ical_uid, property_id)
    const [existing] = await db
      .select({ id: reservations.id, checkIn: reservations.checkIn, checkOut: reservations.checkOut, status: reservations.status })
      .from(reservations)
      .where(and(eq(reservations.icalUid, ev.uid), eq(reservations.propertyId, source.propertyId)))
      .limit(1);

    if (existing) {
      // Update if dates or status changed
      const datesChanged = existing.checkIn.getTime() !== ev.start.getTime() || existing.checkOut.getTime() !== ev.end.getTime();
      const statusChanged = existing.status !== status;
      if (datesChanged || statusChanged) {
        await db.update(reservations)
          .set({
            checkIn: ev.start,
            checkOut: ev.end,
            guestName,
            status,
            syncedAt: now,
            updatedAt: now,
          })
          .where(eq(reservations.id, existing.id));
        updated++;
      } else {
        // Just refresh syncedAt
        await db.update(reservations).set({ syncedAt: now }).where(eq(reservations.id, existing.id));
      }
    } else {
      await db.insert(reservations).values({
        propertyId: source.propertyId,
        workspaceId: source.workspaceId,
        guestName,
        checkIn: ev.start,
        checkOut: ev.end,
        status,
        source: 'ical_import',
        icalUid: ev.uid,
        syncedAt: now,
      });
      imported++;
    }
  }

  // Mark previously synced reservations as cancelled if they're no longer in the feed
  // (only consider future reservations to avoid touching historical records)
  if (seenUids.size > 0) {
    const removed = await db.execute(sql`
      UPDATE reservations
      SET status = 'cancelled', updated_at = NOW()
      WHERE property_id = ${source.propertyId}
        AND source = 'ical_import'
        AND ical_uid IS NOT NULL
        AND ical_uid NOT IN (${sql.join(Array.from(seenUids).map(uid => sql`${uid}`), sql`, `)})
        AND check_out >= NOW()
        AND status != 'cancelled'
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    cancelled = removed.length;
  }

  // Update source status — successful sync resets the failure counter
  await db.update(propertyCalendarSources)
    .set({
      lastSyncAt: now,
      lastSyncStatus: 'success',
      lastSyncError: null,
      eventsFound: parsedEvents.length,
      consecutiveFailures: 0,
      updatedAt: now,
    })
    .where(eq(propertyCalendarSources.id, source.id));

  // Trigger per_checkout dispatch runs for any new/updated checkouts
  try {
    await triggerPerCheckoutRuns(source.propertyId);
  } catch (err) {
    logger.warn({ err, propertyId: source.propertyId }, '[ical-sync] per_checkout trigger failed');
  }

  // Detect tight turnovers from the freshly synced reservations and notify
  try {
    await detectTightTurnovers(source);
  } catch (err) {
    logger.warn({ err, propertyId: source.propertyId }, '[ical-sync] tight turnover detection failed');
  }

  logger.info({ sourceId: source.id, propertyId: source.propertyId, eventsFound: parsedEvents.length, imported, updated, cancelled }, '[ical-sync] sync complete');
  return { success: true, eventsFound: parsedEvents.length, imported, updated, cancelled };
}

/**
 * For each active per_checkout schedule on a property, ensure there's a
 * pending dispatch_schedule_run for every upcoming confirmed reservation
 * that doesn't already have one. Idempotent (deduped by reservation_id).
 */
export async function triggerPerCheckoutRuns(propertyId: string): Promise<{ created: number }> {
  // Find active per_checkout schedules for this property
  const schedules = await db
    .select()
    .from(dispatchSchedules)
    .where(and(
      eq(dispatchSchedules.propertyId, propertyId),
      eq(dispatchSchedules.cadenceType, 'per_checkout'),
      eq(dispatchSchedules.status, 'active'),
    ));

  if (schedules.length === 0) return { created: 0 };

  // Get upcoming confirmed reservations for this property (next 60 days)
  const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const upcoming = await db
    .select({ id: reservations.id, checkOut: reservations.checkOut })
    .from(reservations)
    .where(and(
      eq(reservations.propertyId, propertyId),
      eq(reservations.status, 'confirmed'),
      gte(reservations.checkOut, new Date()),
      sql`${reservations.checkOut} <= ${sixtyDaysFromNow}`,
    ));

  if (upcoming.length === 0) return { created: 0 };

  // For each (schedule, reservation), check if a run already exists
  const reservationIds = upcoming.map(r => r.id);
  const existingRuns = await db
    .select({ scheduleId: dispatchScheduleRuns.scheduleId, reservationId: dispatchScheduleRuns.reservationId })
    .from(dispatchScheduleRuns)
    .where(and(
      inArray(dispatchScheduleRuns.scheduleId, schedules.map(s => s.id)),
      inArray(dispatchScheduleRuns.reservationId, reservationIds),
    ));

  const existingKeys = new Set(existingRuns.map(r => `${r.scheduleId}|${r.reservationId}`));

  let created = 0;
  for (const sched of schedules) {
    // Determine offset from checkout (default: 2 hours after checkout)
    const cfg = sched.cadenceConfig as CadenceConfig | null;
    const offsetHours = (cfg?.offsetHours as number | undefined) ?? 2;

    for (const res of upcoming) {
      const key = `${sched.id}|${res.id}`;
      if (existingKeys.has(key)) continue;

      const scheduledFor = new Date(res.checkOut.getTime() + offsetHours * 60 * 60 * 1000);
      try {
        await db.insert(dispatchScheduleRuns).values({
          scheduleId: sched.id,
          reservationId: res.id,
          scheduledFor,
          status: 'pending',
        });
        created++;
      } catch (err) {
        logger.warn({ err, scheduleId: sched.id, reservationId: res.id }, '[ical-sync] failed to create per_checkout run');
      }
    }
  }

  if (created > 0) {
    logger.info({ propertyId, created }, '[ical-sync] created per_checkout runs');
  }
  return { created };
}

// Tight turnover threshold + per-process dedupe so we only alert once per
// (reservation, sync run) combo
const TIGHT_TURNOVER_HOURS = 5;
const alertedTightTurnovers = new Set<string>();

async function detectTightTurnovers(source: PropertyCalendarSource): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const upcoming = await db
    .select({ id: reservations.id, checkIn: reservations.checkIn, checkOut: reservations.checkOut, guestName: reservations.guestName })
    .from(reservations)
    .where(and(
      eq(reservations.propertyId, source.propertyId),
      eq(reservations.status, 'confirmed'),
      gte(reservations.checkOut, now),
      sql`${reservations.checkIn} <= ${horizon}`,
    ))
    .orderBy(reservations.checkIn);

  if (upcoming.length < 2) return;

  // Find property name for the alert
  const { properties } = await import('../db/schema/properties');
  const [prop] = await db.select({ name: properties.name }).from(properties).where(eq(properties.id, source.propertyId)).limit(1);
  const propertyName = prop?.name ?? 'Property';

  for (let i = 0; i < upcoming.length - 1; i++) {
    const curr = upcoming[i];
    const next = upcoming[i + 1];
    const gapHours = (next.checkIn.getTime() - curr.checkOut.getTime()) / 3_600_000;
    if (gapHours >= TIGHT_TURNOVER_HOURS) continue;

    const dedupeKey = `${source.propertyId}|${curr.id}|${next.id}`;
    if (alertedTightTurnovers.has(dedupeKey)) continue;
    alertedTightTurnovers.add(dedupeKey);

    const gapHoursLabel = gapHours.toFixed(1);
    logger.info({ propertyId: source.propertyId, propertyName, gapHours: gapHoursLabel }, '[ical-sync] tight turnover detected');

    // In-app notification feed
    try {
      const { recordNotification } = await import('./notification-feed');
      void recordNotification({
        workspaceId: source.workspaceId,
        type: 'approval_needed',
        title: `Tight turnover at ${propertyName}`,
        body: `${gapHoursLabel}hr window between guests on ${curr.checkOut.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}. Review the schedule to make sure your turnover team can finish in time.`,
        propertyId: source.propertyId,
        link: `/business?tab=properties`,
      });
    } catch { /* silent */ }

    // Slack notification (if connected)
    try {
      const { notifySlack } = await import('./slack-notifier');
      void notifySlack(source.workspaceId, 'approval_needed', {
        jobId: 'tight-turnover',
        category: 'turnover',
        severity: 'high',
        summary: `Tight turnover alert: ${propertyName}. ${gapHoursLabel}hr window between guests.`,
      });
    } catch { /* silent */ }
  }
}
