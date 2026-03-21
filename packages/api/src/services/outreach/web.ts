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
<body style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#F9F5F2">
  <!-- Header -->
  <div style="background:#2D2926;padding:24px 32px;text-align:center">
    <span style="color:#E8632B;font-size:28px;font-weight:700;font-family:Georgia,serif">homie</span>
    <span style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px;vertical-align:super">PRO</span>
  </div>

  <!-- Main Content -->
  <div style="background:white;padding:32px;border-bottom:1px solid rgba(0,0,0,0.06)">
    <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">Hey ${providerName}!</p>
    <p style="color:#9B9490;font-size:14px;margin:0 0 24px">A homeowner near you needs your help</p>

    <!-- Job Details -->
    <div style="background:#F9F5F2;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid rgba(0,0,0,0.04)">
      <p style="color:#2D2926;font-size:15px;line-height:1.6;margin:0;white-space:pre-wrap">${script}</p>
    </div>

    <!-- CTA Buttons -->
    <div style="text-align:center;margin-bottom:8px">
      <a href="${acceptUrl}" style="display:inline-block;background:#1B9E77;color:white;padding:14px 40px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">
        I'm Interested — Send My Quote
      </a>
    </div>
    <div style="text-align:center">
      <a href="${declineUrl}" style="color:#9B9490;font-size:13px;text-decoration:none">
        No thanks, not this time
      </a>
    </div>
  </div>

  <!-- About Homie Section -->
  <div style="background:white;padding:28px 32px;border-bottom:1px solid rgba(0,0,0,0.06)">
    <p style="color:#2D2926;font-size:16px;font-weight:600;margin:0 0 12px">What is Homie?</p>
    <p style="color:#6B6560;font-size:14px;line-height:1.6;margin:0 0 16px">
      Homie is an AI-powered platform that connects homeowners with trusted local service providers like you.
      When a homeowner needs help, our AI finds the right pros in the area and reaches out on their behalf.
    </p>
    <div style="margin-bottom:8px">
      <span style="color:#1B9E77;font-weight:bold">&#10003;</span>
      <span style="color:#6B6560;font-size:14px;margin-left:8px"><strong style="color:#2D2926">100% free for providers</strong> — no fees, no subscriptions, ever</span>
    </div>
    <div style="margin-bottom:8px">
      <span style="color:#1B9E77;font-weight:bold">&#10003;</span>
      <span style="color:#6B6560;font-size:14px;margin-left:8px"><strong style="color:#2D2926">Homeowner pays you directly</strong> — we don't handle payments between you</span>
    </div>
    <div style="margin-bottom:8px">
      <span style="color:#1B9E77;font-weight:bold">&#10003;</span>
      <span style="color:#6B6560;font-size:14px;margin-left:8px"><strong style="color:#2D2926">Pre-qualified leads</strong> — every job comes with an AI diagnosis so you know what to expect</span>
    </div>
    <div>
      <span style="color:#1B9E77;font-weight:bold">&#10003;</span>
      <span style="color:#6B6560;font-size:14px;margin-left:8px"><strong style="color:#2D2926">No commitment</strong> — accept only the jobs you want</span>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:24px 32px;text-align:center">
    <p style="color:#9B9490;font-size:12px;margin:0 0 8px">
      You received this because your business was found on a public listing.
    </p>
    <p style="color:#ccc;font-size:11px;margin:0">
      &copy; ${new Date().getFullYear()} Homie Technologies, Inc. &mdash; Your home's best friend
    </p>
  </div>
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
