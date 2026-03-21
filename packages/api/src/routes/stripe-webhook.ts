import { Request, Response } from 'express';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { bookings } from '../db/schema/bookings';
import { sendBookingNotifications } from '../services/orchestration';
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
      // Mark job as paid
      await db.update(jobs).set({ paymentStatus: 'paid' }).where(eq(jobs.id, jobId));

      // If provider/response IDs are present, also create a booking (post-outreach payment)
      if (responseId && providerId) {
        const [job] = await db.select({ homeownerId: jobs.homeownerId }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (!job) {
          logger.error('[Stripe webhook] Job not found: %s', jobId);
          res.status(200).json({ received: true });
          return;
        }

        await db.update(jobs).set({ status: 'completed' }).where(eq(jobs.id, jobId));

        const [booking] = await db
          .insert(bookings)
          .values({
            jobId,
            homeownerId: job.homeownerId,
            providerId,
          responseId,
        })
        .returning();

        void sendBookingNotifications(jobId, providerId, booking.id);
        logger.info(`[Stripe webhook] Payment confirmed & booking created for job ${jobId}`);
      } else {
        // Upfront payment — just mark as paid, outreach continues
        logger.info(`[Stripe webhook] Upfront payment confirmed for job ${jobId}`);
      }
    } catch (err) {
      logger.error({ err }, '[Stripe webhook] Error processing payment');
    }
  }

  res.status(200).json({ received: true });
}
