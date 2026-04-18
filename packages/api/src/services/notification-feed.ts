import { db } from '../db';
import { notifications } from '../db/schema/notifications';
import logger from '../logger';

export type NotificationType =
  | 'dispatch_created'
  | 'provider_response'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'job_completed'
  | 'guest_issue_submitted'
  | 'outreach_failed'
  | 'approval_needed'
  | 'quote_received'
  | 'booking_message';

interface CreateNotificationInput {
  /** Workspace owner (Business product). Set this OR homeownerId, not both. */
  workspaceId?: string | null;
  /** Homeowner owner (consumer product). Set this OR workspaceId, not both. */
  homeownerId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  jobId?: string | null;
  propertyId?: string | null;
  guestIssueId?: string | null;
  bookingId?: string | null;
  link?: string | null;
}

/**
 * Write a notification to the feed for either a workspace dashboard (Business)
 * or a homeowner account (consumer). Failures are logged but never thrown —
 * notifications are best-effort and should not block the triggering action.
 */
export async function recordNotification(input: CreateNotificationInput): Promise<void> {
  if (!input.workspaceId && !input.homeownerId) {
    logger.warn({ type: input.type }, '[notifications] skipped — no workspaceId or homeownerId provided');
    return;
  }
  try {
    await db.insert(notifications).values({
      workspaceId: input.workspaceId ?? null,
      homeownerId: input.homeownerId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      jobId: input.jobId ?? null,
      propertyId: input.propertyId ?? null,
      guestIssueId: input.guestIssueId ?? null,
      bookingId: input.bookingId ?? null,
      link: input.link ?? null,
    });
  } catch (err) {
    logger.warn(
      { err, type: input.type, workspaceId: input.workspaceId, homeownerId: input.homeownerId },
      '[notifications] failed to record',
    );
  }
}
