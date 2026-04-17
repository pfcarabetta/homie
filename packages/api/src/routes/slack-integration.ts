import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { workspaces } from '../db/schema/workspaces';
import { workspaceSlackSettings } from '../db/schema/slack-settings';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace-auth';
import { requirePlan } from '../middleware/plan-gate';
import { notifySlack } from '../services/slack-notifier';

// ── Slack API types ──────────────────────────────────────────────────────────

interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;
  team?: { id?: string; name?: string };
  incoming_webhook?: { channel_id?: string; channel?: string };
  error?: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
  is_private: boolean;
}

interface SlackChannelsResponse {
  ok: boolean;
  channels?: SlackChannel[];
  error?: string;
}

interface SlackActionPayload {
  type: string;
  user: { id: string; name: string };
  actions: Array<{
    action_id: string;
    value: string;
  }>;
  channel: { id: string };
  message: { ts: string };
  token: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID ?? '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET ?? '';
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? '';
const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.homie.app';

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  // Reject requests older than 5 minutes
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

  const basestring = `v0:${timestamp}:${body}`;
  const computed = 'v0=' + createHmac('sha256', signingSecret).update(basestring).digest('hex');

  try {
    const expectedBuf = Buffer.from(computed);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

// ── Auth Router (requires workspace auth) ────────────────────────────────────

export const slackAuthRouter = Router();

// GET /install — redirect to Slack OAuth URL (public — browser redirect, no auth header possible)
slackAuthRouter.get('/install', (req: Request, res: Response) => {
  const workspaceId = req.query.workspace_id as string;
  if (!workspaceId) {
    res.status(400).json({ data: null, error: 'workspace_id is required', meta: {} });
    return;
  }
  if (!SLACK_CLIENT_ID) {
    res.status(500).json({ data: null, error: 'Slack integration not configured', meta: {} });
    return;
  }

  const redirectUri = `${API_BASE_URL}/api/v1/integrations/slack/callback`;
  const scopes = 'chat:write,channels:read,groups:read,incoming-webhook';
  const state = workspaceId;

  const slackUrl = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  res.redirect(slackUrl);
});

// GET /callback — exchange code for token (public — Slack redirects here without auth)
slackAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const workspaceId = state;

  if (!code || !workspaceId) {
    res.status(400).json({ data: null, error: 'Missing authorization code or state', meta: {} });
    return;
  }

  const redirectUri = `${API_BASE_URL}/api/v1/integrations/slack/callback`;

  try {
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = (await tokenRes.json()) as SlackOAuthResponse;

    if (!data.ok || !data.access_token) {
      logger.error({ error: data.error }, '[slack] OAuth exchange failed');
      res.status(400).json({ data: null, error: data.error ?? 'OAuth exchange failed', meta: {} });
      return;
    }

    await db
      .update(workspaces)
      .set({
        slackAccessToken: data.access_token,
        slackTeamId: data.team?.id ?? null,
        slackChannelId: data.incoming_webhook?.channel_id ?? null,
        slackConnectedAt: new Date(),
        updatedAt: new Date(),
      } as Record<string, unknown>)
      .where(eq(workspaces.id, workspaceId));

    // Create default settings row if not exists
    const [existing] = await db
      .select({ id: workspaceSlackSettings.id })
      .from(workspaceSlackSettings)
      .where(eq(workspaceSlackSettings.workspaceId, workspaceId))
      .limit(1);

    if (!existing) {
      await db.insert(workspaceSlackSettings).values({ workspaceId });
    }

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'https://homiepro.ai';
    res.redirect(`${APP_URL}/business?tab=settings&slack=connected`);
  } catch (err) {
    logger.error({ err }, '[slack] OAuth callback error');
    res.status(500).json({ data: null, error: 'Failed to complete Slack OAuth', meta: {} });
  }
});

// DELETE /disconnect — clear slack fields
slackAuthRouter.delete('/:workspaceId/disconnect', requireWorkspace, requirePlan('pro', 'Slack integration'), requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    await db
      .update(workspaces)
      .set({
        slackAccessToken: null,
        slackTeamId: null,
        slackChannelId: null,
        slackConnectedAt: null,
        slackConnectedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, req.workspaceId));

    res.json({ data: { disconnected: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[slack] Disconnect error');
    res.status(500).json({ data: null, error: 'Failed to disconnect Slack', meta: {} });
  }
});

// GET /channels — list channels via Slack API
slackAuthRouter.get('/:workspaceId/channels', requireWorkspace, requirePlan('pro', 'Slack integration'), async (req: Request, res: Response) => {
  try {
    const [workspace] = await db
      .select({ slackAccessToken: workspaces.slackAccessToken })
      .from(workspaces)
      .where(eq(workspaces.id, req.workspaceId))
      .limit(1);

    if (!workspace?.slackAccessToken) {
      res.status(400).json({ data: null, error: 'Slack not connected', meta: {} });
      return;
    }

    const channelRes = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200', {
      headers: { 'Authorization': `Bearer ${workspace.slackAccessToken}` },
    });

    const data = (await channelRes.json()) as SlackChannelsResponse;

    if (!data.ok) {
      res.status(502).json({ data: null, error: data.error ?? 'Failed to fetch channels', meta: {} });
      return;
    }

    const channels = (data.channels ?? []).map(ch => ({
      id: ch.id,
      name: ch.name,
      is_member: ch.is_member,
      is_private: ch.is_private,
    }));

    res.json({ data: channels, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[slack] List channels error');
    res.status(500).json({ data: null, error: 'Failed to list channels', meta: {} });
  }
});

// PUT /settings — update slack notification settings
slackAuthRouter.put('/:workspaceId/settings', requireWorkspace, requirePlan('pro', 'Slack integration'), requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const allowedFields: Record<string, string> = {
    notify_dispatch_created: 'notifyDispatchCreated',
    notify_provider_response: 'notifyProviderResponse',
    notify_booking_confirmed: 'notifyBookingConfirmed',
    notify_approval_needed: 'notifyApprovalNeeded',
    notify_job_completed: 'notifyJobCompleted',
    notify_outreach_failed: 'notifyOutreachFailed',
    notify_daily_digest: 'notifyDailyDigest',
    approval_threshold_cents: 'approvalThresholdCents',
    approval_channel_override: 'approvalChannelOverride',
    digest_time: 'digestTime',
    channel_id: 'slackChannelId', // Allow changing the channel
  };

  const settingsUpdates: Record<string, unknown> = {};
  let channelId: string | undefined;

  for (const [bodyKey, dbKey] of Object.entries(allowedFields)) {
    if (body[bodyKey] !== undefined) {
      if (bodyKey === 'channel_id') {
        channelId = body[bodyKey] as string;
      } else {
        settingsUpdates[dbKey] = body[bodyKey];
      }
    }
  }

  try {
    // Update channel on workspace if provided
    if (channelId !== undefined) {
      await db
        .update(workspaces)
        .set({ slackChannelId: channelId, updatedAt: new Date() })
        .where(eq(workspaces.id, req.workspaceId));
    }

    // Upsert settings
    if (Object.keys(settingsUpdates).length > 0) {
      const [existing] = await db
        .select({ id: workspaceSlackSettings.id })
        .from(workspaceSlackSettings)
        .where(eq(workspaceSlackSettings.workspaceId, req.workspaceId))
        .limit(1);

      if (existing) {
        await db
          .update(workspaceSlackSettings)
          .set(settingsUpdates)
          .where(eq(workspaceSlackSettings.workspaceId, req.workspaceId));
      } else {
        await db.insert(workspaceSlackSettings).values({
          workspaceId: req.workspaceId,
          ...settingsUpdates,
        });
      }
    }

    // Return current settings
    const [settings] = await db
      .select()
      .from(workspaceSlackSettings)
      .where(eq(workspaceSlackSettings.workspaceId, req.workspaceId))
      .limit(1);

    const [ws] = await db
      .select({ slackChannelId: workspaces.slackChannelId, slackTeamId: workspaces.slackTeamId })
      .from(workspaces)
      .where(eq(workspaces.id, req.workspaceId))
      .limit(1);

    res.json({ data: { ...settings, channel_id: ws?.slackChannelId, team_id: ws?.slackTeamId }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[slack] Update settings error');
    res.status(500).json({ data: null, error: 'Failed to update settings', meta: {} });
  }
});

// POST /test — send test notification
slackAuthRouter.post('/:workspaceId/test', requireWorkspace, requirePlan('pro', 'Slack integration'), requireWorkspaceRole('admin'), async (req: Request, res: Response) => {
  try {
    const [workspace] = await db
      .select({
        slackAccessToken: workspaces.slackAccessToken,
        slackChannelId: workspaces.slackChannelId,
        name: workspaces.name,
      })
      .from(workspaces)
      .where(eq(workspaces.id, req.workspaceId))
      .limit(1);

    if (!workspace?.slackAccessToken || !workspace?.slackChannelId) {
      res.status(400).json({ data: null, error: 'Slack not connected', meta: {} });
      return;
    }

    const { postSlackMessage: postMsg } = await import('../services/slack-notifier');
    const ts = await postMsg(
      workspace.slackAccessToken,
      workspace.slackChannelId,
      [{
        color: '#E8632B',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Homie Slack Integration', emoji: true } },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `Slack notifications are working for *${workspace.name}*. You'll receive updates about dispatches, provider responses, and bookings here.` },
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: 'This is a test message from Homie' }],
          },
        ],
      }],
      `Test notification from Homie — ${workspace.name}`,
    );

    if (ts) {
      res.json({ data: { sent: true, ts }, error: null, meta: {} });
    } else {
      res.status(502).json({ data: null, error: 'Failed to send test message — check bot permissions and channel', meta: {} });
    }
  } catch (err) {
    logger.error({ err }, '[slack] Test notification error');
    res.status(500).json({ data: null, error: 'Failed to send test notification', meta: {} });
  }
});

// ── Public Router (no auth, validates Slack signature) ───────────────────────

export const slackPublicRouter = Router();

// POST /actions — handle interactive button clicks
slackPublicRouter.post('/actions', async (req: Request, res: Response) => {
  // Slack sends actions as application/x-www-form-urlencoded with a payload JSON string
  const rawBody = typeof req.body === 'string' ? req.body : (req.body?.payload ? `payload=${encodeURIComponent(req.body.payload as string)}` : '');

  // Verify signature
  const slackTimestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
  const slackSignature = req.headers['x-slack-signature'] as string | undefined;

  if (!slackTimestamp || !slackSignature || !SLACK_SIGNING_SECRET) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Reconstruct the raw body for verification
  // Express has already parsed the body, so we need to reconstruct it
  const payloadStr = req.body?.payload as string | undefined;
  if (!payloadStr) {
    res.status(400).json({ error: 'Missing payload' });
    return;
  }

  const bodyForVerification = `payload=${encodeURIComponent(payloadStr)}`;

  if (!verifySlackSignature(SLACK_SIGNING_SECRET, slackTimestamp, bodyForVerification, slackSignature)) {
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  let payload: SlackActionPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackActionPayload;
  } catch {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  if (!payload.actions || payload.actions.length === 0) {
    res.status(200).send();
    return;
  }

  const action = payload.actions[0];
  let actionData: Record<string, unknown>;
  try {
    actionData = JSON.parse(action.value) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: 'Invalid action value' });
    return;
  }

  const jobId = actionData.jobId as string | undefined;
  if (!jobId) {
    res.status(400).json({ error: 'Missing jobId' });
    return;
  }

  try {
    switch (action.action_id) {
      case 'slack_book_provider': {
        const providerId = actionData.providerId as string | undefined;
        if (!providerId) {
          res.status(200).json({
            replace_original: true,
            text: 'Error: Missing provider ID',
          });
          return;
        }

        // Import bookings to create the booking
        const { jobs } = await import('../db/schema/jobs');
        const { bookings } = await import('../db/schema/bookings');
        const { providerResponses } = await import('../db/schema/provider-responses');
        const { providers } = await import('../db/schema/providers');

        const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (!job) {
          res.status(200).json({ replace_original: false, text: 'Job not found' });
          return;
        }

        // Find the provider response
        const [provResponse] = await db
          .select()
          .from(providerResponses)
          .where(eq(providerResponses.jobId, jobId))
          .limit(1);

        const [provider] = await db
          .select({ name: providers.name })
          .from(providers)
          .where(eq(providers.id, providerId))
          .limit(1);

        // Create booking
        await db.insert(bookings).values({
          jobId,
          homeownerId: job.homeownerId,
          providerId,
          responseId: provResponse?.id ?? null,
        });

        // Update job status
        await db.update(jobs).set({ status: 'booked' }).where(eq(jobs.id, jobId));

        // Send booking notifications
        try {
          const { sendBookingNotifications } = await import('../services/orchestration');
          void sendBookingNotifications(jobId, providerId, jobId);
        } catch (err) { logger.warn({ err, jobId, providerId }, '[slack-integration] Failed to send booking notifications'); }

        res.status(200).json({
          replace_original: true,
          text: `Booked ${provider?.name ?? 'provider'} via Slack by ${payload.user.name}`,
        });
        return;
      }

      case 'slack_extend_search': {
        // Re-dispatch the job with wider search
        try {
          const { dispatchJob } = await import('../services/orchestration');
          void dispatchJob(jobId);
        } catch (err) { logger.warn({ err, jobId }, '[slack-integration] Failed to re-dispatch job for extended search'); }

        res.status(200).json({
          replace_original: true,
          text: `Search extended for job by ${payload.user.name} — re-dispatching with wider radius`,
        });
        return;
      }

      case 'slack_dismiss': {
        res.status(200).json({
          replace_original: true,
          text: `Dismissed by ${payload.user.name}`,
        });
        return;
      }

      default: {
        res.status(200).json({
          replace_original: false,
          text: `Unknown action: ${action.action_id}`,
        });
        return;
      }
    }
  } catch (err) {
    logger.error({ err, actionId: action.action_id, jobId }, '[slack] Action handler error');
    res.status(200).json({
      replace_original: false,
      text: 'Something went wrong processing your action. Please try in the Homie dashboard.',
    });
  }
});
