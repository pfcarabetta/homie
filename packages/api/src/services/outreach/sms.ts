import twilio from 'twilio';
import { ChannelAdapter, OutreachPayload, OutreachResult } from './types';

export class SmsAdapter implements ChannelAdapter {
  async send(payload: OutreachPayload): Promise<OutreachResult> {
    if (!payload.phone) {
      return { status: 'failed', error: 'No phone number for SMS outreach' };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return { status: 'failed', error: 'Twilio credentials not configured' };
    }

    try {
      const client = twilio(accountSid, authToken);

      // Include up to 3 photos as MMS media when available. Twilio MMS
      // supports mediaUrl on US/CA numbers at no extra cost per message.
      const mediaUrl = payload.imageUrls?.slice(0, 3).filter(u => u.startsWith('https://'));

      await client.messages.create({
        to: payload.phone,
        from: fromNumber,
        body: (payload.workspaceName ? `HomiePro: ${payload.workspaceName} has a job — ` : 'HomiePro: ') + payload.script + '\n\nReply STOP to opt out. HELP for info.',
        statusCallback: `${process.env.API_BASE_URL}/api/v1/webhooks/twilio/sms/status?attemptId=${encodeURIComponent(payload.attemptId)}`,
        ...(mediaUrl && mediaUrl.length > 0 ? { mediaUrl } : {}),
      });

      return { status: 'pending' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Twilio SMS error';
      return { status: 'failed', error: message };
    }
  }
}
