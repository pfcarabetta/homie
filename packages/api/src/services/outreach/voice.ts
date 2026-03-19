import twilio from 'twilio';
import { ChannelAdapter, OutreachPayload, OutreachResult } from './types';

function buildTwiml(script: string, attemptId: string): string {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const gatherUrl = `${process.env.API_BASE_URL}/api/v1/webhooks/twilio/voice/gather?attemptId=${encodeURIComponent(attemptId)}`;

  const gather = response.gather({
    numDigits: 1,
    action: gatherUrl,
    method: 'POST',
    timeout: 10,
  });
  gather.say({ voice: 'alice' }, script);
  gather.say({ voice: 'alice' }, 'Press 1 to accept this job request, or press 2 to decline.');

  // Fallback if the provider does not press anything
  response.say({ voice: 'alice' }, 'We did not receive your input. We will try reaching you again. Goodbye.');

  return response.toString();
}

export class VoiceAdapter implements ChannelAdapter {
  async send(payload: OutreachPayload): Promise<OutreachResult> {
    if (!payload.phone) {
      return { status: 'failed', error: 'No phone number for voice outreach' };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return { status: 'failed', error: 'Twilio credentials not configured' };
    }

    try {
      const client = twilio(accountSid, authToken);
      const statusCallbackUrl = `${process.env.API_BASE_URL}/api/v1/webhooks/twilio/voice/status?attemptId=${encodeURIComponent(payload.attemptId)}`;

      await client.calls.create({
        to: payload.phone,
        from: fromNumber,
        twiml: buildTwiml(payload.script, payload.attemptId),
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ['completed'],
        statusCallbackMethod: 'POST',
      });

      return { status: 'pending' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Twilio voice error';
      return { status: 'failed', error: message };
    }
  }
}
