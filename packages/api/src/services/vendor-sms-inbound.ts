import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { recurringVendors, type VendorVisit, type RecurringVendor } from '../db/schema/recurring-vendors';
import { completeVisit } from './vendor-visit-orchestrator';
import * as vendorVisitsSvc from './vendor-visits';
import logger from '../logger';

/**
 * Inbound vendor SMS handling (Membership Phase 1, Session 4).
 *
 * When a vendor receives our reminder SMS (24h before visit) or
 * completion SMS (after visit), they reply with a short keyword:
 *
 *   YES / Y / CONFIRM    → confirm the upcoming visit (status='confirmed')
 *   DONE / COMPLETE      → mark the visit as completed (auto-pay fires
 *                          if the vendor's auto_pay_rule allows)
 *   STOP                 → opt-out (handled by Twilio at the carrier
 *                          level; we record but don't act)
 *   anything else        → log + ignore (no auto-reply)
 *
 * The webhook is unauth (vendors don't have Homie accounts). Trust comes
 * from the Twilio signature header validated upstream.
 *
 * Matching logic — given the sender phone, find the vendor whose
 * `vendor_phone` matches (E.164-normalized) and the most recent visit
 * that the keyword would apply to. If multiple vendors share a phone,
 * we pick the most recently active relationship and log a warning.
 */

// ─── Phone normalization (matches services/notifications.ts) ───────────────

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

// ─── Keyword classification ────────────────────────────────────────────────

export type InboundIntent = 'confirm' | 'complete' | 'stop' | 'unknown';

const CONFIRM_WORDS = new Set(['YES', 'Y', 'CONFIRM', 'CONFIRMED', 'OK', 'OKAY']);
const COMPLETE_WORDS = new Set(['DONE', 'DID', 'COMPLETE', 'COMPLETED', 'FINISHED']);
const STOP_WORDS = new Set(['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);

export function classifyInbound(rawBody: string): InboundIntent {
  const first = rawBody.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z]/g, '');
  if (!first) return 'unknown';
  if (CONFIRM_WORDS.has(first)) return 'confirm';
  if (COMPLETE_WORDS.has(first)) return 'complete';
  if (STOP_WORDS.has(first)) return 'stop';
  return 'unknown';
}

// ─── Vendor + visit lookup ─────────────────────────────────────────────────

async function findVendorByPhone(phoneE164: string): Promise<RecurringVendor | null> {
  // Match against the normalized stored phone. If multiple vendors share a
  // phone (rare — same vendor relationship across multiple homeowners or
  // duplicate setup), we pick the most recently active one.
  const rows = await db
    .select()
    .from(recurringVendors)
    .where(
      and(
        eq(recurringVendors.vendorPhone, phoneE164),
        eq(recurringVendors.status, 'active'),
      ),
    )
    .orderBy(desc(recurringVendors.updatedAt))
    .limit(2);
  if (rows.length > 1) {
    logger.warn(
      { phone: phoneE164, vendorIds: rows.map((r) => r.id) },
      '[vendor-sms-inbound] multiple vendors share this phone; picking most recently updated',
    );
  }
  return rows[0] ?? null;
}

/** Find the visit a keyword applies to. Confirm targets the next
 *  upcoming visit in `confirmation_sent` or `scheduled` state. Complete
 *  targets the most recent past visit in `confirmation_sent` /
 *  `confirmed` state, or a still-`scheduled` visit whose scheduled_at
 *  has passed. */
async function findApplicableVisit(
  vendorId: string,
  intent: 'confirm' | 'complete',
  now: Date,
): Promise<VendorVisit | null> {
  if (intent === 'confirm') {
    // Soonest upcoming visit. Include `confirmed` so the caller can
    // detect "already confirmed" idempotently rather than reporting
    // no_applicable_visit. Excludes terminal states.
    const upcoming = await vendorVisitsSvc.findUpcomingForVendor(vendorId, { now });
    return (
      upcoming.find(
        (v) => v.status === 'scheduled' || v.status === 'confirmation_sent' || v.status === 'confirmed',
      ) ?? null
    );
  }

  // intent === 'complete' — most recent visit whose scheduled_at <= now
  // and that's still in a non-terminal state.
  const all = await vendorVisitsSvc.findByVendorId(vendorId);
  return (
    all.find((v) =>
      v.scheduledAt <= now &&
      (v.status === 'scheduled' || v.status === 'confirmation_sent' || v.status === 'confirmed'),
    ) ?? null
  );
}

// ─── Public entrypoint — called from the route handler ────────────────────

export interface InboundResult {
  ok: boolean;
  intent: InboundIntent;
  /** Set when we acted on a visit (confirmed or completed it). */
  visitId?: string;
  /** When `intent === 'complete'`, did the orchestrator try to auto-pay? */
  paymentTriggered?: boolean;
  /** Reason we didn't act, if applicable (for telemetry; never sent to vendor). */
  reason?: string;
}

export async function handleInboundVendorSms(params: {
  fromPhone: string;
  body: string;
  now?: Date;
}): Promise<InboundResult> {
  const now = params.now ?? new Date();
  const intent = classifyInbound(params.body);

  if (intent === 'unknown') {
    logger.info({ from: params.fromPhone, body: params.body }, '[vendor-sms-inbound] unknown keyword; ignored');
    return { ok: true, intent, reason: 'unknown_keyword' };
  }
  if (intent === 'stop') {
    // Twilio handles the carrier-level STOP enforcement; we just log.
    logger.info({ from: params.fromPhone }, '[vendor-sms-inbound] STOP received; carrier-level opt-out');
    return { ok: true, intent };
  }

  const phoneE164 = normalizePhone(params.fromPhone);
  const vendor = await findVendorByPhone(phoneE164);
  if (!vendor) {
    logger.warn({ phone: phoneE164 }, '[vendor-sms-inbound] no active vendor for this phone');
    return { ok: false, intent, reason: 'unknown_vendor' };
  }

  const visit = await findApplicableVisit(vendor.id, intent, now);
  if (!visit) {
    logger.info(
      { vendorId: vendor.id, intent },
      '[vendor-sms-inbound] no applicable visit for keyword',
    );
    return { ok: false, intent, reason: 'no_applicable_visit' };
  }

  if (intent === 'confirm') {
    if (visit.status === 'confirmed') {
      // Idempotent: already confirmed
      return { ok: true, intent, visitId: visit.id, reason: 'already_confirmed' };
    }
    await vendorVisitsSvc.updateStatus(visit.id, 'confirmed');
    logger.info({ vendorId: vendor.id, visitId: visit.id }, '[vendor-sms-inbound] visit confirmed via SMS');
    return { ok: true, intent, visitId: visit.id };
  }

  // intent === 'complete'
  // Use the visit's recorded amount if completion didn't supply a new one;
  // for the SMS path the vendor is just confirming "I did the work" — the
  // schedule's standing amount is what we charge.
  const amountChargedCents = visit.amountChargedCents ?? vendor.amountCents;
  const result = await completeVisit({
    visitId: visit.id,
    amountChargedCents,
  });
  logger.info(
    {
      vendorId: vendor.id,
      visitId: visit.id,
      paymentTriggered: result.paymentTriggered,
      paymentReason: result.paymentReason,
    },
    '[vendor-sms-inbound] visit completed via SMS',
  );
  return {
    ok: true,
    intent,
    visitId: visit.id,
    paymentTriggered: result.paymentTriggered,
  };
}
