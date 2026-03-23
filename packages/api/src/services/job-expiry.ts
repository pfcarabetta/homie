import { and, lte, inArray, eq, sql, count } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { providerResponses } from '../db/schema/provider-responses';
import { workspaces } from '../db/schema/workspaces';
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
        .returning({ id: jobs.id, paymentStatus: jobs.paymentStatus, stripePaymentIntentId: jobs.stripePaymentIntentId, workspaceId: jobs.workspaceId });

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

        // Refund search credit for B2B jobs that expired with zero responses
        if (job.workspaceId) {
          try {
            const [{ value: responseCount }] = await db
              .select({ value: count() })
              .from(providerResponses)
              .where(eq(providerResponses.jobId, job.id));

            if (responseCount === 0) {
              await db.update(workspaces)
                .set({ searchesUsed: sql`GREATEST(${workspaces.searchesUsed} - 1, 0)` } as Record<string, unknown>)
                .where(eq(workspaces.id, job.workspaceId));
              logger.info(`[job-expiry] Refunded search credit for B2B job ${job.id} (zero responses)`);
            }
          } catch (err) {
            logger.error({ err }, `[job-expiry] Failed to refund search credit for job ${job.id}`);
          }
        }
      }

      // Close unpaid 'open' jobs older than 10 minutes (user abandoned before payment)
      const staleOpen = await db
        .update(jobs)
        .set({ status: 'expired' })
        .where(
          and(
            eq(jobs.status, 'open'),
            eq(jobs.paymentStatus, 'unpaid'),
            lte(jobs.createdAt, new Date(now.getTime() - 10 * 60 * 1000)),
          ),
        )
        .returning({ id: jobs.id });

      if (staleOpen.length > 0) {
        logger.info(`[job-expiry] Closed ${staleOpen.length} abandoned unpaid job(s): ${staleOpen.map(j => j.id).join(', ')}`);
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
