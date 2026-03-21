import { and, lte, inArray, eq } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { cancelPayment } from './stripe';
import logger from '../logger';

const ACTIVE_STATUSES = ['open', 'dispatching', 'collecting'];
const CHECK_INTERVAL_MS = 60_000; // 1 minute

export function startJobExpiryWorker(): void {
  async function expireJobs() {
    try {
      const now = new Date();
      const expired = await db
        .update(jobs)
        .set({ status: 'expired' })
        .where(
          and(
            inArray(jobs.status, ACTIVE_STATUSES),
            lte(jobs.expiresAt, now),
          ),
        )
        .returning({ id: jobs.id, paymentStatus: jobs.paymentStatus, stripePaymentIntentId: jobs.stripePaymentIntentId });

      for (const job of expired) {
        // Release authorized payments for expired jobs with no results
        if (job.paymentStatus === 'authorized' && job.stripePaymentIntentId) {
          try {
            await cancelPayment(job.stripePaymentIntentId);
            await db.update(jobs).set({ paymentStatus: 'refunded' }).where(eq(jobs.id, job.id));
            logger.info(`[job-expiry] Released payment hold for job ${job.id}`);
          } catch (err) {
            logger.error({ err }, `[job-expiry] Failed to cancel payment for job ${job.id}`);
          }
        }
      }

      if (expired.length > 0) {
        logger.info(`[job-expiry] Expired ${expired.length} job(s): ${expired.map(j => j.id).join(', ')}`);
      }
    } catch (err) {
      logger.error({ err }, '[job-expiry] Error');
    }
  }

  // Run immediately on startup, then every minute
  void expireJobs();
  setInterval(expireJobs, CHECK_INTERVAL_MS);

  logger.info('[job-expiry] Worker started (checking every 60s)');
}
