import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  recurringVendors,
  vendorVisits,
  type RecurringVendor,
  type VendorSchedulePattern,
} from '../db/schema/recurring-vendors';
import logger from '../logger';

/**
 * Vendor Schedule Engine — Membership Phase 1, Session 3.
 *
 * Two responsibilities:
 *   1. Pure date math: given a recurring vendor's pattern + a horizon,
 *      compute the list of expected visit datetimes.
 *   2. Idempotent DB sync: insert vendor_visits rows for any expected
 *      datetime that doesn't already have a row.
 *
 * Called nightly by the cron worker in services/vendor-schedule-worker.ts.
 * Skips vendors in 'paused', 'cancelled', 'pending_vendor_confirmation',
 * or 'travel_hold' status — only 'active' vendors get visits generated.
 *
 * Travel-hold semantics: if a vendor's status is 'travel_hold', no visits
 * are generated. Travel-hold acts at the recurring_vendor level; the spec
 * also allows the homeowner to set a property-wide travel hold range,
 * which the API layer translates into per-vendor status flips. That
 * flip-and-restore is owned by the API endpoint, not this engine.
 */

// ─── Pure date math ────────────────────────────────────────────────────────

interface ScheduleInput {
  pattern: VendorSchedulePattern;
  /** 0-6 (Sunday-Saturday). Required for `weekly`, `biweekly_*`. */
  dayOfWeek?: number | null;
  /** 1-31. Required for `monthly_date`. */
  dayOfMonth?: number | null;
  /** "first_tuesday" | "second_tuesday" | ... required for monthly_nth_day. */
  nthWeekday?: string | null;
  /** "HH:MM[:SS]" local time — appended to each generated date. */
  scheduleTime?: string | null;
  /** Explicit list of dates for `custom`. */
  customDates?: string[] | null;
}

const NTH_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseNthWeekday(nthWeekday: string): { nth: number; dow: number } | null {
  const [nthWord, dowWord] = nthWeekday.toLowerCase().split('_');
  const nth = NTH_WORDS[nthWord];
  const dow = WEEKDAY_INDEX[dowWord];
  if (nth === undefined || dow === undefined) return null;
  return { nth, dow };
}

/** Apply HH:MM[:SS] to a date (which arrives as midnight UTC). Falls back to 09:00 if not provided. */
function withTime(d: Date, hhmmss: string | null | undefined): Date {
  const t = hhmmss ?? '09:00:00';
  const [h, m, s] = t.split(':').map((p) => parseInt(p, 10));
  const out = new Date(d);
  out.setUTCHours(h || 0, m || 0, s || 0, 0);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Sunday-anchored ISO week number (1-53), used for biweekly even/odd. */
function weekOfYear(d: Date): number {
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Compute the upcoming visit datetimes for a vendor over the given
 * horizon. Pure function — no DB access, no clock dependency beyond
 * the `now` parameter. Returns timestamps with the vendor's local time
 * applied.
 *
 * Caller is responsible for passing valid pattern fields (e.g. `dayOfWeek`
 * for weekly patterns). Returns an empty array on invalid input rather
 * than throwing — the worker shouldn't crash on a single bad row.
 */
export function computeNextVisits(input: ScheduleInput, now: Date, horizonDays: number): Date[] {
  if (horizonDays <= 0) return [];
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizon = addDays(start, horizonDays);
  const out: Date[] = [];

  switch (input.pattern) {
    case 'weekly': {
      if (input.dayOfWeek == null) return [];
      let cursor = new Date(start);
      // Advance cursor to the first occurrence of dayOfWeek on/after `now`.
      const offset = (input.dayOfWeek - cursor.getUTCDay() + 7) % 7;
      cursor = addDays(cursor, offset);
      while (cursor < horizon) {
        out.push(withTime(cursor, input.scheduleTime));
        cursor = addDays(cursor, 7);
      }
      return out;
    }

    case 'biweekly_even':
    case 'biweekly_odd': {
      if (input.dayOfWeek == null) return [];
      const wantEven = input.pattern === 'biweekly_even';
      let cursor = new Date(start);
      const offset = (input.dayOfWeek - cursor.getUTCDay() + 7) % 7;
      cursor = addDays(cursor, offset);
      while (cursor < horizon) {
        const isEven = weekOfYear(cursor) % 2 === 0;
        if (isEven === wantEven) out.push(withTime(cursor, input.scheduleTime));
        cursor = addDays(cursor, 7);
      }
      return out;
    }

    case 'monthly_date': {
      if (input.dayOfMonth == null) return [];
      const dom = input.dayOfMonth;
      // Try the current month + the next ceil(horizonDays/28)+1 months
      const months = Math.ceil(horizonDays / 28) + 1;
      for (let i = 0; i < months; i++) {
        const candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, dom));
        if (candidate.getUTCMonth() !== (start.getUTCMonth() + i) % 12) continue; // overflow (e.g. Feb 30)
        if (candidate >= start && candidate < horizon) {
          out.push(withTime(candidate, input.scheduleTime));
        }
      }
      return out;
    }

    case 'monthly_nth_day': {
      if (!input.nthWeekday) return [];
      const parsed = parseNthWeekday(input.nthWeekday);
      if (!parsed) return [];
      const { nth, dow } = parsed;
      const months = Math.ceil(horizonDays / 28) + 1;
      for (let i = 0; i < months; i++) {
        const yr = start.getUTCFullYear();
        const mo = start.getUTCMonth() + i;
        const firstOfMonth = new Date(Date.UTC(yr, mo, 1));
        // Advance to first occurrence of dow in the month
        const firstOffset = (dow - firstOfMonth.getUTCDay() + 7) % 7;
        let candidate: Date;
        if (nth === -1) {
          // Last weekday of month: go to last day, then walk back
          const lastOfMonth = new Date(Date.UTC(yr, mo + 1, 0));
          const lastOffset = (lastOfMonth.getUTCDay() - dow + 7) % 7;
          candidate = addDays(lastOfMonth, -lastOffset);
        } else {
          candidate = addDays(firstOfMonth, firstOffset + (nth - 1) * 7);
          if (candidate.getUTCMonth() !== firstOfMonth.getUTCMonth()) continue;
        }
        if (candidate >= start && candidate < horizon) {
          out.push(withTime(candidate, input.scheduleTime));
        }
      }
      return out;
    }

    case 'quarterly': {
      // Spec is loose here ("specific months and dates"). For Phase 1 we
      // anchor to dayOfMonth + every 3rd month from the current month.
      // Customers who need richer quarterly logic can use 'custom'.
      if (input.dayOfMonth == null) return [];
      const dom = input.dayOfMonth;
      const months = Math.ceil(horizonDays / 28) + 4;
      for (let i = 0; i < months; i += 3) {
        const candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, dom));
        if (candidate.getUTCMonth() !== (start.getUTCMonth() + i) % 12) continue;
        if (candidate >= start && candidate < horizon) {
          out.push(withTime(candidate, input.scheduleTime));
        }
      }
      return out;
    }

    case 'custom': {
      if (!input.customDates) return [];
      for (const ds of input.customDates) {
        // ds is YYYY-MM-DD per the date[] column type
        const [yr, mo, dy] = ds.split('-').map((p) => parseInt(p, 10));
        const candidate = new Date(Date.UTC(yr, mo - 1, dy));
        if (candidate >= start && candidate < horizon) {
          out.push(withTime(candidate, input.scheduleTime));
        }
      }
      return out;
    }

    default: {
      // Exhaustiveness guard. If the union widens later, this catches it.
      const _exhaustive: never = input.pattern;
      void _exhaustive;
      return [];
    }
  }
}

// ─── DB sync (idempotent) ──────────────────────────────────────────────────

/**
 * For every active recurring vendor, generate the next `horizonDays` of
 * visits and insert any rows that don't yet exist. Idempotent — if the
 * worker runs twice in a row, the second run is a no-op.
 *
 * Idempotency strategy: for each computed visit datetime, check whether
 * a vendor_visit row already exists for the same (recurringVendorId,
 * scheduledAt) tuple. If yes, skip. If no, insert.
 *
 * Returns aggregate counts for observability.
 */
export async function generateUpcomingVisits(options: {
  horizonDays?: number;
  now?: Date;
} = {}): Promise<{ vendorsScanned: number; visitsCreated: number; vendorsSkipped: number }> {
  const horizonDays = options.horizonDays ?? 30;
  const now = options.now ?? new Date();

  const activeVendors: RecurringVendor[] = await db
    .select()
    .from(recurringVendors)
    .where(eq(recurringVendors.status, 'active'));

  let visitsCreated = 0;
  let vendorsSkipped = 0;

  for (const vendor of activeVendors) {
    // Defensive: skip vendors whose schedule is incomplete. Better to
    // skip than throw — a single bad row shouldn't take down the worker.
    const expected = computeNextVisits(
      {
        pattern: vendor.schedulePattern as VendorSchedulePattern,
        dayOfWeek: vendor.scheduleDayOfWeek,
        dayOfMonth: vendor.scheduleDayOfMonth,
        nthWeekday: vendor.scheduleNthWeekday,
        scheduleTime: vendor.scheduleTime,
        customDates: vendor.scheduleCustomDates,
      },
      now,
      horizonDays,
    );
    if (expected.length === 0) {
      vendorsSkipped++;
      continue;
    }

    // Pull existing scheduled_at values for this vendor in the horizon
    // so we can dedupe in JS (cheaper than per-row IF NOT EXISTS).
    const existing = await db
      .select({ scheduledAt: vendorVisits.scheduledAt })
      .from(vendorVisits)
      .where(
        and(
          eq(vendorVisits.recurringVendorId, vendor.id),
          gte(vendorVisits.scheduledAt, now),
        ),
      );
    const existingSet = new Set(existing.map((r) => r.scheduledAt.toISOString()));

    const toInsert = expected.filter((d) => !existingSet.has(d.toISOString()));
    if (toInsert.length === 0) continue;

    await db.insert(vendorVisits).values(
      toInsert.map((scheduledAt) => ({
        recurringVendorId: vendor.id,
        scheduledAt,
        status: 'scheduled' as const,
      })),
    );

    visitsCreated += toInsert.length;
  }

  logger.info(
    { vendorsScanned: activeVendors.length, visitsCreated, vendorsSkipped, horizonDays },
    '[vendor-schedule-engine] upcoming visits generated',
  );

  return {
    vendorsScanned: activeVendors.length,
    visitsCreated,
    vendorsSkipped,
  };
}

/** Mostly here so the cron worker has a stable named entry point. */
export async function runScheduleTick(): Promise<void> {
  try {
    await generateUpcomingVisits();
  } catch (err) {
    logger.error({ err }, '[vendor-schedule-engine] tick failed');
  }
}

// Suppress the unused-import warning on `sql` if no other code-path uses it.
// Keep around for future windowed-query optimization.
void sql;
