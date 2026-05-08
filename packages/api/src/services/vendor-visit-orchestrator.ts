import { eq } from 'drizzle-orm';
import { db } from '../db';
import { recurringVendors, vendorVisits, type VendorVisit } from '../db/schema/recurring-vendors';
import { processPayment } from './vendor-payments';
import logger from '../logger';

/**
 * Vendor Visit Orchestrator — Membership Phase 1, Session 3.
 *
 * The "what happens when a visit moves to completed" business logic.
 * Sits on top of the data-access functions in services/vendor-visits.ts;
 * those just CRUD rows. This file decides what to DO when status flips.
 *
 * Flow when a visit completes:
 *   1. Persist completion (status='completed', completed_at, optional
 *      photo/notes/amount_charged_cents).
 *   2. Look up the vendor's auto_pay_rule:
 *        'always'              → call processPayment immediately
 *        'if_under_threshold'  → call processPayment iff amount <= threshold
 *        'manual_approval'     → leave payment pending; member must approve
 *   3. Return both the updated visit and (if processed) the payment row,
 *      so the API endpoint can return both shapes to the caller.
 *
 * Errors in payment processing don't roll back the completion — a visit
 * is "done" regardless of whether we successfully charged. The payment
 * row's `status='failed'` carries the error forward; ops can re-run.
 */

export interface CompletionResult {
  visit: VendorVisit;
  paymentTriggered: boolean;
  paymentReason: 'always' | 'under_threshold' | 'over_threshold' | 'manual_approval' | 'no_amount';
  paymentError?: string;
}

export async function completeVisit(params: {
  visitId: string;
  amountChargedCents: number;
  completionPhotoUrl?: string | null;
  completionNotes?: string | null;
  tipCents?: number;
}): Promise<CompletionResult> {
  // Stamp completion. Even if we already have status='completed' (idempotent
  // re-call), update fields the caller is providing — they may be revising
  // the photo/notes after the fact.
  const [updatedVisit] = await db
    .update(vendorVisits)
    .set({
      status: 'completed',
      completedAt: new Date(),
      amountChargedCents: params.amountChargedCents,
      completionPhotoUrl: params.completionPhotoUrl ?? null,
      completionNotes: params.completionNotes ?? null,
      tipCents: params.tipCents ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(vendorVisits.id, params.visitId))
    .returning();

  if (!updatedVisit) {
    throw new Error(`vendor_visit ${params.visitId} not found`);
  }

  // Decide whether to trigger payment. Re-load the vendor inside this
  // function rather than caching from the request — auto_pay_rule may
  // have changed since the schedule was generated.
  const [vendor] = await db
    .select({
      autoPayRule: recurringVendors.autoPayRule,
      autoPayThresholdCents: recurringVendors.autoPayThresholdCents,
    })
    .from(recurringVendors)
    .where(eq(recurringVendors.id, updatedVisit.recurringVendorId))
    .limit(1);

  if (!vendor) {
    return {
      visit: updatedVisit,
      paymentTriggered: false,
      paymentReason: 'no_amount',
      paymentError: 'recurring_vendor_missing',
    };
  }

  if (!params.amountChargedCents || params.amountChargedCents <= 0) {
    return {
      visit: updatedVisit,
      paymentTriggered: false,
      paymentReason: 'no_amount',
    };
  }

  let shouldProcess = false;
  let reason: CompletionResult['paymentReason'] = 'manual_approval';

  if (vendor.autoPayRule === 'always') {
    shouldProcess = true;
    reason = 'always';
  } else if (vendor.autoPayRule === 'if_under_threshold') {
    const threshold = vendor.autoPayThresholdCents ?? 20000; // spec default $200
    if (params.amountChargedCents <= threshold) {
      shouldProcess = true;
      reason = 'under_threshold';
    } else {
      shouldProcess = false;
      reason = 'over_threshold';
    }
  } else if (vendor.autoPayRule === 'manual_approval') {
    shouldProcess = false;
    reason = 'manual_approval';
  }

  if (!shouldProcess) {
    logger.info(
      { visitId: params.visitId, autoPayRule: vendor.autoPayRule, reason },
      '[visit-orchestrator] visit completed; payment NOT auto-triggered',
    );
    return { visit: updatedVisit, paymentTriggered: false, paymentReason: reason };
  }

  try {
    await processPayment(params.visitId);
    logger.info(
      { visitId: params.visitId, reason },
      '[visit-orchestrator] visit completed + payment processed',
    );
    return { visit: updatedVisit, paymentTriggered: true, paymentReason: reason };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, visitId: params.visitId },
      '[visit-orchestrator] visit completed but payment failed',
    );
    return {
      visit: updatedVisit,
      paymentTriggered: false,
      paymentReason: reason,
      paymentError: message,
    };
  }
}

/**
 * Member-initiated manual approval after a visit completed under
 * auto_pay_rule='manual_approval' (or auto-pay declined for some reason).
 * Just calls processPayment; the result is the same as the auto-pay path.
 */
export async function approvePayment(visitId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await processPayment(visitId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
