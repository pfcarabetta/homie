import { eq, and, isNull, sql } from 'drizzle-orm';
import * as ical from 'node-ical';
import { db } from '../db';
import { reservations } from '../db/schema/reservations';
import { propertyCalendarSources, type PropertyCalendarSource } from '../db/schema/property-calendar-sources';
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

  logger.info({ sourceId: source.id, propertyId: source.propertyId, eventsFound: parsedEvents.length, imported, updated, cancelled }, '[ical-sync] sync complete');
  return { success: true, eventsFound: parsedEvents.length, imported, updated, cancelled };
}
