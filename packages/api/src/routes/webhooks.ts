import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../db';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { providerResponses } from '../db/schema/provider-responses';
import { providers } from '../db/schema/providers';
import { suppressionList } from '../db/schema/suppression-list';
import { buildWebhookToken } from '../services/outreach/web';
import { processProviderSpeech, getConversation } from '../services/outreach/voice-conversation';
import { processSmsReply } from '../services/outreach/sms-conversation';
import { recordProviderResponse } from '../services/providers/scores';
import { capturePayment } from '../services/stripe';
import { jobs } from '../db/schema/jobs';
import { homeowners } from '../db/schema/homeowners';
import { sendEmail, sendSms } from '../services/notifications';
import logger from '../logger';

const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

/** Notify homeowner via email when a provider submits a quote */
async function notifyHomeownerOfQuote(jobId: string, providerName: string, quotedPrice: string | null, availability: string | null, message: string | null): Promise<void> {
  try {
    const [job] = await db.select({ homeownerId: jobs.homeownerId, diagnosis: jobs.diagnosis }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return;

    const [homeowner] = await db.select({ email: homeowners.email, phone: homeowners.phone, firstName: homeowners.firstName }).from(homeowners).where(eq(homeowners.id, job.homeownerId)).limit(1);
    if (!homeowner) return;

    const diagnosis = job.diagnosis as { category?: string; summary?: string } | null;
    const category = diagnosis?.category ? diagnosis.category.charAt(0).toUpperCase() + diagnosis.category.slice(1) : 'Home Service';
    const name = homeowner.firstName ?? 'there';
    const quotesUrl = `${APP_URL}/account?tab=quotes`;

    const subject = `You got a quote! ${providerName}${quotedPrice ? ` quoted ${quotedPrice}` : ''}`;

    const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#F9F5F2">
      <div style="background:#2D2926;padding:20px 32px;text-align:center">
        <span style="color:#E8632B;font-size:24px;font-weight:700;font-family:Georgia,serif">homie</span>
      </div>
      <div style="background:white;padding:32px">
        <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">Hey ${name}!</p>
        <p style="color:#6B6560;font-size:14px;margin:0 0 24px">A provider responded to your ${category.toLowerCase()} request</p>

        <div style="background:#F9F5F2;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid rgba(0,0,0,0.04)">
          <div style="font-size:17px;font-weight:700;color:#2D2926;margin-bottom:12px">${providerName}</div>
          ${quotedPrice ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6B6560;font-size:14px">Estimated Price</span><span style="color:#E8632B;font-size:18px;font-weight:700">${quotedPrice}</span></div>` : ''}
          ${availability ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6B6560;font-size:14px">Availability</span><span style="color:#2D2926;font-size:14px;font-weight:600">${availability}</span></div>` : ''}
          ${message ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.06)"><span style="color:#9B9490;font-size:12px">Provider's note:</span><div style="color:#6B6560;font-size:14px;font-style:italic;margin-top:4px">"${message}"</div></div>` : ''}
        </div>

        <div style="text-align:center">
          <a href="${quotesUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">View All Quotes</a>
        </div>
      </div>
      <div style="padding:20px 32px;text-align:center">
        <p style="color:#9B9490;font-size:12px;margin:0">&copy; ${new Date().getFullYear()} Homie Technologies, Inc.</p>
      </div>
    </div>`;

    await sendEmail(homeowner.email, subject, html);
    logger.info(`[notification] Quote email sent to ${homeowner.email} for job ${jobId}`);

    // Also send SMS if homeowner has a phone number
    if (homeowner.phone) {
      const smsText = `Homie: ${providerName} responded to your ${category.toLowerCase()} request!${quotedPrice ? ` Quote: ${quotedPrice}.` : ''}${availability ? ` Available: ${availability}.` : ''} View all quotes: ${quotesUrl}`;
      await sendSms(homeowner.phone, smsText);
      logger.info(`[notification] Quote SMS sent to ${homeowner.phone} for job ${jobId}`);
    }
  } catch (err) {
    logger.error({ err }, `[notification] Failed to send quote email for job ${jobId}`);
  }
}

/** Capture authorized payment when first provider response comes in */
async function captureJobPayment(jobId: string): Promise<void> {
  try {
    const [job] = await db
      .select({ paymentStatus: jobs.paymentStatus, stripePaymentIntentId: jobs.stripePaymentIntentId })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (job?.paymentStatus === 'authorized' && job.stripePaymentIntentId) {
      await capturePayment(job.stripePaymentIntentId);
      await db.update(jobs).set({ paymentStatus: 'paid' }).where(eq(jobs.id, jobId));
      logger.info(`[payment] Captured payment for job ${jobId}`);
    }
  } catch (err) {
    logger.error({ err }, `[payment] Failed to capture payment for job ${jobId}`);
  }
}

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true if the Twilio signature header is valid. Fails closed if auth token is missing. */
function isTwilioRequestValid(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.warn('[webhooks] TWILIO_AUTH_TOKEN not set — rejecting webhook request');
    return false;
  }

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

/** Normalize raw speech/text price into clean dollar format. "150 dollars." → "$150", "two fifty" → "$250" */
function formatQuotedPrice(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[.,!?]+$/g, '').trim();

  // Already formatted: "$150", "$150-200", "$150 - $200"
  if (/^\$[\d]/.test(cleaned)) return cleaned;

  // "150 dollars", "200 bucks", plain "150"
  const numMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?|usd)?$/i);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
  }

  // Range: "150 to 200", "150-200", "150 - 200 dollars"
  const rangeMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?|usd)?$/i);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    return `$${Number.isInteger(low) ? low : low.toFixed(2)}-$${Number.isInteger(high) ? high : high.toFixed(2)}`;
  }

  // "about/around/approximately 150"
  const approxMatch = cleaned.match(/^(?:about|around|approximately|roughly|maybe|like)\s+\$?(\d+(?:\.\d+)?)/i);
  if (approxMatch) {
    const n = parseFloat(approxMatch[1]);
    return `~$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  }

  // Fallback: return cleaned with $ prefix if it starts with a digit
  if (/^\d/.test(cleaned)) return `$${cleaned.replace(/\s*(dollars?|bucks?|usd)\s*/gi, '')}`;

  return cleaned;
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

  // Emit tracking event for provider response
  try {
    const { emitTrackingEvent } = await import('../services/orchestration');
    const [prov] = await db.select({ name: providers.name, googleRating: providers.googleRating }).from(providers).where(eq(providers.id, providerId)).limit(1);
    const firstName = prov?.name?.split(' ')[0] ?? 'A provider';
    const initial = prov?.name?.split(' ').slice(1).map(n => n.charAt(0) + '.').join(' ') ?? '';
    void emitTrackingEvent(jobId, 'provider_responded', 'Quote Received',
      `${firstName} ${initial} has responded.`.trim(),
      { provider_name: `${firstName} ${initial}`.trim(), rating: prov?.googleRating ? `${prov.googleRating} ★` : undefined },
    );
  } catch { /* non-fatal */ }

  // Slack notification — fire-and-forget
  try {
    const [job] = await db.select({ workspaceId: jobs.workspaceId, diagnosis: jobs.diagnosis }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (job?.workspaceId) {
      const [prov] = await db.select({ name: providers.name }).from(providers).where(eq(providers.id, providerId)).limit(1);
      const diagnosis = job.diagnosis as { category?: string } | null;
      const { notifySlack } = await import('../services/slack-notifier');
      void notifySlack(job.workspaceId, 'provider_response', {
        jobId,
        providerId,
        providerName: prov?.name ?? 'A provider',
        message,
        category: diagnosis?.category ?? 'maintenance',
      });
    }
  } catch { /* Slack failure must not break response handling */ }

  // Record quote in repair_cost_data for cost estimation — fire-and-forget
  try {
    const [jobData] = await db.select({ diagnosis: jobs.diagnosis, zipCode: jobs.zipCode, workspaceId: jobs.workspaceId }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (jobData) {
      const diagnosis = jobData.diagnosis as { category?: string } | null;
      const category = diagnosis?.category ?? 'general';
      const { repairCostData } = await import('../db/schema/cost-estimates');
      void db.insert(repairCostData).values({
        jobId,
        workspaceId: jobData.workspaceId ?? undefined,
        zipCode: jobData.zipCode ?? undefined,
        category,
        subcategory: 'provider_quote',
        complexity: 'moderate',
        quotedPriceCents: undefined, // raw text quotes parsed later
        providerId,
        dataSource: 'outreach_quote',
        region: undefined,
      }).catch((err) => logger.error({ err }, '[webhooks] Failed to record quote in repair_cost_data'));
    }
  } catch { /* cost data recording must not break response handling */ }
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
          const normalizedPrice = formatQuotedPrice(state.quotedPrice);
          await db.insert(providerResponses).values({
            jobId: attempt.jobId,
            providerId: attempt.providerId,
            channel: 'voice',
            quotedPrice: normalizedPrice,
            availability: state.availability,
            message: state.notes,
          });

          // Emit tracking event
          try {
            const { emitTrackingEvent } = await import('../services/orchestration');
            const [prov] = await db.select({ name: providers.name, googleRating: providers.googleRating }).from(providers).where(eq(providers.id, attempt.providerId)).limit(1);
            const firstName = prov?.name?.split(' ')[0] ?? 'A provider';
            const initial = prov?.name?.split(' ').slice(1).map(n => n.charAt(0) + '.').join(' ') ?? '';
            void emitTrackingEvent(attempt.jobId, 'provider_responded', 'Quote Received',
              `${firstName} ${initial} has responded.`.trim(),
              { provider_name: `${firstName} ${initial}`.trim(), rating: prov?.googleRating ? `${prov.googleRating} ★` : undefined },
            );
          } catch { /* non-fatal */ }
        }

        const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
        void recordProviderResponse(attempt.providerId, responseTimeSec);
        if (state.accepted) {
          const normalizedPrice = formatQuotedPrice(state.quotedPrice);
          void captureJobPayment(attempt.jobId);
          const [prov] = await db.select({ name: providers.name }).from(providers).where(eq(providers.id, attempt.providerId)).limit(1);
          void notifyHomeownerOfQuote(attempt.jobId, prov?.name ?? 'A provider', normalizedPrice, state.availability, state.notes);
        }

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
    void captureJobPayment(attempt.jobId);
    const [ivrProv] = await db.select({ name: providers.name }).from(providers).where(eq(providers.id, attempt.providerId)).limit(1);
    void notifyHomeownerOfQuote(attempt.jobId, ivrProv?.name ?? 'A provider', null, null, 'Accepted via phone call');

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
// Uses conversational AI to collect quote details over multiple messages.

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
    .select({ id: providers.id, name: providers.name })
    .from(providers)
    .where(eq(providers.phone, From))
    .limit(1);

  if (!provider) {
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Handle STOP/opt-out keywords (Twilio compliance)
  const stopWords = ['stop', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt out'];
  if (stopWords.includes(Body.trim().toLowerCase())) {
    try {
      await db.insert(suppressionList).values({
        providerId: provider.id,
        reason: 'sms_stop',
      });
      logger.info(`[sms] Provider ${provider.name} opted out via STOP keyword`);
    } catch {
      // Already suppressed — ignore duplicate
    }
    twiml.message("You've been unsubscribed from Homie messages. You will no longer receive job requests from us. Reply START to re-subscribe.");
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Handle START/re-subscribe
  if (Body.trim().toLowerCase() === 'start') {
    try {
      await db.delete(suppressionList).where(eq(suppressionList.providerId, provider.id));
      logger.info(`[sms] Provider ${provider.name} re-subscribed via START keyword`);
    } catch { /* ignore */ }
    twiml.message("Welcome back! You've been re-subscribed to Homie job notifications. We'll reach out when there's a job in your area.");
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Handle HELP keyword
  if (Body.trim().toLowerCase() === 'help') {
    twiml.message("Homie connects homeowners with local service providers. Reply STOP to unsubscribe. For support, visit homiepro.ai or email support@homiepro.ai");
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Find their most recent pending or in-progress SMS attempt
  const [attempt] = await db
    .select()
    .from(outreachAttempts)
    .where(
      and(
        eq(outreachAttempts.providerId, provider.id),
        eq(outreachAttempts.channel, 'sms'),
        inArray(outreachAttempts.status, ['pending', 'responded']),
      ),
    )
    .orderBy(desc(outreachAttempts.attemptedAt))
    .limit(1);

  if (!attempt) {
    twiml.message("Thanks for reaching out! We don't have any active job requests for you right now. We'll be in touch when something comes up.");
    res.type('text/xml').send(twiml.toString());
    return;
  }

  logger.info({ from: From, body: Body, attemptId: attempt.id }, '[sms-conversation] Reply received');

  try {
    // Build job context from the script or job data
    let jobContext = attempt.scriptUsed ?? '';
    if (!jobContext) {
      const { jobs: jobsTable } = require('../db/schema/jobs');
      const [job] = await db.select({ diagnosis: jobsTable.diagnosis, zipCode: jobsTable.zipCode }).from(jobsTable).where(eq(jobsTable.id, attempt.jobId)).limit(1);
      if (job?.diagnosis) {
        const d = job.diagnosis as { category?: string; summary?: string };
        jobContext = `${d.category ?? 'home service'} job near ${job.zipCode}. ${d.summary ?? ''}`;
      }
    }

    const { response, state } = await processSmsReply(attempt.id, Body, jobContext, attempt.providerId);

    // Send AI response back via TwiML
    twiml.message(response);

    // Update attempt status based on conversation state
    if (state.phase === 'done') {
      const respondedAt = new Date();
      const newStatus = state.accepted ? 'accepted' : 'declined';

      await db
        .update(outreachAttempts)
        .set({ status: newStatus, responseRaw: JSON.stringify(state.messages), respondedAt })
        .where(eq(outreachAttempts.id, attempt.id));

      if (state.accepted) {
        const normalizedPrice = formatQuotedPrice(state.quotedPrice);
        await db.insert(providerResponses).values({
          jobId: attempt.jobId,
          providerId: attempt.providerId,
          channel: 'sms',
          quotedPrice: normalizedPrice,
          availability: state.availability,
          message: state.notes,
        });
        void captureJobPayment(attempt.jobId);
        void notifyHomeownerOfQuote(attempt.jobId, provider.name, normalizedPrice, state.availability, state.notes);

        // Emit tracking event
        try {
          const { emitTrackingEvent } = await import('../services/orchestration');
          const [provDetail] = await db.select({ googleRating: providers.googleRating }).from(providers).where(eq(providers.id, provider.id)).limit(1);
          const firstName = provider.name.split(' ')[0];
          const initial = provider.name.split(' ').slice(1).map(n => n.charAt(0) + '.').join(' ');
          void emitTrackingEvent(attempt.jobId, 'provider_responded', 'Quote Received',
            `${firstName} ${initial} has responded.`.trim(),
            { provider_name: `${firstName} ${initial}`.trim(), ...(provDetail?.googleRating ? { rating: `${provDetail.googleRating} ★` } : {}) },
          );
        } catch { /* non-fatal */ }
      }

      const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
      void recordProviderResponse(attempt.providerId, responseTimeSec);

      logger.info({ attemptId: attempt.id, accepted: state.accepted, quote: state.quotedPrice }, '[sms-conversation] Conversation complete');
    } else {
      // Mark as responded (in progress) so we can find it on next reply
      await db
        .update(outreachAttempts)
        .set({ status: 'responded', responseRaw: Body })
        .where(eq(outreachAttempts.id, attempt.id));
    }
  } catch (err) {
    logger.error({ err }, '[sms-conversation] Error processing reply');
    twiml.message("Thanks for your reply! Are you interested in this job? Reply YES or NO.");
  }

  res.type('text/xml').send(twiml.toString());
});

// ── POST /twilio/sms/status ──────────────────────────────────────────────────
// Called by Twilio with SMS delivery status updates (delivered, undelivered, failed).

router.post('/twilio/sms/status', async (req: Request, res: Response) => {
  if (!isTwilioRequestValid(req)) {
    res.status(403).send('Forbidden');
    return;
  }

  const attemptId = req.query.attemptId as string | undefined;
  if (!attemptId || !UUID_RE.test(attemptId)) {
    res.status(204).send();
    return;
  }

  const { MessageStatus, ErrorCode } = req.body as { MessageStatus?: string; ErrorCode?: string };

  const failedStatuses: Record<string, string> = {
    undelivered: 'failed',
    failed: 'failed',
  };

  const newStatus = MessageStatus ? failedStatuses[MessageStatus] : undefined;

  if (newStatus) {
    await db
      .update(outreachAttempts)
      .set({
        status: newStatus,
        responseRaw: `SMS ${MessageStatus}${ErrorCode ? ` (error: ${ErrorCode})` : ''}`,
        respondedAt: new Date(),
      })
      .where(
        and(eq(outreachAttempts.id, attemptId), eq(outreachAttempts.status, 'pending')),
      );

    logger.warn(`[sms-status] SMS ${MessageStatus} for attempt ${attemptId}${ErrorCode ? ` (error: ${ErrorCode})` : ''}`);
  } else if (MessageStatus === 'delivered') {
    logger.info(`[sms-status] SMS delivered for attempt ${attemptId}`);
  }

  res.status(204).send();
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

  const portalUrl = (process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000') + '/portal/login';

  if (action === 'decline') {
    const respondedAt = new Date();
    await db.update(outreachAttempts).set({ status: 'declined', respondedAt }).where(eq(outreachAttempts.id, attemptId));
    const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
    void recordProviderResponse(attempt.providerId, responseTimeSec);

    res.type('text/html').send(`<!DOCTYPE html>
<html>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:0;background:#F9F5F2">
  <div style="background:#2D2926;padding:20px;text-align:center">
    <span style="color:#E8632B;font-size:24px;font-weight:700;font-family:Georgia,serif">homie</span>
  </div>
  <div style="background:white;padding:48px 32px;text-align:center">
    <h1 style="color:#2D2926;font-size:24px;margin:0 0 12px">No problem!</h1>
    <p style="color:#6B6560;font-size:16px;margin:0 0 24px">We won't contact you about this job again. Thanks for your time.</p>
    <p style="color:#9B9490;font-size:13px;margin:0">Want to manage future Homie job opportunities?</p>
    <a href="${portalUrl}" style="display:inline-block;background:#E8632B;color:white;padding:10px 24px;border-radius:100px;text-decoration:none;font-size:14px;font-weight:600;margin-top:12px">Create Free Pro Account</a>
  </div>
</body>
</html>`);
    return;
  }

  // Accept — show quote form
  const [provider] = await db.select({ name: providers.name, phone: providers.phone, email: providers.email }).from(providers).where(eq(providers.id, attempt.providerId)).limit(1);
  const submitUrl = `${process.env.API_BASE_URL ?? 'https://api.homie.app'}/api/v1/webhooks/web/submit-quote`;

  res.type('text/html').send(`<!DOCTYPE html>
<html>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#F9F5F2">
  <div style="background:#2D2926;padding:20px;text-align:center">
    <span style="color:#E8632B;font-size:24px;font-weight:700;font-family:Georgia,serif">homie</span>
    <span style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;vertical-align:super">PRO</span>
  </div>
  <div style="background:white;padding:32px">
    <h1 style="color:#2D2926;font-size:22px;margin:0 0 8px">Great, you're interested!</h1>
    <p style="color:#6B6560;font-size:14px;margin:0 0 24px;line-height:1.5">Share your quote details below. The homeowner will see your response alongside other providers.</p>

    <form action="${submitUrl}" method="POST">
      <input type="hidden" name="attemptId" value="${attemptId}" />
      <input type="hidden" name="token" value="${token}" />

      <label style="display:block;font-size:13px;font-weight:600;color:#2D2926;margin-bottom:6px">Your Price Estimate</label>
      <label style="font-size:13px;font-weight:600;color:#2D2926;display:block;margin-bottom:6px">Quoted Price — Estimate</label>
      <input name="quoted_price" placeholder="e.g. $150-200" required inputmode="decimal" style="width:100%;padding:12px 16px;border-radius:10px;border:2px solid rgba(0,0,0,0.08);font-size:15px;margin-bottom:16px;box-sizing:border-box;outline:none" />

      <label style="display:block;font-size:13px;font-weight:600;color:#2D2926;margin-bottom:6px">Your Availability</label>
      <input name="availability" placeholder="e.g. Tomorrow 9-11 AM" required style="width:100%;padding:12px 16px;border-radius:10px;border:2px solid rgba(0,0,0,0.08);font-size:15px;margin-bottom:16px;box-sizing:border-box;outline:none" />

      <label style="display:block;font-size:13px;font-weight:600;color:#2D2926;margin-bottom:6px">Message to Homeowner <span style="color:#9B9490;font-weight:400">(optional)</span></label>
      <textarea name="message" placeholder="Any details, questions, or notes for the homeowner..." rows="3" style="width:100%;padding:12px 16px;border-radius:10px;border:2px solid rgba(0,0,0,0.08);font-size:15px;margin-bottom:24px;box-sizing:border-box;outline:none;resize:vertical;font-family:inherit"></textarea>

      <button type="submit" style="width:100%;padding:14px;border-radius:100px;border:none;background:#1B9E77;color:white;font-size:16px;font-weight:600;cursor:pointer">Submit Quote</button>
    </form>
  </div>

  <!-- Optional Pro Account -->
  <div style="background:white;padding:24px 32px;margin-top:2px;border-top:1px solid rgba(0,0,0,0.06)">
    <p style="color:#2D2926;font-size:15px;font-weight:600;margin:0 0 8px">Want to manage all your Homie jobs in one place?</p>
    <p style="color:#6B6560;font-size:13px;line-height:1.5;margin:0 0 16px">Create your free Homie Pro account to view incoming jobs, track your history, and manage your availability. It's 100% free — no fees, ever.</p>
    <a href="${portalUrl}" style="display:inline-block;background:#E8632B;color:white;padding:10px 24px;border-radius:100px;text-decoration:none;font-size:14px;font-weight:600">Create Free Pro Account</a>
  </div>

  <div style="padding:20px;text-align:center">
    <p style="color:#ccc;font-size:11px;margin:0">&copy; ${new Date().getFullYear()} Homie Technologies, Inc.</p>
  </div>
</body>
</html>`);
});

// ── POST /web/submit-quote ──────────────────────────────────────────────────
// Called when a provider submits the quote form after clicking Accept in email.

router.post('/web/submit-quote', async (req: Request, res: Response) => {
  const { attemptId, token, quoted_price, availability, message } = req.body as {
    attemptId?: string;
    token?: string;
    quoted_price?: string;
    availability?: string;
    message?: string;
  };

  if (!attemptId || !UUID_RE.test(attemptId) || !token) {
    res.status(400).send('Invalid request');
    return;
  }

  if (!isWebTokenValid(attemptId, 'accept', token)) {
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

  const respondedAt = new Date();

  await db
    .update(outreachAttempts)
    .set({ status: 'accepted', respondedAt })
    .where(eq(outreachAttempts.id, attemptId));

  await db.insert(providerResponses).values({
    jobId: attempt.jobId,
    providerId: attempt.providerId,
    channel: 'web',
    quotedPrice: quoted_price || null,
    availability: availability || null,
    message: message || null,
  });

  // Emit tracking event
  try {
    const { emitTrackingEvent } = await import('../services/orchestration');
    const [prov] = await db.select({ name: providers.name, googleRating: providers.googleRating }).from(providers).where(eq(providers.id, attempt.providerId)).limit(1);
    const firstName = prov?.name?.split(' ')[0] ?? 'A provider';
    const initial = prov?.name?.split(' ').slice(1).map(n => n.charAt(0) + '.').join(' ') ?? '';
    void emitTrackingEvent(attempt.jobId, 'provider_responded', 'Quote Received',
      `${firstName} ${initial} has responded.`.trim(),
      { provider_name: `${firstName} ${initial}`.trim(), rating: prov?.googleRating ? `${prov.googleRating} ★` : undefined },
    );
  } catch { /* non-fatal */ }

  const responseTimeSec = (respondedAt.getTime() - attempt.attemptedAt.getTime()) / 1000;
  void recordProviderResponse(attempt.providerId, responseTimeSec);
  void captureJobPayment(attempt.jobId);

  // Notify homeowner
  const [webProv] = await db.select({ name: providers.name }).from(providers).where(eq(providers.id, attempt.providerId)).limit(1);
  void notifyHomeownerOfQuote(attempt.jobId, webProv?.name ?? 'A provider', quoted_price || null, availability || null, message || null);

  const portalUrl = (process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000') + '/portal/login';

  res.type('text/html').send(`<!DOCTYPE html>
<html>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:0;background:#F9F5F2">
  <div style="background:#2D2926;padding:20px;text-align:center">
    <span style="color:#E8632B;font-size:24px;font-weight:700;font-family:Georgia,serif">homie</span>
  </div>
  <div style="background:white;padding:48px 32px;text-align:center">
    <div style="width:56px;height:56px;border-radius:50%;background:rgba(27,158,119,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
      <span style="color:#1B9E77;font-size:28px">&#10003;</span>
    </div>
    <h1 style="color:#2D2926;font-size:22px;margin:0 0 8px">Quote Submitted!</h1>
    <p style="color:#6B6560;font-size:15px;line-height:1.5;margin:0 0 8px">Your quote of <strong>${quoted_price || 'TBD'}</strong> has been sent to the homeowner.</p>
    <p style="color:#9B9490;font-size:13px;margin:0 0 24px">They'll be in touch if they'd like to move forward.</p>
    <a href="${portalUrl}" style="display:inline-block;background:#E8632B;color:white;padding:12px 28px;border-radius:100px;text-decoration:none;font-size:15px;font-weight:600">View in Homie Pro Portal</a>
  </div>
  <div style="padding:20px;text-align:center">
    <p style="color:#ccc;font-size:11px;margin:0">&copy; ${new Date().getFullYear()} Homie Technologies, Inc.</p>
  </div>
</body>
</html>`);
});

export default router;
