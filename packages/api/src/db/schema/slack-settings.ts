import { pgTable, uuid, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';
import { jobs } from './jobs';

export const workspaceSlackSettings = pgTable('workspace_slack_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  notifyDispatchCreated: boolean('notify_dispatch_created').notNull().default(true),
  notifyProviderResponse: boolean('notify_provider_response').notNull().default(true),
  notifyBookingConfirmed: boolean('notify_booking_confirmed').notNull().default(true),
  notifyApprovalNeeded: boolean('notify_approval_needed').notNull().default(true),
  notifyJobCompleted: boolean('notify_job_completed').notNull().default(true),
  notifyOutreachFailed: boolean('notify_outreach_failed').notNull().default(true),
  notifyDailyDigest: boolean('notify_daily_digest').notNull().default(false),
  approvalThresholdCents: integer('approval_threshold_cents').notNull().default(50000),
  approvalChannelOverride: text('approval_channel_override'),
  digestTime: text('digest_time').notNull().default('09:00'),
});

export const slackMessageLog = pgTable('slack_message_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  slackChannel: text('slack_channel').notNull(),
  slackMessageTs: text('slack_message_ts').notNull(),
  messageType: text('message_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkspaceSlackSettings = typeof workspaceSlackSettings.$inferSelect;
export type NewWorkspaceSlackSettings = typeof workspaceSlackSettings.$inferInsert;
export type SlackMessageLog = typeof slackMessageLog.$inferSelect;
export type NewSlackMessageLog = typeof slackMessageLog.$inferInsert;
