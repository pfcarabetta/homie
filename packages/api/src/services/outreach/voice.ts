import twilio from 'twilio';
import { ChannelAdapter, OutreachPayload, OutreachResult } from './types';
import { initConversation } from './voice-conversation';

function buildConversationalTwiml(script: string, attemptId: string): string {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  // Initialize conversation state
  initConversation(attemptId, script);

  // Say the initial script
  response.say({ voice: 'Polly.Joanna' }, script);

  // Gather speech response
  const gatherUrl = `${process.env.API_BASE_URL}/api/v1/webhooks/twilio/voice/conversation?attemptId=${encodeURIComponent(attemptId)}`;
  const gather = response.gather({
    input: ['speech'],
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    action: gatherUrl,
    method: 'POST',
    timeout: 8,
  });
  gather.say({ voice: 'Polly.Joanna' }, 'Are you interested in this job?');

  // If no response
  response.say({ voice: 'Polly.Joanna' }, "I didn't catch that. We'll try reaching you again. Goodbye.");

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
        twiml: buildConversationalTwiml(payload.script, payload.attemptId),
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
