import { eq } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { providers } from '../db/schema/providers';
import logger from '../logger';

/**
 * Fire workspace-side notifications (Slack + in-app feed) for a new
 * provider response. Used by every quote-insertion path so late
 * responses on expired dispatches still ping the workspace inbox.
 *
 * Late detection: if the job has already passed its expiresAt or is
 * in the 'expired' status when the quote arrives, the notification
 * title is prefixed with "Late quote" instead of "New quote".
 */
export async function notifyWorkspaceOfQuote(jobId: string, providerId: string, message: string | null): Promise<void> {
  try {
    const [job] = await db.select({
      workspaceId: jobs.workspaceId,
      diagnosis: jobs.diagnosis,
      propertyId: jobs.propertyId,
      status: jobs.status,
      expiresAt: jobs.expiresAt,
    }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job?.workspaceId) return;

    const [prov] = await db.select({ name: providers.name }).from(providers).where(eq(providers.id, providerId)).limit(1);
    const diagnosis = job.diagnosis as { category?: string } | null;
    const cat = (diagnosis?.category || 'job').replace(/_/g, ' ');
    const provName = prov?.name ?? 'A provider';
    const safeMsg = message ?? '';
    const trimmedMsg = safeMsg.length > 120 ? safeMsg.slice(0, 117) + '...' : safeMsg;
    const isLate = job.status === 'expired' || (job.expiresAt && job.expiresAt < new Date());
    const titlePrefix = isLate ? 'Late quote' : 'New quote';

    const { notifySlack } = await import('./slack-notifier');
    void notifySlack(job.workspaceId, 'provider_response', {
      jobId,
      providerId,
      providerName: provName,
      message,
      category: diagnosis?.category ?? 'maintenance',
    });

    const { recordNotification } = await import('./notification-feed');
    void recordNotification({
      workspaceId: job.workspaceId,
      type: 'provider_response',
      title: `${titlePrefix} from ${provName}`,
      body: `${cat}: ${trimmedMsg}`,
      jobId,
      propertyId: job.propertyId,
      link: `/business?tab=dispatches&job=${jobId}`,
    });
  } catch (err) {
    logger.warn({ err, jobId }, '[quote-notifications] notifyWorkspaceOfQuote failed');
  }
}
