import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { providerResponses } from '../db/schema/provider-responses';
import { providers } from '../db/schema/providers';
import { buildWebhookToken } from '../services/outreach/web';
import { processProviderSpeech, getConversation } from '../services/outreach/voice-conversation';
import { recordProviderResponse } from '../services/providers/scores';
import logger from '../logger';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true if the Twilio signature header is valid (or if auth token is not configured). */
function isTwilioRequestValid(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true; // Skip validation in development

  const signature = req.headers['x-twilio-signature'] as string | undefined;
  if (!signature) return false;

  const url = `${process.env.API_BASE_URL}${req.originalUrl}`;
  return twilio.validateRequest(authToken, signature, url, req.body as Record<string, string>);
}

/** Returns true if the HMAC token in the web respond URL is valid. */
function isWebTokenValid(attemptId: string, action: string, token: string): boolean {
  const secret = process.env.WEBHOOK_SECRET ?? '';
  const expected = buildWebhookToken(attemptId, action);
  // timingSafeEqual requires equal-length Buffers
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(token, 'hex');
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

const ACCEPT_REPLIES = new Set(['yes', 'y', '1', 'accept', 'ok', 'sure', 'yep', 'yeah']);
const DECLINE_REPLIES = new Set(['no', 'n', '2', 'decline', 'busy', 'nope', 'pass', 'cant', "can't"]);

function parseSmsReply(body: string): 'accepted' | 'declined' | 'responded' {
  const normalized = body.trim().toLowerCase().replace(/[^a-z0-9']/g, '');
  if (ACCEPT_REPLIES.has(normalized)) return 'accepted';
  if (DECLINE_REPLIES.has(normalized)) return 'declined';
  return 'responded'; // Ambiguous reply — treat as a message from the provider
}

async function createProviderResponse(
  attemptId: string,
  jobId: string,
  providerId: string,
  channel: string,
  message: string | null,
): Promise<void> {
  await db.insert(providerResponses).values({
    jobId,
    providerId,
    outreachAttemptId: attemptId,
    channel,
    message,
  });
}

// ── POST /twilio/voice/conversation ──────────────────────────────────────────
// Called by Twilio with speech transcription during a conversational AI call.

router.post('/twilio/voice/conversation', async (req: Request, res: Response) => {
  if (!isTwilioRequestValid(req)) {
    res.status(403).send('Forbidden');
    return;
  }

  const attemptId = req.query.attemptId as string | undefined;
  if (!attemptId || !UUID_RE.test(attemptId)) {
    res.status(400).send('Invalid attemptId');
    return;
  }

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const { SpeechResult } = req.body as { SpeechResult?: string };

  if (!SpeechResult) {
    twiml.say({ voice: 'Polly.Joanna' }, "I didn't catch that. Could you repeat that?");
    const gatherUrl = `${process.env.API_BASE_URL}/api/v1/webhooks/twilio/voice/conversation?attemptId=${encodeURIComponent(attemptId)}`;
    twiml.gather({ input: ['speech'], speechTimeout: 'auto', speechModel: 'phone_call', action: gatherUrl, method: 'POST', timeout: 8 });
    twiml.say({ voice: 'Polly.Joanna' }, "I'm still here if you'd like to respond. Goodbye.");
    res.type('text/xml').send(twiml.toString());
    return;
  }

  logger.info({ attemptId, speech: SpeechResult }, '[voice-conversation] Provider speech received');

  try {
    // Build job context for conversation initialization
    let jobContext: string | undefined;
    const existingConv = getConversation(attemptId);
    if (!existingConv) {
      const [attempt] = await db
        .select({ jobId: outreachAttempts.jobId, script: outreachAttempts.scriptUsed })
        .from(outreachAttempts)
        .where(eq(outreachAttempts.id, attemptId))
        .limit(1);
      if (attempt?.script) {
        jobContext = attempt.script;
      } else if (attempt?.jobId) {
        const { jobs } = require('../db/schema/jobs');
        const [job] = await db.select({ diagnosis: jobs.diagnosis, zipCode: jobs.zipCode }).from(jobs).where(eq(jobs.id, attempt.jobId)).limit(1);
        if (job?.diagnosis) {
          const d = job.diagnosis as { category?: string; summary?: string };
          jobContext = `${d.category ?? 'home service'} job near ${job.zipCode}. ${d.summary ?? ''}`;
        }
      }
    }

    const { response, state } = await processProviderSpeech(attemptId, SpeechResult, jobContext);

    twiml.say({ voice: 'Polly.Joanna' }, response);

    if (state.phase !== 'done') {
      // Continue conversation — gather more speech
      const gatherUrl = `${process.env.API_BASE_URL}/api/v1/webhooks/twilio/voice/conversation?attemptId=${encodeURIComponent(attemptId)}`;
      twiml.gather({ input: ['speech'], speechTimeout: 'auto', speechModel: 'phone_call', action: gatherUrl, method: 'POST', timeout: 10 });
      twiml.say({ voice: 'Polly.Joanna' }, "Are you still there? I'll let you go. Goodbye.");
    } else {
      // Conversation complete — update the outreach attempt
      const [attempt] = await db
        .select()
        .from(outreachAttempts)
        .where(eq(outreachAttempts.id, attemptId))
        .limit(1);

      if (attempt) {
        const respondedAt = new Date();
        const newStatus = state.accepted ? 'accepted' : 'declined';

        await db
          .update(outreachAttempts)
          .set({ status: newStatus, respondedAt, responseRaw: JSON.stringify(state.messages) })
          .where(eq(outreachAttempts.id, attemptId));

        if (state.accepted) {
          await db.insert(providerResponses).values({
            jobId: attempt.jobId,
            providerId: attempt.providerId,
            channel: 'voice',
            quotedPrice: state.quotedPrice,
            availability: state.availability,
            message: state.notes,
          });
        }

        const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
        void recordProviderResponse(attempt.providerId, responseTimeSec);

        logger.info({ attemptId, accepted: state.accepted, quote: state.quotedPrice, availability: state.availability }, '[voice-conversation] Conversation complete');
      }

      twiml.hangup();
    }
  } catch (err) {
    logger.error({ err, attemptId }, '[voice-conversation] Error processing speech');
    twiml.say({ voice: 'Polly.Joanna' }, "I'm sorry, I'm having technical difficulties. We'll try reaching you again. Goodbye.");
    twiml.hangup();
  }

  res.type('text/xml').send(twiml.toString());
});

// ── POST /twilio/voice/gather ─────────────────────────────────────────────────
// Called by Twilio when the provider presses a digit during the IVR call.

router.post('/twilio/voice/gather', async (req: Request, res: Response) => {
  if (!isTwilioRequestValid(req)) {
    res.status(403).send('Forbidden');
    return;
  }

  const attemptId = req.query.attemptId as string | undefined;
  if (!attemptId || !UUID_RE.test(attemptId)) {
    res.status(400).send('Invalid attemptId');
    return;
  }

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const { Digits } = req.body as { Digits?: string };

  const [attempt] = await db
    .select()
    .from(outreachAttempts)
    .where(eq(outreachAttempts.id, attemptId))
    .limit(1);

  if (!attempt) {
    twiml.say({ voice: 'alice' }, 'Sorry, we could not locate this request. Goodbye.');
    res.type('text/xml').send(twiml.toString());
    return;
  }

  if (Digits === '1') {
    // Provider accepted
    const respondedAt = new Date();
    await db
      .update(outreachAttempts)
      .set({ status: 'accepted', respondedAt })
      .where(eq(outreachAttempts.id, attemptId));

    await createProviderResponse(
      attemptId,
      attempt.jobId,
      attempt.providerId,
      'voice',
      'Accepted via IVR (pressed 1)',
    );

    const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
    void recordProviderResponse(attempt.providerId, responseTimeSec);

    twiml.say({ voice: 'alice' }, 'Thank you for accepting! A homeowner will be in touch shortly. Goodbye.');
  } else if (Digits === '2') {
    // Provider declined
    const respondedAt = new Date();
    await db
      .update(outreachAttempts)
      .set({ status: 'declined', respondedAt })
      .where(eq(outreachAttempts.id, attemptId));

    const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
    void recordProviderResponse(attempt.providerId, responseTimeSec);

    twiml.say({ voice: 'alice' }, 'No problem. We will not contact you about this job again. Goodbye.');
  } else {
    // Unexpected digit
    twiml.say({ voice: 'alice' }, 'We did not recognize your input. Please call us back if you are interested. Goodbye.');
  }

  res.type('text/xml').send(twiml.toString());
});

// ── POST /twilio/voice/status ─────────────────────────────────────────────────
// Called by Twilio when the call ends. Used to detect no-answer / busy / failed.

router.post('/twilio/voice/status', async (req: Request, res: Response) => {
  if (!isTwilioRequestValid(req)) {
    res.status(403).send('Forbidden');
    return;
  }

  const attemptId = req.query.attemptId as string | undefined;
  if (!attemptId || !UUID_RE.test(attemptId)) {
    res.status(400).send('Invalid attemptId');
    return;
  }

  const { CallStatus, CallDuration } = req.body as { CallStatus?: string; CallDuration?: string };

  // Only update for terminal non-answer statuses — gather already handles 'completed' calls
  const terminalStatuses: Record<string, string> = {
    'no-answer': 'no_answer',
    busy: 'no_answer',
    failed: 'failed',
    canceled: 'failed',
  };

  const newStatus = CallStatus ? terminalStatuses[CallStatus] : undefined;
  if (newStatus) {
    await db
      .update(outreachAttempts)
      .set({
        status: newStatus,
        durationSec: CallDuration ?? null,
        respondedAt: new Date(),
      })
      .where(
        and(eq(outreachAttempts.id, attemptId), eq(outreachAttempts.status, 'pending')),
      );
  }

  res.status(204).send();
});

// ── POST /twilio/sms ──────────────────────────────────────────────────────────
// Called by Twilio when a provider replies to an outreach SMS.

router.post('/twilio/sms', async (req: Request, res: Response) => {
  if (!isTwilioRequestValid(req)) {
    res.status(403).send('Forbidden');
    return;
  }

  const { From, Body } = req.body as { From?: string; Body?: string };

  const MessagingResponse = twilio.twiml.MessagingResponse;
  const twiml = new MessagingResponse();

  if (!From || !Body) {
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Find the provider by phone number
  const [provider] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.phone, From))
    .limit(1);

  if (!provider) {
    // Unknown sender — ignore silently
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Find their most recent pending SMS attempt
  const [attempt] = await db
    .select()
    .from(outreachAttempts)
    .where(
      and(
        eq(outreachAttempts.providerId, provider.id),
        eq(outreachAttempts.channel, 'sms'),
        eq(outreachAttempts.status, 'pending'),
      ),
    )
    .limit(1);

  if (!attempt) {
    res.type('text/xml').send(twiml.toString());
    return;
  }

  const intent = parseSmsReply(Body);
  const respondedAt = new Date();

  await db
    .update(outreachAttempts)
    .set({ status: intent, responseRaw: Body, respondedAt })
    .where(eq(outreachAttempts.id, attempt.id));

  if (intent === 'accepted' || intent === 'responded') {
    await createProviderResponse(
      attempt.id,
      attempt.jobId,
      attempt.providerId,
      'sms',
      Body,
    );
  }

  const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
  void recordProviderResponse(attempt.providerId, responseTimeSec);

  res.type('text/xml').send(twiml.toString());
});

// ── GET /web/respond ──────────────────────────────────────────────────────────
// Called when a provider clicks Accept or Decline in the outreach email.

router.get('/web/respond', async (req: Request, res: Response) => {
  const { attemptId, action, token } = req.query as Record<string, string | undefined>;

  if (!attemptId || !UUID_RE.test(attemptId) || !action || !token) {
    res.status(400).send('Invalid request');
    return;
  }
  if (action !== 'accept' && action !== 'decline') {
    res.status(400).send('Invalid action');
    return;
  }

  if (!isWebTokenValid(attemptId, action, token)) {
    res.status(403).send('Forbidden');
    return;
  }

  const [attempt] = await db
    .select()
    .from(outreachAttempts)
    .where(eq(outreachAttempts.id, attemptId))
    .limit(1);

  if (!attempt) {
    res.status(404).send('Not found');
    return;
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  const respondedAt = new Date();

  await db
    .update(outreachAttempts)
    .set({ status: newStatus, respondedAt })
    .where(eq(outreachAttempts.id, attemptId));

  if (action === 'accept') {
    await createProviderResponse(
      attemptId,
      attempt.jobId,
      attempt.providerId,
      'web',
      'Accepted via email link',
    );
  }

  const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
  void recordProviderResponse(attempt.providerId, responseTimeSec);

  const title = action === 'accept' ? 'Job Accepted!' : 'Job Declined';
  const message =
    action === 'accept'
      ? 'Thank you! The homeowner will be in touch with you shortly.'
      : 'No problem. We will remove you from this job request.';

  res.type('text/html').send(`<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;padding:24px">
  <h1 style="color:#1a1a1a">${title}</h1>
  <p style="color:#555;font-size:18px">${message}</p>
  <p style="color:#888;font-size:13px;margin-top:48px">Powered by Homie</p>
</body>
</html>`);
});

export default router;
