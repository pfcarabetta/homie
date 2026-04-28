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
      } catch (err) {
        logger.error({ err }, '[Stripe webhook] Failed to handle payment failure');
      }
    }
  }

  res.status(200).json({ received: true });
}
