import { Request, Response } from 'express';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
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
    console.error('[Stripe webhook] Signature verification failed:', err);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const jobId = session.metadata?.job_id;
    const responseId = session.metadata?.response_id;
    const providerId = session.metadata?.provider_id;

    if (!jobId || !responseId || !providerId) {
      console.error('[Stripe webhook] Missing metadata in session', session.id);
      res.status(200).json({ received: true });
      return;
    }

    try {
      // Mark job as paid
      await db.update(jobs).set({ paymentStatus: 'paid' }).where(eq(jobs.id, jobId));

      // Get job to find homeowner
      const [job] = await db.select({ homeownerId: jobs.homeownerId }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (!job) {
        console.error('[Stripe webhook] Job not found:', jobId);
        res.status(200).json({ received: true });
        return;
      }

      // Complete the booking
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

      console.log(`[Stripe webhook] Payment confirmed & booking created for job ${jobId}`);
    } catch (err) {
      console.error('[Stripe webhook] Error processing payment:', err);
    }
  }

  res.status(200).json({ received: true });
}
