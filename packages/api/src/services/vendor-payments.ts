import Stripe from 'stripe';
import { eq, and, gte, lt, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  vendorPayments,
  recurringVendors,
  vendorVisits,
  type VendorPayment,
  type NewVendorPayment,
  VENDOR_PAYMENT_METHODS,
  VENDOR_PAYMENT_STATUSES,
} from '../db/schema/recurring-vendors';
import { homeowners } from '../db/schema/homeowners';
import logger from '../logger';

/**
 * Data access for `vendor_payments` (Membership Phase 1).
 *
 * No business logic here — Stripe Connect transfers, fee math, and the
 * auto-pay trigger on visit-completion all live in Session 3+. The
 * stripe_payment_intent_id and stripe_transfer_id columns sit empty
 * until then.
 *
 * `listForHomeownerYear` is provided early so the year-end tax export
 * (Phase 1 deliverable per CLAUDE-MEMBERSHIP.md) has a query to call —
 * it joins through recurring_vendors to filter by homeowner_id.
 */

export class VendorPaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VendorPaymentValidationError';
  }
}

function validateOnWrite(input: Partial<NewVendorPayment>): void {
  if (input.paymentMethod !== undefined && input.paymentMethod !== null) {
    if (!(VENDOR_PAYMENT_METHODS as readonly string[]).includes(input.paymentMethod)) {
      throw new VendorPaymentValidationError(
        `Invalid payment_method: "${input.paymentMethod}". Allowed: ${VENDOR_PAYMENT_METHODS.join(', ')}`,
      );
    }
  }
  if (input.status !== undefined && input.status !== null) {
    if (!(VENDOR_PAYMENT_STATUSES as readonly string[]).includes(input.status)) {
      throw new VendorPaymentValidationError(
        `Invalid status: "${input.status}". Allowed: ${VENDOR_PAYMENT_STATUSES.join(', ')}`,
      );
    }
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<VendorPayment | null> {
  const [row] = await db
    .select()
    .from(vendorPayments)
    .where(eq(vendorPayments.id, id))
    .limit(1);
  return row ?? null;
}

/** All payments tied to a single visit. Typically 0 or 1 row, but
 *  retries / refunds may produce more. Newest first. */
export async function findByVisitId(vendorVisitId: string): Promise<VendorPayment[]> {
  return db
    .select()
    .from(vendorPayments)
    .where(eq(vendorPayments.vendorVisitId, vendorVisitId))
    .orderBy(desc(vendorPayments.createdAt));
}

/** All payments for a recurring_vendor, newest first. */
export async function findByVendorId(recurringVendorId: string): Promise<VendorPayment[]> {
  return db
    .select()
    .from(vendorPayments)
    .where(eq(vendorPayments.recurringVendorId, recurringVendorId))
    .orderBy(desc(vendorPayments.createdAt));
}

/**
 * All payments made by a homeowner in a given calendar year, across
 * all of their recurring vendors. Drives the year-end tax export.
 *
 * Filters to status='succeeded' so failed/pending/refunded charges
 * don't show up on a tax report. Joins through recurring_vendors to
 * resolve homeowner_id (vendor_payments has no direct homeowner_id
 * column — intentionally; one less denormalized field to keep in sync).
 */
export async function listForHomeownerYear(
  homeownerId: string,
  year: number,
): Promise<VendorPayment[]> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  // Two-step query (vendor IDs first, then payments) instead of a single
  // join. Matches the codebase's existing style — most route handlers
  // here do the same shape rather than Drizzle's `db.select().from(...)
  // .leftJoin(...)`. Both shapes work; the two-step is easier to read.
  const vendors = await db
    .select({ id: recurringVendors.id })
    .from(recurringVendors)
    .where(eq(recurringVendors.homeownerId, homeownerId));
  const vendorIds = vendors.map((v) => v.id);
  if (vendorIds.length === 0) return [];

  return db
    .select()
    .from(vendorPayments)
    .where(
      and(
        inArray(vendorPayments.recurringVendorId, vendorIds),
        eq(vendorPayments.status, 'succeeded'),
        gte(vendorPayments.createdAt, yearStart),
        lt(vendorPayments.createdAt, yearEnd),
      ),
    )
    .orderBy(desc(vendorPayments.createdAt));
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function create(input: NewVendorPayment): Promise<VendorPayment> {
  validateOnWrite(input);
  const [row] = await db.insert(vendorPayments).values(input).returning();
  if (!row) throw new Error('Insert returned no row');
  return row;
}

// ─── Fee math (per CLAUDE-MEMBERSHIP.md "Vendor Payment Rails") ────────────
//
// Phase 1 implements card + ACH paths. Premier-tier "absorbed by
// subscription" math is a later-phase override (homeowner.membership_tier
// === 'premier' will route through a different path that zeros the
// member processing-fee surcharge).

export interface FeeBreakdown {
  /** Amount the homeowner is charged (visit + their share of processing). */
  memberChargedCents: number;
  /** Stripe's network fee on the homeowner charge. */
  processingFeeCents: number;
  /** Homie's cut (kept on platform balance). */
  homieTakeCents: number;
  /** Net to vendor (what we transfer via Connect). */
  netToVendorCents: number;
}

/**
 * Pure fee math. amountCents is the visit price the homeowner agreed to.
 * No DB or Stripe calls — easy to unit test.
 */
export function computeFees(
  amountCents: number,
  paymentMethod: 'card' | 'ach' | 'homie_credit',
): FeeBreakdown {
  if (amountCents <= 0) {
    throw new VendorPaymentValidationError(
      `amount_cents must be > 0, got ${amountCents}`,
    );
  }

  if (paymentMethod === 'card') {
    // Card: member pays visit + 2.9% + $0.30 processing surcharge.
    // Vendor gets visit × 98%. Homie keeps 2% (after Stripe's cut).
    const stripeProcessing = Math.round(amountCents * 0.029) + 30;
    const memberCharged = amountCents + stripeProcessing;
    const netToVendor = Math.round(amountCents * 0.98);
    const homieTake = amountCents - netToVendor;
    return {
      memberChargedCents: memberCharged,
      processingFeeCents: stripeProcessing,
      homieTakeCents: homieTake,
      netToVendorCents: netToVendor,
    };
  }

  if (paymentMethod === 'ach') {
    // ACH: member pays visit + 0.5% surcharge. Vendor gets visit × 99%.
    // Homie keeps 1.5% (after Stripe's ~0.8% ACH cut).
    const stripeProcessing = Math.round(amountCents * 0.005);
    const memberCharged = amountCents + stripeProcessing;
    const netToVendor = Math.round(amountCents * 0.99);
    const homieTake = amountCents - netToVendor;
    return {
      memberChargedCents: memberCharged,
      processingFeeCents: stripeProcessing,
      homieTakeCents: homieTake,
      netToVendorCents: netToVendor,
    };
  }

  // homie_credit — drawn from homeowner credit balance (add-on per spec).
  // No Stripe processing. Vendor gets visit × 99%, Homie keeps 1%.
  const netToVendor = Math.round(amountCents * 0.99);
  return {
    memberChargedCents: amountCents,
    processingFeeCents: 0,
    homieTakeCents: amountCents - netToVendor,
    netToVendorCents: netToVendor,
  };
}

// ─── processPayment — wires fee math + Stripe + DB ─────────────────────────

export class VendorPaymentProcessingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'visit_not_found'
      | 'visit_not_completed'
      | 'already_paid'
      | 'vendor_not_active'
      | 'vendor_no_connect_account'
      | 'no_amount'
      | 'no_payment_method'
      | 'homeowner_no_stripe_customer'
      | 'stripe_error',
  ) {
    super(message);
    this.name = 'VendorPaymentProcessingError';
  }
}

let _stripe: Stripe | null = null;
function getStripeClient(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    });
  }
  return _stripe;
}

/**
 * End-to-end payment flow for a completed vendor visit.
 *
 * Idempotent: if the visit already has a `payment_id`, returns the
 * existing payment without re-charging. Stripe-side calls also use
 * idempotency keys derived from visit/payment IDs so a retry mid-flight
 * doesn't duplicate side effects.
 *
 * Strategy: destination charge with application_fee_amount.
 * Stripe creates the PaymentIntent against the homeowner's saved
 * payment method and automatically transfers (amount - fee) to the
 * vendor's Connect account in one operation.
 *
 * Called by the (Session 3+) auto-pay worker when a vendor_visit
 * transitions to 'completed' and the auto_pay_rule fires.
 */
export async function processPayment(visitId: string): Promise<VendorPayment> {
  const [visit] = await db
    .select()
    .from(vendorVisits)
    .where(eq(vendorVisits.id, visitId))
    .limit(1);
  if (!visit) {
    throw new VendorPaymentProcessingError(
      `vendor_visit ${visitId} not found`,
      'visit_not_found',
    );
  }
  if (visit.status !== 'completed') {
    throw new VendorPaymentProcessingError(
      `vendor_visit ${visitId} is in status '${visit.status}', must be 'completed' to charge`,
      'visit_not_completed',
    );
  }
  if (visit.paymentId) {
    // Already paid — return existing row idempotently.
    const [existing] = await db
      .select()
      .from(vendorPayments)
      .where(eq(vendorPayments.id, visit.paymentId))
      .limit(1);
    if (existing) return existing;
  }
  if (!visit.amountChargedCents || visit.amountChargedCents <= 0) {
    throw new VendorPaymentProcessingError(
      `vendor_visit ${visitId} has no amount_charged_cents`,
      'no_amount',
    );
  }

  const [vendor] = await db
    .select()
    .from(recurringVendors)
    .where(eq(recurringVendors.id, visit.recurringVendorId))
    .limit(1);
  if (!vendor) {
    throw new VendorPaymentProcessingError(
      `recurring_vendor ${visit.recurringVendorId} not found`,
      'visit_not_found',
    );
  }
  if (vendor.status !== 'active') {
    throw new VendorPaymentProcessingError(
      `recurring_vendor ${vendor.id} is not active (status='${vendor.status}'); skip payment`,
      'vendor_not_active',
    );
  }
  if (!vendor.stripeConnectAccountId) {
    throw new VendorPaymentProcessingError(
      `recurring_vendor ${vendor.id} has no Connect account; vendor must finish onboarding`,
      'vendor_no_connect_account',
    );
  }
  if (!vendor.paymentMethodId) {
    throw new VendorPaymentProcessingError(
      `recurring_vendor ${vendor.id} has no homeowner payment_method_id stored`,
      'no_payment_method',
    );
  }

  // Tip is not transferred to the vendor through Stripe in this flow —
  // tips are handled separately (out of Phase 1 scope). For now, the
  // base charge is the visit amount; tips will be added later as a
  // second transfer or stored-credit credit.
  const totalForVendor = visit.amountChargedCents;
  const method = vendor.paymentMethod as 'card' | 'ach' | 'homie_credit';
  const fees = computeFees(totalForVendor, method);

  const [homeowner] = await db
    .select({ id: homeowners.id, stripeCustomerId: homeowners.stripeCustomerId })
    .from(homeowners)
    .where(eq(homeowners.id, vendor.homeownerId))
    .limit(1);
  if (!homeowner?.stripeCustomerId) {
    throw new VendorPaymentProcessingError(
      `homeowner ${vendor.homeownerId} has no Stripe customer; create one before charging`,
      'homeowner_no_stripe_customer',
    );
  }

  // Insert the vendor_payments row first in 'pending' state so we have
  // a stable ID for idempotency keys and webhook routing. If Stripe
  // throws, the row stays in 'pending' / gets flipped to 'failed' below.
  const [paymentRow] = await db
    .insert(vendorPayments)
    .values({
      vendorVisitId: visit.id,
      recurringVendorId: vendor.id,
      amountCents: fees.memberChargedCents,
      processingFeeCents: fees.processingFeeCents,
      homieTakeCents: fees.homieTakeCents,
      netToVendorCents: fees.netToVendorCents,
      paymentMethod: method,
      status: 'processing',
    })
    .returning();
  if (!paymentRow) throw new Error('Insert returned no row');

  let intent: Stripe.PaymentIntent;
  try {
    intent = await getStripeClient().paymentIntents.create(
      {
        amount: fees.memberChargedCents,
        currency: 'usd',
        customer: homeowner.stripeCustomerId,
        payment_method: vendor.paymentMethodId,
        off_session: true,
        confirm: true,
        // Destination charge: Stripe auto-transfers the post-fee amount
        // to the vendor's Connect account.
        transfer_data: { destination: vendor.stripeConnectAccountId },
        application_fee_amount: fees.homieTakeCents + fees.processingFeeCents,
        transfer_group: `visit:${visit.id}`,
        metadata: {
          homie_vendor_payment_id: paymentRow.id,
          homie_vendor_visit_id: visit.id,
          homie_recurring_vendor_id: vendor.id,
          homie_homeowner_id: vendor.homeownerId,
        },
      },
      { idempotencyKey: `vendor-payment:${paymentRow.id}` },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, visitId, paymentId: paymentRow.id },
      '[vendor-payments] Stripe PaymentIntent create failed',
    );
    await db
      .update(vendorPayments)
      .set({ status: 'failed', failureReason: message, processedAt: new Date() })
      .where(eq(vendorPayments.id, paymentRow.id));
    throw new VendorPaymentProcessingError(
      `Stripe error: ${message}`,
      'stripe_error',
    );
  }

  // PaymentIntent succeeded synchronously (off_session + confirm:true).
  // Update DB rows: payment row → succeeded, visit → payment_id linked,
  // vendor YTD increments. The transfer_id isn't returned directly on a
  // destination charge; the related Transfer is fetched via the
  // PaymentIntent's `latest_charge.transfer` if needed (deferred —
  // Stripe will fire `transfer.created` and we'll record it in the
  // webhook).
  const [updatedPayment] = await db
    .update(vendorPayments)
    .set({
      status: 'succeeded',
      stripePaymentIntentId: intent.id,
      processedAt: new Date(),
    })
    .where(eq(vendorPayments.id, paymentRow.id))
    .returning();

  await db
    .update(vendorVisits)
    .set({ paymentId: paymentRow.id, updatedAt: new Date() })
    .where(eq(vendorVisits.id, visit.id));

  await db
    .update(recurringVendors)
    .set({
      totalPaidYtdCents: sql`${recurringVendors.totalPaidYtdCents} + ${fees.netToVendorCents}`,
      updatedAt: new Date(),
    })
    .where(eq(recurringVendors.id, vendor.id));

  logger.info(
    {
      visitId: visit.id,
      paymentId: updatedPayment?.id,
      vendorId: vendor.id,
      memberChargedCents: fees.memberChargedCents,
      netToVendorCents: fees.netToVendorCents,
      homieTakeCents: fees.homieTakeCents,
    },
    '[vendor-payments] payment succeeded',
  );

  return updatedPayment ?? paymentRow;
}
