import { Request, Response } from 'express';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { bookings } from '../db/schema/bookings';
import { workspaces } from '../db/schema/workspaces';
import { sendBookingNotifications, dispatchJob } from '../services/orchestration';
import { constructWebhookEvent } from '../services/stripe';
import { vendorPayments, recurringVendors } from '../db/schema/recurring-vendors';
import { markVendorActive } from '../services/vendor-confirmation';
import { homeowners } from '../db/schema/homeowners';

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(req.body as Buffer, sig);
  } catch (err) {
    logger.error({ err }, '[Stripe webhook] Signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  // ── Consumer job checkout completed ──
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Subscription checkout (business billing)
    if (session.mode === 'subscription' && session.metadata?.workspace_id) {
      const workspaceId = session.metadata.workspace_id;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.toString() ?? null;
      if (subscriptionId) {
        try {
          await db.update(workspaces).set({
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: 'active',
            trialEndsAt: null, // trial is over — they paid
            searchesUsed: 0, // reset usage counter for paid plan's fair-use window
            billingCycleStart: new Date(),
            updatedAt: new Date(),
          }).where(eq(workspaces.id, workspaceId));
          logger.info({ workspaceId, subscriptionId }, '[Stripe webhook] Workspace subscription activated (trial converted)');
        } catch (err) {
          logger.error({ err }, '[Stripe webhook] Failed to save subscription ID');
        }
      }
      res.status(200).json({ received: true });
      return;
    }

    // ── Consumer Membership subscription activated (Plus / Premier) ────
    // Phase 1, Session 6. The homeowner hit Stripe-hosted Checkout from
    // the Membership page; metadata identifies the homeowner_id + tier.
    // Flip the homeowner row's membership_tier + stripe_subscription_id
    // and stamp tier_started_at / tier_renews_at. Subsequent state is
    // managed by `customer.subscription.updated` / `.deleted` below.
    if (
      session.mode === 'subscription' &&
      session.metadata?.product === 'homeowner_membership' &&
      session.metadata?.homeowner_id
    ) {
      const homeownerId = session.metadata.homeowner_id;
      const tier = session.metadata.tier === 'premier' ? 'premier' : 'plus';
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.toString() ?? null;

      try {
        const now = new Date();
        // Pull the live subscription so we can stamp tier_renews_at
        // accurately. The Checkout session itself may not have it yet
        // depending on Stripe's timing; the subscription always does.
        let renewsAt: Date | null = null;
        if (subscriptionId) {
          const { getSubscription } = await import('../services/stripe');
          const sub = await getSubscription(subscriptionId) as Stripe.Subscription & { current_period_end?: number };
          renewsAt = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
        }
        await db
          .update(homeowners)
          .set({
            membershipTier: tier,
            stripeSubscriptionId: subscriptionId,
            tierStartedAt: now,
            tierRenewsAt: renewsAt,
            tierCancelsAt: null,
            membershipSource: 'direct_subscription',
          })
          .where(eq(homeowners.id, homeownerId));

        // Phase 2: seed the dispatch allowance bank with this period's
        // monthly grant so a brand-new Plus subscriber doesn't have to
        // wait until the 1st of next month for their first 3 dispatches.
        // Premier subscribers don't need a grant — they have unlimited
        // via the tier flag, so grantMonthly() is a no-op for them.
        if (tier === 'plus') {
          try {
            const { grantMonthly, periodKeyFor } = await import('../services/dispatch-allowance');
            const result = await grantMonthly({
              homeownerId,
              periodKey: periodKeyFor(now),
            });
            if (result.inserted) {
              logger.info(
                { homeownerId, granted: result.amountGranted, period: periodKeyFor(now) },
                '[Stripe webhook] Plus signup — dispatch allowance seeded',
              );
            }
          } catch (grantErr) {
            // Non-fatal — the monthly cron will catch up next tick.
            logger.warn({ err: grantErr, homeownerId }, '[Stripe webhook] Failed to seed allowance on Plus signup');
          }
        }
        logger.info(
          { homeownerId, tier, subscriptionId },
          '[Stripe webhook] Homeowner membership activated',
        );
      } catch (err) {
        logger.error({ err, homeownerId }, '[Stripe webhook] Failed to activate homeowner membership');
      }
      res.status(200).json({ received: true });
      return;
    }

    // ── Inspector pays wholesale at upload ─────────────────────────────
    // The inspector hit Stripe Checkout from the upload form. Flip the
    // report row from awaiting_payment → processing and trigger the
    // parser. Auto-email to the homeowner fires inside the parser when
    // it transitions to 'parsed'.
    if (session.metadata?.product === 'inspector_upload' && session.metadata?.report_id) {
      const reportId = session.metadata.report_id;
      try {
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

        const { inspectionReports } = await import('../db/schema/inspector');
        await db.update(inspectionReports).set({
          paymentStatus: 'paid',
          stripePaymentIntentId: paymentIntentId,
          parsingStatus: 'processing',
          updatedAt: new Date(),
        }).where(eq(inspectionReports.id, reportId));

        // Phase 2: if the inspector picked Premium AND the report is
        // already linked to a homeowner (rare at upload — usually the
        // homeowner claims later), grant the year-of-Plus bundle now.
        // The same hook fires from the homeowner-claim path below if
        // the linkage happens after upload — calling grantInspectPremiumBundle
        // is idempotent on the (homeowner_id, 'unlimited_grant', sourceId)
        // partial unique index so a duplicate call is a no-op.
        try {
          const [reportRow] = await db
            .select({
              homeownerId: inspectionReports.homeownerId,
              pricingTier: inspectionReports.pricingTier,
            })
            .from(inspectionReports)
            .where(eq(inspectionReports.id, reportId))
            .limit(1);
          if (reportRow?.homeownerId && reportRow.pricingTier === 'premium') {
            const { grantInspectPremiumBundle } = await import('../services/dispatch-allowance');
            const grant = await grantInspectPremiumBundle({
              homeownerId: reportRow.homeownerId,
              sourceId: `inspect_premium:${reportId}`,
            });
            if (grant.inserted) {
              logger.info(
                { reportId, homeownerId: reportRow.homeownerId, expiresAt: grant.expiresAt },
                '[Stripe webhook] Inspect Premium bundle activated — Plus year granted',
              );
            }
          }
        } catch (bundleErr) {
          logger.warn({ err: bundleErr, reportId }, '[Stripe webhook] Inspect Premium bundle grant failed (non-fatal)');
        }

        // The partner_referral_bonus is computed at read time — see
        // referralBonusCentsFor in services/pricing.ts. It's based on
        // referrerPartnerId + priceCentsPaid + paymentStatus='paid'
        // (which we just set above), so it'll surface in the
        // referrer's earnings the next time they load the page.

        // Fire the parser. Lazy-imported to avoid cycle with the
        // inspector route module that owns parseInspectionReportAsync.
        const { parseInspectionReportAsync } = await import('./inspector');
        void parseInspectionReportAsync(reportId).catch(err =>
          logger.error({ err, reportId }, '[Stripe webhook] inspector_upload parse failed'),
        );

        logger.info({ reportId, paymentIntentId }, '[Stripe webhook] inspector_upload paid → parsing');
      } catch (err) {
        logger.error({ err, reportId }, '[Stripe webhook] inspector_upload handler failed');
      }
      res.status(200).json({ received: true });
      return;
    }

    // Inspection report checkout — dispatch items after payment confirmed
    if (session.metadata?.report_id && session.metadata?.token) {
      try {
        const reportId = session.metadata.report_id;
        const token = session.metadata.token;
        const inspectorPartnerId = session.metadata.inspector_partner_id;
        // item_ids may be in metadata (legacy) or passed via frontend redirect
        const itemIdsCsv = session.metadata.item_ids ?? '';
        const itemIds = itemIdsCsv ? itemIdsCsv.split(',').filter(Boolean) : [];

        logger.info({ reportId, itemCount: itemIds.length || 'all' }, '[Stripe webhook] Inspection payment confirmed — dispatching items');

        // Import dispatch logic from inspector routes
        const { inspectionReportItems, inspectionReports, inspectorEarnings } = await import('../db/schema/inspector');
        const { sql: drizzleSql } = await import('drizzle-orm');

        // Get items to dispatch — pending_dispatch (from checkout) or fall back to undispatched
        let items;
        if (itemIds.length > 0) {
          items = await db.select().from(inspectionReportItems)
            .where(eq(inspectionReportItems.reportId, reportId));
          items = items.filter(i => itemIds.includes(i.id) && (i.dispatchStatus === 'not_dispatched' || i.dispatchStatus === 'pending_dispatch'));
        } else {
          // First try pending_dispatch (set during checkout)
          items = await db.select().from(inspectionReportItems)
            .where(eq(inspectionReportItems.reportId, reportId));
          const pending = items.filter(i => i.dispatchStatus === 'pending_dispatch');
          if (pending.length > 0) {
            items = pending;
          } else {
            items = items.filter(i => i.dispatchStatus === 'not_dispatched' && i.severity !== 'informational');
          }
        }

        const [report] = await db.select().from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);
        if (!report) { res.status(200).json({ received: true }); return; }

        // Record first action
        if (!report.clientFirstActionAt) {
          await db.update(inspectionReports).set({ clientFirstActionAt: new Date(), updatedAt: new Date() }).where(eq(inspectionReports.id, reportId));
        }

        let dispatchedCount = 0;
        for (const item of items) {
          try {
            const diagnosis = {
              category: item.category || 'general',
              severity: item.severity === 'safety_hazard' || item.severity === 'urgent' ? 'high' : item.severity === 'recommended' ? 'medium' : 'low',
              summary: `${item.title}${item.description ? '. ' + item.description : ''}`,
              recommendedActions: [`Address: ${item.title}`],
              source: 'inspection_report',
              inspectionReportId: reportId,
              inspectionItemId: item.id,
            };
            const budgetStr = item.aiCostEstimateLowCents && item.aiCostEstimateHighCents
              ? `$${Math.round(item.aiCostEstimateLowCents / 100)}-$${Math.round(item.aiCostEstimateHighCents / 100)}`
              : 'flexible';

            const [job] = await db.execute(drizzleSql`
              INSERT INTO jobs (id, homeowner_id, diagnosis, zip_code, preferred_timing, budget, tier, status, payment_status, expires_at, created_at, updated_at)
              VALUES (gen_random_uuid(), NULL, ${JSON.stringify(diagnosis)}::jsonb, ${report.propertyZip}, 'this_week', ${budgetStr}, 'standard', 'dispatching', 'paid', ${new Date(Date.now() + 24 * 60 * 60 * 1000)}, NOW(), NOW())
              RETURNING id
            `) as unknown as Array<{ id: string }>;

            await db.update(inspectionReportItems).set({
              dispatchStatus: 'dispatched', dispatchId: job.id, updatedAt: new Date(),
            }).where(eq(inspectionReportItems.id, item.id));

            dispatchedCount++;
            void dispatchJob(job.id).catch(err => logger.warn({ err, jobId: job.id }, '[Stripe webhook] Inspection outreach failed'));
          } catch (itemErr) {
            logger.error({ err: itemErr, itemId: item.id }, '[Stripe webhook] Failed to dispatch inspection item');
          }
        }

        // Update report stats
        const { count } = await import('drizzle-orm');
        const [{ value: totalDispatched }] = await db.select({ value: count() })
          .from(inspectionReportItems)
          .where(drizzleSql`${inspectionReportItems.reportId} = ${reportId} AND ${inspectionReportItems.dispatchStatus} != 'not_dispatched'`);
        await db.update(inspectionReports).set({ itemsDispatched: totalDispatched, updatedAt: new Date() }).where(eq(inspectionReports.id, reportId));

        // Per-dispatch referral commission writes were removed when the
        // earnings model flipped to retail-minus-wholesale per report
        // (set in inspector Settings). Estimated earnings are computed
        // at read time from inspection_reports + the inspector's retail
        // overrides — see services/pricing.ts.

        logger.info({ reportId, dispatchedCount }, '[Stripe webhook] Inspection items dispatched');
      } catch (err) {
        logger.error({ err }, '[Stripe webhook] Inspection dispatch failed');
      }
      res.status(200).json({ received: true });
      return;
    }

    // Consumer job payment checkout
    const jobId = session.metadata?.job_id;
    if (!jobId) {
      res.status(200).json({ received: true });
      return;
    }

    try {
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      await db.update(jobs).set({
        paymentStatus: 'authorized',
        status: 'dispatching',
        stripePaymentIntentId: paymentIntentId ?? null,
      }).where(eq(jobs.id, jobId));

      logger.info(`[Stripe webhook] Payment authorized for job ${jobId} — launching outreach`);
      dispatchJob(jobId).catch(err => logger.error({ err }, `[Stripe webhook] dispatchJob failed for ${jobId}`));
    } catch (err) {
      logger.error({ err }, '[Stripe webhook] Error processing payment');
    }
  }

  // ── Subscription lifecycle events ──
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
    const workspaceId = sub.metadata?.workspace_id;
    if (workspaceId) {
      try {
        await db.update(workspaces).set({
          subscriptionStatus: sub.status,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : new Date(),
          updatedAt: new Date(),
        }).where(eq(workspaces.id, workspaceId));
        logger.info({ workspaceId, status: sub.status }, `[Stripe webhook] Subscription ${event.type}`);
      } catch (err) {
        logger.error({ err }, `[Stripe webhook] Failed to update subscription status`);
      }
    }

    // ── Consumer Membership: same event, different table ──────────────
    // Match by stripe_subscription_id since the subscription metadata
    // may not always carry the homeowner_id (Stripe doesn't auto-copy
    // metadata from Checkout Session → Subscription on every update).
    try {
      const [hRow] = await db
        .select({
          id: homeowners.id,
          membershipTier: homeowners.membershipTier,
        })
        .from(homeowners)
        .where(eq(homeowners.stripeSubscriptionId, sub.id))
        .limit(1);

      if (hRow) {
        if (event.type === 'customer.subscription.deleted') {
          // Subscription has actually ended. Flip to free, clear all
          // tier_*_at fields. The tier_started_at on a future re-up
          // will get re-stamped by the next checkout completion.
          await db
            .update(homeowners)
            .set({
              membershipTier: 'free',
              stripeSubscriptionId: null,
              tierStartedAt: null,
              tierRenewsAt: null,
              tierCancelsAt: null,
            })
            .where(eq(homeowners.id, hRow.id));
          logger.info(
            { homeownerId: hRow.id },
            '[Stripe webhook] Homeowner subscription deleted — reverted to free',
          );
        } else {
          // customer.subscription.updated: re-derive tier from the
          // subscription's current price ID, plus update renewal +
          // cancellation pending state.
          const priceId = sub.items.data[0]?.price?.id ?? null;
          let derivedTier: 'plus' | 'premier' | null = null;
          if (priceId === process.env.STRIPE_PRICE_PLUS_MONTHLY) derivedTier = 'plus';
          else if (priceId === process.env.STRIPE_PRICE_PREMIER_MONTHLY) derivedTier = 'premier';

          const renewsAt = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
          const cancelsAt =
            sub.cancel_at_period_end && sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null;
          await db
            .update(homeowners)
            .set({
              membershipTier: derivedTier ?? hRow.membershipTier,
              tierRenewsAt: renewsAt,
              tierCancelsAt: cancelsAt,
            })
            .where(eq(homeowners.id, hRow.id));
          logger.info(
            { homeownerId: hRow.id, derivedTier, status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end },
            '[Stripe webhook] Homeowner subscription updated',
          );
        }
      }
    } catch (err) {
      logger.error({ err, subscriptionId: sub.id }, '[Stripe webhook] Failed to sync homeowner subscription');
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
    if (subId) {
      try {
        const [ws] = await db.select({ id: workspaces.id }).from(workspaces)
          .where(eq(workspaces.stripeSubscriptionId, subId)).limit(1);
        if (ws) {
          await db.update(workspaces).set({ subscriptionStatus: 'past_due', updatedAt: new Date() }).where(eq(workspaces.id, ws.id));
          logger.warn({ workspaceId: ws.id }, '[Stripe webhook] Subscription payment failed — marked past_due');
        }
        // Consumer membership: log but don't immediately downgrade —
        // the spec calls for a 3-day grace period + retries before
        // flipping to free. Stripe handles the retry schedule via
        // dunning settings on the Subscription. When dunning fully
        // fails, Stripe fires `customer.subscription.deleted` which
        // is already handled above.
        const [hRow] = await db
          .select({ id: homeowners.id })
          .from(homeowners)
          .where(eq(homeowners.stripeSubscriptionId, subId))
          .limit(1);
        if (hRow) {
          logger.warn(
            { homeownerId: hRow.id },
            '[Stripe webhook] Homeowner subscription payment failed — Stripe will retry via dunning',
          );
        }
      } catch (err) {
        logger.error({ err }, '[Stripe webhook] Failed to handle payment failure');
      }
    }
  }

  // ─── Membership Phase 1, Session 2: Stripe Connect events ──────────────
  //
  // account.updated fires every time a Connect account changes — most
  // notably when the vendor finishes onboarding and `payouts_enabled`
  // flips to true. We use it to mark the recurring_vendor 'active'.
  // The other Connect events update vendor_payments status for
  // observability + to surface failures.

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    if (account.payouts_enabled) {
      try {
        await markVendorActive(account.id);
      } catch (err) {
        logger.error({ err, accountId: account.id }, '[Stripe webhook] account.updated → markVendorActive failed');
      }
    }
  }

  // transfer.created — Stripe has booked the payout to the vendor's
  // Connect account. Stamp stripe_transfer_id on the matching
  // vendor_payments row via the metadata we set on the PaymentIntent
  // in services/vendor-payments.processPayment (Stripe propagates the
  // metadata to the auto-created Transfer for destination charges).
  //
  // Note: there is no `transfer.paid` / `transfer.failed` event in the
  // current Stripe API — actual deposit success/failure at the
  // vendor's bank surfaces via `payout.failed` on the connected
  // account (handled below). For observability we capture transfer.id
  // when it's created and rely on payout events for bank-deposit
  // outcomes.
  if (event.type === 'transfer.created') {
    const transfer = event.data.object as Stripe.Transfer;
    const paymentId = transfer.metadata?.homie_vendor_payment_id;
    if (paymentId) {
      try {
        await db
          .update(vendorPayments)
          .set({ stripeTransferId: transfer.id })
          .where(eq(vendorPayments.id, paymentId));
        logger.info(
          { paymentId, transferId: transfer.id },
          '[Stripe webhook] vendor transfer recorded',
        );
      } catch (err) {
        logger.error({ err, paymentId }, '[Stripe webhook] Failed to record vendor transfer');
      }
    }
  }

  // payout.failed — Stripe couldn't deposit funds into the vendor's
  // bank account. Doesn't directly map to a vendor_payments row (a
  // payout is a batch); just log loudly so ops can investigate via the
  // Stripe dashboard. Vendor's account on the Homie side stays active —
  // the vendor's bank info is the issue, not their relationship.
  if (event.type === 'payout.failed') {
    const payout = event.data.object as Stripe.Payout;
    const accountId = (event as Stripe.Event & { account?: string }).account;
    logger.error(
      {
        payoutId: payout.id,
        accountId,
        failureCode: payout.failure_code,
        failureMessage: payout.failure_message,
      },
      '[Stripe webhook] vendor payout failed — manual ops follow-up needed',
    );
    if (accountId) {
      try {
        // Best-effort: find the vendor associated with this Connect account
        // for breadcrumb context in the log. Doesn't change state.
        const [vendor] = await db
          .select({ id: recurringVendors.id, vendorName: recurringVendors.vendorName })
          .from(recurringVendors)
          .where(eq(recurringVendors.stripeConnectAccountId, accountId))
          .limit(1);
        if (vendor) {
          logger.error(
            { payoutId: payout.id, vendorId: vendor.id, vendorName: vendor.vendorName },
            '[Stripe webhook] payout.failed mapped to recurring_vendor',
          );
        }
      } catch (err) {
        logger.error({ err }, '[Stripe webhook] payout.failed lookup failed');
      }
    }
  }

  res.status(200).json({ received: true });
}
