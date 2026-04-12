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
            updatedAt: new Date(),
          }).where(eq(workspaces.id, workspaceId));
          logger.info({ workspaceId, subscriptionId }, '[Stripe webhook] Workspace subscription activated');
        } catch (err) {
          logger.error({ err }, '[Stripe webhook] Failed to save subscription ID');
        }
      }
      res.status(200).json({ received: true });
      return;
    }

    // Consumer job payment checkout
    const jobId = session.metadata?.job_id;
    if (!jobId) {
      logger.error('[Stripe webhook] Missing job_id in session %s', session.id);
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
