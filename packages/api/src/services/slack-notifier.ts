import logger from '../logger';
import { db } from '../db';
import { workspaces } from '../db/schema/workspaces';
import { workspaceSlackSettings, slackMessageLog } from '../db/schema/slack-settings';
import { eq } from 'drizzle-orm';

// ── Types ────────────────────────────────────────────────────────────────────

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SlackAttachment {
  color: string;
  blocks: SlackBlock[];
}

interface SlackPostResponse {
  ok: boolean;
  ts?: string;
  error?: string;
}

// ── Slack API helpers ────────────────────────────────────────────────────────

async function postSlackMessage(
  token: string,
  channel: string,
  attachments: SlackAttachment[],
  text: string,
): Promise<string | null> {
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, text, attachments }),
    });

    const data = (await res.json()) as SlackPostResponse;
    if (!data.ok) {
      logger.error({ error: data.error, channel }, '[slack] postSlackMessage failed');
      return null;
    }
    return data.ts ?? null;
  } catch (err) {
    logger.error({ err }, '[slack] postSlackMessage exception');
    return null;
  }
}

async function updateSlackMessage(
  token: string,
  channel: string,
  ts: string,
  attachments: SlackAttachment[],
  text: string,
): Promise<void> {
  try {
    const res = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, ts, text, attachments }),
    });

    const data = (await res.json()) as SlackPostResponse;
    if (!data.ok) {
      logger.error({ error: data.error, channel, ts }, '[slack] updateSlackMessage failed');
    }
  } catch (err) {
    logger.error({ err }, '[slack] updateSlackMessage exception');
  }
}

// ── Event type to settings field mapping ─────────────────────────────────────

const EVENT_SETTING_MAP: Record<string, keyof typeof workspaceSlackSettings.$inferSelect> = {
  dispatch_created: 'notifyDispatchCreated',
  provider_response: 'notifyProviderResponse',
  booking_confirmed: 'notifyBookingConfirmed',
  approval_needed: 'notifyApprovalNeeded',
  job_completed: 'notifyJobCompleted',
  outreach_failed: 'notifyOutreachFailed',
  daily_digest: 'notifyDailyDigest',
};

// ── Block Kit payload builders ───────────────────────────────────────────────

const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'https://homiepro.ai';

function buildDispatchCreated(data: Record<string, unknown>): { attachments: SlackAttachment[]; text: string } {
  const jobId = data.jobId as string;
  const category = (data.category as string ?? 'maintenance').replace(/_/g, ' ');
  const severity = data.severity as string ?? 'medium';
  const tier = data.tier as string ?? 'standard';
  const summary = data.summary as string ?? '';
  const propertyName = data.propertyName as string ?? '';
  const zipCode = data.zipCode as string ?? '';
  const providerCount = data.providerCount as number ?? 0;

  const fields: SlackBlock[] = [];
  if (propertyName) {
    fields.push({ type: 'mrkdwn', text: `*Property:*\n${propertyName}` });
  }
  fields.push({ type: 'mrkdwn', text: `*Category:*\n${category}` });
  fields.push({ type: 'mrkdwn', text: `*Severity:*\n${severity}` });
  fields.push({ type: 'mrkdwn', text: `*Tier:*\n${tier}` });

  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: `New Dispatch: ${category}`, emoji: true } },
    { type: 'section', fields },
  ];

  if (summary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: summary.slice(0, 500) },
    });
  }

  if (providerCount > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Contacting ${providerCount} providers in ${zipCode}` }],
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View in Homie' },
        url: `${APP_URL}/business/dispatches?job=${jobId}`,
        style: 'primary',
      },
    ],
  });

  return {
    attachments: [{ color: '#E8632B', blocks }],
    text: `New dispatch: ${category} (${severity})`,
  };
}

function buildProviderResponse(data: Record<string, unknown>): { attachments: SlackAttachment[]; text: string } {
  const jobId = data.jobId as string;
  const providerName = data.providerName as string ?? 'A provider';
  const quotedPrice = data.quotedPrice as string | null;
  const availability = data.availability as string | null;
  const message = data.message as string | null;
  const category = (data.category as string ?? 'maintenance').replace(/_/g, ' ');

  const fields: SlackBlock[] = [
    { type: 'mrkdwn', text: `*Provider:*\n${providerName}` },
  ];
  if (quotedPrice) fields.push({ type: 'mrkdwn', text: `*Quote:*\n${quotedPrice}` });
  if (availability) fields.push({ type: 'mrkdwn', text: `*Availability:*\n${availability}` });

  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: `Quote Received: ${category}`, emoji: true } },
    { type: 'section', fields },
  ];

  if (message) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `_"${message.slice(0, 300)}"_` },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Book this pro' },
        action_id: 'slack_book_provider',
        value: JSON.stringify({ jobId, providerId: data.providerId }),
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View all quotes' },
        url: `${APP_URL}/business/dispatches?job=${jobId}&tab=quotes`,
      },
    ],
  });

  return {
    attachments: [{ color: '#1B9E77', blocks }],
    text: `Quote received from ${providerName}${quotedPrice ? ` — ${quotedPrice}` : ''}`,
  };
}

function buildBookingConfirmed(data: Record<string, unknown>): { attachments: SlackAttachment[]; text: string } {
  const jobId = data.jobId as string;
  const providerName = data.providerName as string ?? 'Provider';
  const quotedPrice = data.quotedPrice as string | null;
  const availability = data.availability as string | null;
  const category = (data.category as string ?? 'maintenance').replace(/_/g, ' ');

  const fields: SlackBlock[] = [
    { type: 'mrkdwn', text: `*Provider:*\n${providerName}` },
  ];
  if (availability) fields.push({ type: 'mrkdwn', text: `*Scheduled:*\n${availability}` });
  if (quotedPrice) fields.push({ type: 'mrkdwn', text: `*Quote:*\n${quotedPrice}` });

  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: `Booked: ${category}`, emoji: true } },
    { type: 'section', fields },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View in Homie' },
          url: `${APP_URL}/business/bookings?job=${jobId}`,
        },
      ],
    },
  ];

  return {
    attachments: [{ color: '#1B9E77', blocks }],
    text: `Booking confirmed: ${providerName} for ${category}`,
  };
}

function buildOutreachFailed(data: Record<string, unknown>): { attachments: SlackAttachment[]; text: string } {
  const jobId = data.jobId as string;
  const category = (data.category as string ?? 'maintenance').replace(/_/g, ' ');
  const contactedCount = data.contactedCount as number ?? 0;

  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: `No Providers Available: ${category}`, emoji: true } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `Contacted ${contactedCount} providers with no responses.` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Extend search' },
          action_id: 'slack_extend_search',
          value: JSON.stringify({ jobId }),
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Dismiss' },
          action_id: 'slack_dismiss',
          value: JSON.stringify({ jobId }),
        },
      ],
    },
  ];

  return {
    attachments: [{ color: '#DC2626', blocks }],
    text: `No providers available for ${category} — contacted ${contactedCount}`,
  };
}

// ── Payload builder router ──────────────────────────────────────────────────

function buildPayload(eventType: string, data: Record<string, unknown>): { attachments: SlackAttachment[]; text: string } | null {
  switch (eventType) {
    case 'dispatch_created': return buildDispatchCreated(data);
    case 'provider_response': return buildProviderResponse(data);
    case 'booking_confirmed': return buildBookingConfirmed(data);
    case 'outreach_failed': return buildOutreachFailed(data);
    default:
      logger.warn({ eventType }, '[slack] Unknown event type');
      return null;
  }
}

// ── Main public API ─────────────────────────────────────────────────────────

/**
 * Post a Slack notification for a workspace event.
 * Safe to call fire-and-forget — all errors are caught internally.
 */
export async function notifySlack(
  workspaceId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    // 1. Check workspace has Slack connected
    const [workspace] = await db
      .select({
        slackAccessToken: workspaces.slackAccessToken,
        slackChannelId: workspaces.slackChannelId,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace?.slackAccessToken || !workspace?.slackChannelId) {
      return; // Slack not connected — silently skip
    }

    // 2. Check settings for this event type
    const settingField = EVENT_SETTING_MAP[eventType];
    if (settingField) {
      const [settings] = await db
        .select()
        .from(workspaceSlackSettings)
        .where(eq(workspaceSlackSettings.workspaceId, workspaceId))
        .limit(1);

      // If settings exist, check the specific flag; if no settings row, use defaults (all enabled except digest)
      if (settings && !settings[settingField]) {
        return; // This notification type is disabled
      }
    }

    // 3. Build Block Kit payload
    const payload = buildPayload(eventType, data);
    if (!payload) return;

    // 4. Post to Slack
    const messageTs = await postSlackMessage(
      workspace.slackAccessToken,
      workspace.slackChannelId,
      payload.attachments,
      payload.text,
    );

    // 5. Log in slack_message_log
    const jobId = data.jobId as string | undefined;
    if (messageTs && jobId) {
      try {
        await db.insert(slackMessageLog).values({
          workspaceId,
          jobId,
          slackChannel: workspace.slackChannelId,
          slackMessageTs: messageTs,
          messageType: eventType,
        });
      } catch (logErr) {
        logger.warn({ err: logErr }, '[slack] Failed to log message');
      }
    }

    logger.info({ workspaceId, eventType, messageTs }, '[slack] Notification sent');
  } catch (err) {
    logger.error({ err, workspaceId, eventType }, '[slack] notifySlack failed');
  }
}

export { updateSlackMessage, postSlackMessage };
