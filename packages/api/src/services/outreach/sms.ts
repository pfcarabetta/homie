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

      await client.messages.create({
        to: payload.phone,
        from: fromNumber,
        body: payload.script,
        statusCallback: `${process.env.API_BASE_URL}/api/v1/webhooks/twilio/sms/status?attemptId=${encodeURIComponent(payload.attemptId)}`,
      });

      return { status: 'pending' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Twilio SMS error';
      return { status: 'failed', error: message };
    }
  }
}
