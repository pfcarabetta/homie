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
  | 'approval_needed';

interface CreateNotificationInput {
  workspaceId: string;
  type: NotificationType;
  title: string;
  body: string;
  jobId?: string | null;
  propertyId?: string | null;
  guestIssueId?: string | null;
  link?: string | null;
}

/**
 * Write a notification to the feed for the property manager dashboard.
 * Failures are logged but never thrown — notifications are best-effort.
 */
export async function recordNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await db.insert(notifications).values({
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      body: input.body,
      jobId: input.jobId ?? null,
      propertyId: input.propertyId ?? null,
      guestIssueId: input.guestIssueId ?? null,
      link: input.link ?? null,
    });
  } catch (err) {
    logger.warn({ err, type: input.type, workspaceId: input.workspaceId }, '[notifications] failed to record');
  }
}
