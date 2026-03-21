import Anthropic from '@anthropic-ai/sdk';
import logger from '../../logger';

interface ConversationState {
  messages: { role: 'user' | 'assistant'; content: string }[];
  phase: 'intro' | 'interest' | 'quote' | 'availability' | 'notes' | 'done';
  accepted: boolean;
  quotedPrice: string | null;
  availability: string | null;
  notes: string | null;
}

// In-memory conversation state per attempt (TTL: 10 minutes)
const conversations = new Map<string, { state: ConversationState; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000;

// Cleanup expired conversations every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of conversations) {
    if (now > entry.expiresAt) conversations.delete(key);
  }
}, 5 * 60 * 1000);

export function getConversation(attemptId: string): ConversationState | null {
  const entry = conversations.get(attemptId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.state;
}

function saveConversation(attemptId: string, state: ConversationState): void {
  conversations.set(attemptId, { state, expiresAt: Date.now() + TTL_MS });
}

export function initConversation(attemptId: string, jobScript: string): ConversationState {
  const state: ConversationState = {
    messages: [{ role: 'assistant', content: jobScript }],
    phase: 'interest',
    accepted: false,
    quotedPrice: null,
    availability: null,
    notes: null,
  };
  saveConversation(attemptId, state);
  return state;
}

const SYSTEM_PROMPT = `You are Homie's AI calling agent, making outreach calls to service providers about job opportunities. You are having a phone conversation.

RULES:
- Be professional, friendly, and brief — this is a phone call
- Keep responses to 1-2 sentences max
- Never make up information about the job — only share what was in the initial script
- Your goal is to determine if the provider is interested, and if so, collect their price estimate, availability, and any notes

CONVERSATION FLOW:
1. You already introduced the job opportunity (the initial script was read). Now determine if they're interested.
2. If they seem interested or say yes: ask for their estimated price for this job
3. After getting a price: ask when they're available
4. After getting availability: ask if they have any additional notes or questions for the homeowner
5. After notes (or if they say none): thank them and confirm you'll pass their info along

If they decline or aren't interested, thank them politely and say goodbye.

IMPORTANT: You must respond with ONLY what you would SAY on the phone. No actions, descriptions, or stage directions. Just the spoken words.`;

export async function processProviderSpeech(
  attemptId: string,
  providerSpeech: string,
): Promise<{ response: string; state: ConversationState }> {
  const conv = getConversation(attemptId);
  if (!conv) {
    return {
      response: "I'm sorry, I'm having trouble with this call. We'll try reaching you again. Goodbye.",
      state: { messages: [], phase: 'done', accepted: false, quotedPrice: null, availability: null, notes: null },
    };
  }

  conv.messages.push({ role: 'user', content: providerSpeech });

  // Check for decline intent
  const lower = providerSpeech.toLowerCase();
  const declineWords = ['no', 'not interested', 'busy', 'pass', 'decline', 'can\'t', 'cannot', 'nope'];
  if (conv.phase === 'interest' && declineWords.some(w => lower.includes(w))) {
    conv.phase = 'done';
    conv.accepted = false;
    const response = "No problem at all. Thank you for your time, and we'll keep you in mind for future opportunities. Have a great day!";
    conv.messages.push({ role: 'assistant', content: response });
    saveConversation(attemptId, conv);
    return { response, state: conv };
  }

  // Extract structured data from speech based on phase
  if (conv.phase === 'interest') {
    conv.accepted = true;
    conv.phase = 'quote';
  } else if (conv.phase === 'quote') {
    conv.quotedPrice = providerSpeech;
    conv.phase = 'availability';
  } else if (conv.phase === 'availability') {
    conv.availability = providerSpeech;
    conv.phase = 'notes';
  } else if (conv.phase === 'notes') {
    conv.notes = lower === 'no' || lower === 'none' || lower === 'nope' ? null : providerSpeech;
    conv.phase = 'done';
  }

  try {
    const client = new Anthropic();
    const result = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      system: SYSTEM_PROMPT + `\n\nCurrent phase: ${conv.phase}. ${conv.phase === 'done' ? 'Wrap up the call with a thank you and goodbye.' : ''}`,
      messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
    });

    const response = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim();

    conv.messages.push({ role: 'assistant', content: response });
    saveConversation(attemptId, conv);

    return { response, state: conv };
  } catch (err) {
    logger.error({ err }, '[voice-conversation] Claude error');
    // Fallback based on phase
    let response: string;
    switch (conv.phase) {
      case 'quote': response = "Great, you're interested! What would you estimate for this job?"; break;
      case 'availability': response = "Got it. When would you be available to do this work?"; break;
      case 'notes': response = "Thanks! Any other notes or questions for the homeowner?"; break;
      case 'done': response = "Thank you so much! We'll pass your information along to the homeowner. Have a great day!"; break;
      default: response = "Thank you for your time. Goodbye!";
    }
    conv.messages.push({ role: 'assistant', content: response });
    saveConversation(attemptId, conv);
    return { response, state: conv };
  }
}
