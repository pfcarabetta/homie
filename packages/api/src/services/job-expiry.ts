import { and, lte, inArray } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';

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
        .returning({ id: jobs.id });

      if (expired.length > 0) {
        console.log(`[job-expiry] Expired ${expired.length} job(s): ${expired.map(j => j.id).join(', ')}`);
      }
    } catch (err) {
      console.error('[job-expiry] Error:', err);
    }
  }

  // Run immediately on startup, then every minute
  void expireJobs();
  setInterval(expireJobs, CHECK_INTERVAL_MS);

  console.log('[job-expiry] Worker started (checking every 60s)');
}
