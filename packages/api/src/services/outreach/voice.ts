import twilio from 'twilio';
import { ChannelAdapter, OutreachPayload, OutreachResult } from './types';
import { initConversation } from './voice-conversation';
import { synthesizeAndUploadAudio, getCachedAudioUrl } from '../tts';
import logger from '../../logger';

// Static prompts spoken every call — synthesized once via ElevenLabs and
// reused across every outbound call for the lifetime of the process. These
// keys are arbitrary but stable so the cache hits across different jobs.
const PROMPT_GATHER = 'Are you interested in this job?';
const PROMPT_NO_RESPONSE = "I didn't catch that. We'll try reaching you again. Goodbye.";

/**
 * Build the initial-call TwiML using ElevenLabs (Adam voice — same as the
 * in-app Chat with Homie feature) for every spoken line. Falls back to
 * Twilio's Polly.Joanna if ElevenLabs or Cloudinary errors so the dispatch
 * still goes through.
 *
 * Used by the outreach VoiceAdapter, which is the single shared call path
 * for Homie consumer, Homie Business, and Homie Inspect — all three
 * surfaces now sound identical on the line.
 */
async function buildConversationalTwiml(script: string, attemptId: string): Promise<string> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  // Initialize conversation state for the gather webhook
  initConversation(attemptId, script);

  // Synthesize the dynamic AI-written script + cache-look-up the two
  // static prompts. Run in parallel so the call goes out fast even on
  // first-call cold cache.
  const [scriptUrl, gatherUrl_, noResponseUrl] = await Promise.all([
    synthesizeAndUploadAudio(script),
    getCachedAudioUrl('outreach.gather', PROMPT_GATHER),
    getCachedAudioUrl('outreach.noResponse', PROMPT_NO_RESPONSE),
  ]);

  if (scriptUrl) response.play(scriptUrl);
  else response.say({ voice: 'Polly.Joanna' }, script);

  const gatherUrl = `${process.env.API_BASE_URL}/api/v1/webhooks/twilio/voice/conversation?attemptId=${encodeURIComponent(attemptId)}`;
  const gather = response.gather({
    input: ['speech'],
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    action: gatherUrl,
    method: 'POST',
    timeout: 8,
  });
  if (gatherUrl_) gather.play(gatherUrl_);
  else gather.say({ voice: 'Polly.Joanna' }, PROMPT_GATHER);

  if (noResponseUrl) response.play(noResponseUrl);
  else response.say({ voice: 'Polly.Joanna' }, PROMPT_NO_RESPONSE);

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

      const twiml = await buildConversationalTwiml(payload.script, payload.attemptId);

      await client.calls.create({
        to: payload.phone,
        from: fromNumber,
        twiml,
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ['completed'],
        statusCallbackMethod: 'POST',
      });

      return { status: 'pending' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Twilio voice error';
      logger.error({ err, attemptId: payload.attemptId }, '[outreach/voice] dispatch failed');
      return { status: 'failed', error: message };
    }
  }
}
