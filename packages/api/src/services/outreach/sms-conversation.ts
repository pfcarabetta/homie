import Anthropic from '@anthropic-ai/sdk';
import logger from '../../logger';

interface SmsConversationState {
  messages: { role: 'user' | 'assistant'; content: string }[];
  phase: 'interest' | 'quote' | 'availability' | 'notes' | 'done';
  accepted: boolean;
  quotedPrice: string | null;
  availability: string | null;
  notes: string | null;
  jobContext: string;
}

// In-memory state per provider phone (TTL: 30 minutes for SMS since responses are slower)
const conversations = new Map<string, { state: SmsConversationState; expiresAt: number }>();
const TTL_MS = 30 * 60 * 1000;

// Cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of conversations) {
    if (now > entry.expiresAt) conversations.delete(key);
  }
}, 5 * 60 * 1000);

export function getSmsConversation(attemptId: string): SmsConversationState | null {
  const entry = conversations.get(attemptId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.state;
}

export function initSmsConversation(attemptId: string, jobContext: string, initialMessage: string): SmsConversationState {
  const state: SmsConversationState = {
    messages: [{ role: 'assistant', content: initialMessage }],
    phase: 'interest',
    accepted: false,
    quotedPrice: null,
    availability: null,
    notes: null,
    jobContext,
  };
  conversations.set(attemptId, { state, expiresAt: Date.now() + TTL_MS });
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

When the conversation is DONE (after collecting notes or after a decline), include this at the end of your final message: "Manage your Homie jobs anytime at homiepro.ai/portal/login"

Respond with ONLY the text message to send. No formatting, no emojis unless natural.`;

export async function processSmsReply(
  attemptId: string,
  providerReply: string,
  jobContext?: string,
): Promise<{ response: string; state: SmsConversationState }> {
  let conv = getSmsConversation(attemptId);
  if (!conv) {
    conv = initSmsConversation(attemptId, jobContext ?? 'A home service job opportunity.', jobContext ?? 'Initial outreach sent.');
  }

  conv.messages.push({ role: 'user', content: providerReply });

  const lower = providerReply.toLowerCase().trim();

  // Check for decline
  const declineWords = ['no', 'not interested', 'busy', 'pass', 'decline', 'stop', 'remove', 'unsubscribe', 'nope', 'can\'t', 'cannot'];
  if (conv.phase === 'interest' && declineWords.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + ','))) {
    conv.phase = 'done';
    conv.accepted = false;
    const response = "No problem! Thanks for your time. We'll keep you in mind for future opportunities.";
    conv.messages.push({ role: 'assistant', content: response });
    conversations.set(attemptId, { state: conv, expiresAt: Date.now() + TTL_MS });
    return { response, state: conv };
  }

  // Phase detection
  const acceptWords = ['yes', 'yeah', 'yep', 'sure', 'interested', 'ok', 'okay', 'absolutely', 'definitely', 'i can', 'send', 'tell me more'];
  const isAccept = acceptWords.some(w => lower.includes(w));
  const isQuestion = ['?', 'what', 'who', 'how', 'why', 'where', 'when', 'is there', 'do i', 'cost', 'fee'].some(q => lower.includes(q));
  const hasPrice = /[\d$]/.test(providerReply);

  if (conv.phase === 'interest' && isAccept && !isQuestion) {
    conv.accepted = true;
    conv.phase = 'quote';
  } else if (conv.phase === 'quote' && hasPrice) {
    conv.quotedPrice = providerReply;
    conv.phase = 'availability';
  } else if (conv.phase === 'availability' && !isQuestion) {
    conv.availability = providerReply;
    conv.phase = 'notes';
  } else if (conv.phase === 'notes') {
    conv.notes = ['no', 'none', 'nope', 'n/a', 'nothing'].includes(lower) ? null : providerReply;
    conv.phase = 'done';
  }

  try {
    const client = new Anthropic();
    const result = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system: SYSTEM_PROMPT + `\n\nJob context: ${conv.jobContext}\nCurrent phase: ${conv.phase}. ${conv.phase === 'done' ? 'Thank them and say goodbye.' : ''}`,
      messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
    });

    const response = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim();

    conv.messages.push({ role: 'assistant', content: response });
    conversations.set(attemptId, { state: conv, expiresAt: Date.now() + TTL_MS });
    return { response, state: conv };
  } catch (err) {
    logger.error({ err }, '[sms-conversation] Claude error');

    let response: string;
    switch (conv.phase) {
      case 'quote': response = "Great, you're interested! What would you estimate for this job?"; break;
      case 'availability': response = 'Got it. When are you available?'; break;
      case 'notes': response = 'Thanks! Any notes for the homeowner? Reply "none" if not.'; break;
      case 'done': response = "Thanks! We'll pass your info to the homeowner. Manage all your Homie jobs at homiepro.ai/portal/login"; break;
      default: response = 'Thanks for getting back to us! Are you interested in this job? Reply YES or NO.';
    }
    conv.messages.push({ role: 'assistant', content: response });
    conversations.set(attemptId, { state: conv, expiresAt: Date.now() + TTL_MS });
    return { response, state: conv };
  }
}
