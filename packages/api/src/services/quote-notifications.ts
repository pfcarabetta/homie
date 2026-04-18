import { eq } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { providers } from '../db/schema/providers';
import logger from '../logger';

/**
 * Fire owner-side notifications for a new provider response. Routes to
 * either workspace (Business) or homeowner (consumer) based on which
 * the job is tied to.
 *
 * Workspace path: Slack (when configured) + in-app feed.
 * Consumer path: in-app feed only — they get email separately via the
 * existing booking-message webhook flow if they replied via SMS.
 *
 * Late detection: if the job has already passed its expiresAt or is in
 * the 'expired' status when the quote arrives, the notification title
 * is prefixed with "Late quote" instead of "New quote".
 */
export async function notifyWorkspaceOfQuote(jobId: string, providerId: string, message: string | null): Promise<void> {
  try {
    const [job] = await db.select({
      workspaceId: jobs.workspaceId,
      homeownerId: jobs.homeownerId,
      diagnosis: jobs.diagnosis,
      propertyId: jobs.propertyId,
      status: jobs.status,
      expiresAt: jobs.expiresAt,
    }).from(jobs).where(eq(jobs.id, jobId)).limit(1);

    if (!job) return;

    const [prov] = await db.select({ name: providers.name }).from(providers).where(eq(providers.id, providerId)).limit(1);
    const diagnosis = job.diagnosis as { category?: string } | null;
    const cat = (diagnosis?.category || 'job').replace(/_/g, ' ');
    const provName = prov?.name ?? 'A provider';
    const safeMsg = message ?? '';
    const trimmedMsg = safeMsg.length > 120 ? safeMsg.slice(0, 117) + '...' : safeMsg;
    const isLate = job.status === 'expired' || (job.expiresAt && job.expiresAt < new Date());
    const titlePrefix = isLate ? 'Late quote' : 'New quote';

    const { recordNotification } = await import('./notification-feed');

    if (job.workspaceId) {
      // Workspace (Business) path: Slack + in-app feed
      const { notifySlack } = await import('./slack-notifier');
      void notifySlack(job.workspaceId, 'provider_response', {
        jobId,
        providerId,
        providerName: provName,
        message,
        category: diagnosis?.category ?? 'maintenance',
      });

      void recordNotification({
        workspaceId: job.workspaceId,
        type: 'provider_response',
        title: `${titlePrefix} from ${provName}`,
        body: `${cat}: ${trimmedMsg}`,
        jobId,
        propertyId: job.propertyId,
        link: `/business?tab=dispatches&job=${jobId}`,
      });
    } else if (job.homeownerId) {
      // Consumer path: in-app feed
      void recordNotification({
        homeownerId: job.homeownerId,
        type: 'quote_received',
        title: `${titlePrefix} from ${provName}`,
        body: `${cat}: ${trimmedMsg}`,
        jobId,
        link: `/account?tab=quotes`,
      });
    }
  } catch (err) {
    logger.warn({ err, jobId }, '[quote-notifications] notifyWorkspaceOfQuote failed');
  }

  // If this job originated from an inspection dispatch, sync the quote
  // back to the inspection report item.
  try {
    const { syncInspectionQuote } = await import('./inspection-quote-sync');
    void syncInspectionQuote(jobId, providerId, message);
  } catch { /* silent */ }
}
