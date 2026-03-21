import { Request, Response } from 'express';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { bookings } from '../db/schema/bookings';
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const jobId = session.metadata?.job_id;
    const responseId = session.metadata?.response_id;
    const providerId = session.metadata?.provider_id;

    if (!jobId) {
      logger.error('[Stripe webhook] Missing job_id in session %s', session.id);
      res.status(200).json({ received: true });
      return;
    }

    try {
      // Get the payment intent ID from the session
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

      // Mark job as authorized and dispatch outreach
      await db.update(jobs).set({
        paymentStatus: 'authorized',
        status: 'dispatching',
        stripePaymentIntentId: paymentIntentId ?? null,
      }).where(eq(jobs.id, jobId));

      logger.info(`[Stripe webhook] Payment authorized for job ${jobId} — launching outreach`);

      // Now dispatch the job to contact providers
      dispatchJob(jobId).catch(err => logger.error({ err }, `[Stripe webhook] dispatchJob failed for ${jobId}`));
    } catch (err) {
      logger.error({ err }, '[Stripe webhook] Error processing payment');
    }
  }

  res.status(200).json({ received: true });
}
