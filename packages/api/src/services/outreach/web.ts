import sgMail from '@sendgrid/mail';
import { createHmac } from 'crypto';
import { ChannelAdapter, OutreachPayload, OutreachResult } from './types';

export function buildWebhookToken(attemptId: string, action: string): string {
  const secret = process.env.WEBHOOK_SECRET ?? '';
  return createHmac('sha256', secret).update(`${attemptId}:${action}`).digest('hex');
}

function buildRespondUrl(attemptId: string, action: 'accept' | 'decline'): string {
  const token = buildWebhookToken(attemptId, action);
  const base = process.env.API_BASE_URL ?? 'https://api.homie.app';
  return `${base}/api/v1/webhooks/web/respond?attemptId=${encodeURIComponent(attemptId)}&action=${action}&token=${token}`;
}

function buildEmailHtml(script: string, acceptUrl: string, declineUrl: string, providerName: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a1a">New Job Opportunity from Homie</h2>
  <p style="color:#333;white-space:pre-wrap">${script}</p>
  <div style="margin-top:32px;display:flex;gap:16px">
    <a href="${acceptUrl}"
       style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Accept Job
    </a>
    &nbsp;&nbsp;
    <a href="${declineUrl}"
       style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Decline
    </a>
  </div>
  <p style="color:#888;font-size:12px;margin-top:32px">
    Sent to ${providerName} by Homie &mdash; AI-powered home maintenance platform.
  </p>
</body>
</html>`;
}

export class WebAdapter implements ChannelAdapter {
  async send(payload: OutreachPayload): Promise<OutreachResult> {
    if (!payload.email) {
      return { status: 'failed', error: 'No email address for web outreach' };
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      return { status: 'failed', error: 'SendGrid credentials not configured' };
    }

    try {
      sgMail.setApiKey(apiKey);

      const acceptUrl = buildRespondUrl(payload.attemptId, 'accept');
      const declineUrl = buildRespondUrl(payload.attemptId, 'decline');

      await sgMail.send({
        to: payload.email,
        from: fromEmail,
        subject: `New job opportunity near you — Homie`,
        text: payload.script,
        html: buildEmailHtml(payload.script, acceptUrl, declineUrl, payload.providerName),
      });

      return { status: 'pending' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SendGrid error';
      return { status: 'failed', error: message };
    }
  }
}
