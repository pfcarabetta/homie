import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { signProviderToken } from '../../middleware/provider-auth';
import { db } from '../../db';
import { outreachAttempts } from '../../db/schema/outreach-attempts';
import logger from '../../logger';

const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

export interface SmsConversationState {
  messages: { role: 'user' | 'assistant'; content: string }[];
  phase: 'interest' | 'quote' | 'availability' | 'notes' | 'done';
  accepted: boolean;
  quotedPrice: string | null;
  availability: string | null;
  notes: string | null;
  jobContext: string;
  providerId: string;
}

// In-memory cache (fast path) — DB is the source of truth
const conversations = new Map<string, { state: SmsConversationState; expiresAt: number }>();
const TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of conversations) {
    if (now > entry.expiresAt) conversations.delete(key);
  }
}, 5 * 60 * 1000);

function getCached(attemptId: string): SmsConversationState | null {
  const entry = conversations.get(attemptId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.state;
}

function setCache(attemptId: string, state: SmsConversationState): void {
  conversations.set(attemptId, { state, expiresAt: Date.now() + TTL_MS });
}

async function loadFromDb(attemptId: string): Promise<SmsConversationState | null> {
  try {
    const [row] = await db
      .select({ conversationState: outreachAttempts.conversationState })
      .from(outreachAttempts)
      .where(eq(outreachAttempts.id, attemptId))
      .limit(1);
    if (row?.conversationState) {
      const state = row.conversationState as SmsConversationState;
      setCache(attemptId, state);
      return state;
    }
  } catch (err) {
    logger.warn({ err }, '[sms-conversation] Failed to load state from DB');
  }
  return null;
}

async function persistToDb(attemptId: string, state: SmsConversationState): Promise<void> {
  try {
    await db
      .update(outreachAttempts)
      .set({ conversationState: state })
      .where(eq(outreachAttempts.id, attemptId));
  } catch (err) {
    logger.warn({ err }, '[sms-conversation] Failed to persist state to DB');
  }
}

export function getSmsConversation(attemptId: string): SmsConversationState | null {
  return getCached(attemptId);
}

export function initSmsConversation(attemptId: string, jobContext: string, initialMessage: string, providerId: string): SmsConversationState {
  const state: SmsConversationState = {
    messages: [{ role: 'assistant', content: initialMessage }],
    phase: 'interest',
    accepted: false,
    quotedPrice: null,
    availability: null,
    notes: null,
    jobContext,
    providerId,
  };
  setCache(attemptId, state);
  return state;
}

const SYSTEM_PROMPT = `You are Homie's AI assistant, communicating with a service provider via text message about a job opportunity.

ABOUT HOMIE:
- Homie connects homeowners with local service providers
- 100% free for providers — no fees ever
- Homeowner pays the provider directly
- Providers are found through public business listings

RULES:
- Keep messages SHORT — this is SMS, max 2-3 sentences
- Be friendly but professional
- Your goal: determine interest, then collect price estimate, availability, and any notes
- If they ask questions about Homie, answer briefly then redirect to the job
- Never make up job details beyond what's in the context

CONVERSATION FLOW:
1. Initial message already sent. Determine if they're interested.
2. If interested → ask for their price estimate
3. After price → ask about availability
4. After availability → ask if any notes for the homeowner
5. After notes → thank them and confirm

If they decline, thank them politely.

When the conversation is DONE (after collecting notes or after a decline), include the portal link that will be provided in the system context at the end of your message.

Respond with ONLY the text message to send. No formatting, no emojis unless natural.`;

export async function processSmsReply(
  attemptId: string,
  providerReply: string,
  jobContext?: string,
  providerId?: string,
): Promise<{ response: string; state: SmsConversationState }> {
  // Try memory cache first, then DB, then initialize fresh
  let conv = getCached(attemptId);
  if (!conv) {
    conv = await loadFromDb(attemptId);
  }
  if (!conv) {
    conv = initSmsConversation(attemptId, jobContext ?? 'A home service job opportunity.', jobContext ?? 'Initial outreach sent.', providerId ?? '');
  }

  conv.messages.push({ role: 'user', content: providerReply });

  const lower = providerReply.toLowerCase().trim();

  const portalLink = conv.providerId ? `${APP_URL}/portal/login?token=${signProviderToken(conv.providerId)}` : `${APP_URL}/portal/login`;

  // Check for decline
  const declineWords = ['no', 'not interested', 'busy', 'pass', 'decline', 'stop', 'remove', 'unsubscribe', 'nope', 'can\'t', 'cannot'];
  if (conv.phase === 'interest' && declineWords.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + ','))) {
    conv.phase = 'done';
    conv.accepted = false;
    const response = `No problem! Thanks for your time. Manage future Homie jobs anytime: ${portalLink}`;
    conv.messages.push({ role: 'assistant', content: response });
    setCache(attemptId, conv);
    void persistToDb(attemptId, conv);
    return { response, state: conv };
  }

  // Phase detection
  const acceptWords = ['yes', 'yeah', 'yep', 'sure', 'interested', 'ok', 'okay', 'absolutely', 'definitely', 'i can', 'send', 'tell me more'];
  const isAccept = acceptWords.some(w => lower.includes(w));
  const isQuestion = ['?', 'what', 'who', 'how', 'why', 'where', 'when', 'is there', 'do i', 'cost', 'fee'].some(q => lower.includes(q));
  const hasPrice = /\$\d/.test(providerReply) || /(?:^|\s)(\d{2,5})(?:\s*(?:dollars?|bucks?|per|flat|total|each)|\s*$)/i.test(providerReply);
  const hasFreeEstimate = /free estimate|no (?:service )?(?:fee|charge|cost)|on[- ]?site (?:assessment|evaluation)|need to (?:see|assess|look)/i.test(providerReply);
  const hasAvailability = /available|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|24\/7|next week|this week|morning|afternoon|evening|asap|right away|schedule/i.test(lower);

  if (conv.phase === 'interest' && isAccept && !isQuestion) {
    conv.accepted = true;
    conv.phase = 'quote';
    // Check if they also included price or availability in the same message
    if (hasPrice) {
      conv.quotedPrice = providerReply;
      conv.phase = 'availability';
    } else if (hasFreeEstimate) {
      conv.quotedPrice = 'Free estimate';
      conv.phase = 'availability';
    }
    if (conv.phase === 'availability' && hasAvailability) {
      conv.availability = providerReply;
      conv.phase = 'notes';
    }
  } else if (conv.phase === 'quote') {
    if (hasPrice && !isQuestion) {
      conv.quotedPrice = providerReply;
      conv.phase = 'availability';
    } else if (hasFreeEstimate) {
      conv.quotedPrice = 'Free estimate';
      conv.phase = 'availability';
    }
    // If they skipped price but gave availability, advance both
    if (conv.phase === 'availability' && hasAvailability) {
      conv.availability = providerReply;
      conv.phase = 'notes';
    }
  } else if (conv.phase === 'availability' && !isQuestion) {
    conv.availability = providerReply;
    conv.phase = 'notes';
  } else if (conv.phase === 'notes') {
    conv.notes = ['no', 'none', 'nope', 'n/a', 'nothing'].includes(lower) ? null : providerReply;
    conv.phase = 'done';
  }

  // Stuck phase detection: if we've exchanged 6+ messages and phase hasn't reached 'done',
  // auto-complete with whatever we have — the provider has clearly engaged
  if (conv.phase !== 'done' && conv.accepted && conv.messages.length >= 8) {
    logger.info(`[sms-conversation] Auto-completing stuck conversation for attempt ${attemptId} (phase: ${conv.phase}, messages: ${conv.messages.length})`);
    conv.phase = 'done';
  }

  try {
    const client = new Anthropic();
    const result = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system: SYSTEM_PROMPT + `\n\nJob context: ${conv.jobContext}\nCurrent phase: ${conv.phase}. ${conv.phase === 'done' ? `Thank them and include this portal link at the end: ${portalLink}` : ''}`,
      messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
    });

    const response = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim();

    conv.messages.push({ role: 'assistant', content: response });
    setCache(attemptId, conv);
    void persistToDb(attemptId, conv);
    return { response, state: conv };
  } catch (err) {
    logger.error({ err }, '[sms-conversation] Claude error');

    let response: string;
    switch (conv.phase) {
      case 'quote': response = "Great, you're interested! What would you estimate for this job?"; break;
      case 'availability': response = 'Got it. When are you available?'; break;
      case 'notes': response = 'Thanks! Any notes for the homeowner? Reply "none" if not.'; break;
      case 'done': response = `Thanks! We'll pass your info to the homeowner. Manage your Homie jobs: ${portalLink}`; break;
      default: response = 'Thanks for getting back to us! Are you interested in this job? Reply YES or NO.';
    }
    conv.messages.push({ role: 'assistant', content: response });
    setCache(attemptId, conv);
    void persistToDb(attemptId, conv);
    return { response, state: conv };
  }
}
