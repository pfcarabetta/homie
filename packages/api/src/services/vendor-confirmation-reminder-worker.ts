import { eq, and, lt, isNull, gte } from 'drizzle-orm';
import { db } from '../db';
import { vendorVisits, recurringVendors } from '../db/schema/recurring-vendors';
import { homeownerProperties } from '../db/schema/homeowner-properties';
import { sendSms } from './notifications';
import logger from '../logger';

/**
 * Vendor Confirmation Reminder Worker — Membership Phase 1, Session 3.
 *
 * Every 30 minutes, scans for `vendor_visits` rows that are:
 *   - status = 'scheduled' (not yet sent)
 *   - scheduled_at within the next 24 hours
 *   - confirmation_sent_at IS NULL (idempotency guard)
 *
 * For each match, sends an SMS to the vendor with a tap-to-confirm link
 * (placeholder URL for now — confirmation/completion endpoints are wired
 * separately in routes/vendors.ts) and flips the visit to
 * `confirmation_sent`.
 *
 * Idempotent: the `confirmation_sent_at IS NULL` predicate ensures we
 * never double-send. If SMS sending fails for one row, the others
 * still go through (we don't fail-fast on the batch).
 *
 * Worker pattern matches services/sms-notes-timeout-worker.ts —
 * setInterval rather than cron because the cadence (every 30min) is
 * naturally interval-shaped and we want immediate boot-up runs.
 */

const TICK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STARTUP_DELAY_MS = 45 * 1000; // 45s — let server fully boot
const REMINDER_LEAD_HOURS = 24;

interface VisitToConfirm {
  visitId: string;
  scheduledAt: Date;
  vendorPhone: string | null;
  vendorName: string;
  propertyAddress: string | null;
}

export async function findVisitsNeedingConfirmation(now: Date = new Date()): Promise<VisitToConfirm[]> {
  const horizon = new Date(now.getTime() + REMINDER_LEAD_HOURS * 60 * 60 * 1000);

  // Join visit → vendor → property so we can compose the SMS in one query.
  const rows = await db
    .select({
      visitId: vendorVisits.id,
      scheduledAt: vendorVisits.scheduledAt,
      vendorPhone: recurringVendors.vendorPhone,
      vendorName: recurringVendors.vendorName,
      propertyAddress: homeownerProperties.address,
      visitStatus: vendorVisits.status,
      confirmationSentAt: vendorVisits.confirmationSentAt,
      vendorStatus: recurringVendors.status,
    })
    .from(vendorVisits)
    .innerJoin(recurringVendors, eq(vendorVisits.recurringVendorId, recurringVendors.id))
    .innerJoin(homeownerProperties, eq(recurringVendors.homeownerPropertyId, homeownerProperties.id))
    .where(
      and(
        eq(vendorVisits.status, 'scheduled'),
        isNull(vendorVisits.confirmationSentAt),
        gte(vendorVisits.scheduledAt, now),
        lt(vendorVisits.scheduledAt, horizon),
        eq(recurringVendors.status, 'active'),
      ),
    );

  return rows.map((r) => ({
    visitId: r.visitId,
    scheduledAt: r.scheduledAt,
    vendorPhone: r.vendorPhone,
    vendorName: r.vendorName,
    propertyAddress: r.propertyAddress,
  }));
}

export async function sendConfirmationFor(visit: VisitToConfirm): Promise<{ sent: boolean; reason?: string }> {
  if (!visit.vendorPhone) {
    return { sent: false, reason: 'no_phone' };
  }
  const when = visit.scheduledAt.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const body =
    `Hi ${visit.vendorName} — quick reminder, you're scheduled at ` +
    `${visit.propertyAddress ?? 'the property'} ${when}. Reply YES to ` +
    `confirm. (After your visit, Homie will text again to charge — ` +
    `tap to confirm completion.)`;

  try {
    await sendSms(visit.vendorPhone, body);
  } catch (err) {
    logger.error({ err, visitId: visit.visitId }, '[confirmation-reminder] SMS send failed');
    return { sent: false, reason: 'sms_error' };
  }

  await db
    .update(vendorVisits)
    .set({
      status: 'confirmation_sent',
      confirmationSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vendorVisits.id, visit.visitId));

  return { sent: true };
}

export async function runReminderTick(now: Date = new Date()): Promise<{ scanned: number; sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  try {
    const visits = await findVisitsNeedingConfirmation(now);
    for (const v of visits) {
      const result = await sendConfirmationFor(v);
      if (result.sent) sent++;
      else skipped++;
    }
    logger.info({ scanned: visits.length, sent, skipped }, '[confirmation-reminder] tick complete');
    return { scanned: visits.length, sent, skipped };
  } catch (err) {
    logger.error({ err }, '[confirmation-reminder] tick failed');
    return { scanned: 0, sent, skipped };
  }
}

export function startVendorConfirmationReminderWorker(): void {
  logger.info(
    { intervalMs: TICK_INTERVAL_MS, leadHours: REMINDER_LEAD_HOURS },
    '[confirmation-reminder] starting worker',
  );

  setTimeout(() => {
    runReminderTick().catch((err) =>
      logger.error({ err }, '[confirmation-reminder] initial tick failed'),
    );
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    runReminderTick().catch((err) =>
      logger.error({ err }, '[confirmation-reminder] scheduled tick failed'),
    );
  }, TICK_INTERVAL_MS);
}
